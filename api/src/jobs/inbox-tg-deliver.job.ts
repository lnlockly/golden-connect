/**
 * Inbox → Telegram delivery worker.
 *
 * Polls notifications_inbox for rows where delivered_tg=false and pushes
 * them to the user's Telegram via @Golden Connect_bizbot. After successful send
 * (or blocked-by-user), marks delivered_tg=true so we don't resend.
 *
 * Runs every minute. Batches 50 rows per tick to keep the worker bounded.
 *
 * UNIFIED notification system: notifications_inbox is the single source
 * of truth. Site reads via /api/notifications. This worker is only
 * responsible for fan-out to TG.
 *
 * Self-registers via scheduler at module import.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tgSendMessage } from '../services/tg-send.js';
import { logger } from '../lib/logger.js';
import { registerJob } from './scheduler.js';

const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

const SEVERITY_EMOJI: Record<string, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '🚨',
};

interface InboxRow {
  id: number | string;
  user_id: number;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  url: string | null;
  tg_id: number | null;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
}

function formatTgMessage(row: InboxRow): string {
  const emoji = SEVERITY_EMOJI[row.severity] || 'ℹ️';
  const lines: string[] = [`${emoji} <b>${escapeHtml(row.title)}</b>`];
  if (row.body && row.body.trim()) {
    lines.push('', escapeHtml(row.body));
  }
  return lines.join('\n');
}

function buildReplyMarkup(row: InboxRow) {
  if (!row.url) return undefined;
  const fullUrl = row.url.startsWith('http')
    ? row.url
    : `https://golden-connect.to${row.url.startsWith('/') ? '' : '/'}${row.url}`;
  return { inline_keyboard: [[{ text: 'Открыть в кабинете →', url: fullUrl }]] };
}

async function processInboxTgQueue(): Promise<void> {
  let sent = 0, blocked = 0, errors = 0, skipped = 0;

  const rows = (await db.execute(sql`
    SELECT i.id, i.user_id, i.kind, i.severity, i.title, i.body, i.url, u.tg_id
    FROM notifications_inbox i
    JOIN users u ON u.id = i.user_id
    WHERE i.delivered_tg = false
    ORDER BY i.created_at ASC
    LIMIT 50
  `)) as unknown as InboxRow[];

  if (rows.length === 0) return;

  for (const row of rows) {
    if (!row.tg_id) {
      // No TG link — cabinet-only delivery. Mark as delivered to skip future ticks.
      await db.execute(sql`
        UPDATE notifications_inbox SET delivered_tg = true
        WHERE id = ${Number(row.id)}
      `);
      skipped++;
      continue;
    }

    const text = formatTgMessage(row);
    const result = await tgSendMessage(row.tg_id, text, {
      parseMode: 'HTML',
      disableWebPagePreview: true,
      replyMarkup: buildReplyMarkup(row),
    });

    if (result.ok) {
      await db.execute(sql`
        UPDATE notifications_inbox SET delivered_tg = true
        WHERE id = ${Number(row.id)}
      `);
      sent++;
    } else if (result.blocked) {
      await db.execute(sql`
        UPDATE notifications_inbox SET delivered_tg = true,
          meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object('tg_blocked', true)
        WHERE id = ${Number(row.id)}
      `);
      blocked++;
    } else {
      // Transient error — retry next tick. Track attempts in meta.
      const updated = (await db.execute(sql`
        UPDATE notifications_inbox
        SET meta = jsonb_set(
          COALESCE(meta, '{}'::jsonb),
          '{tg_attempts}',
          to_jsonb(COALESCE((meta->>'tg_attempts')::int, 0) + 1)
        )
        WHERE id = ${Number(row.id)}
        RETURNING (meta->>'tg_attempts')::int AS attempts
      `)) as unknown as Array<{ attempts: number }>;

      if ((updated[0]?.attempts ?? 0) >= MAX_ATTEMPTS) {
        await db.execute(sql`
          UPDATE notifications_inbox
          SET delivered_tg = true,
            meta = COALESCE(meta, '{}'::jsonb) || jsonb_build_object(
              'tg_failed_permanent', true,
              'tg_last_error', ${result.error || 'unknown'}
            )
          WHERE id = ${Number(row.id)}
        `);
        logger.warn({ rowId: row.id, error: result.error }, 'inbox-tg: gave up after MAX_ATTEMPTS');
      }
      errors++;
    }
  }

  if (sent > 0 || blocked > 0 || errors > 0 || skipped > 0) {
    logger.info({ sent, blocked, errors, skipped, total: rows.length }, 'inbox-tg: tick');
  }
}

registerJob({
  name: 'inbox-tg-deliver',
  // Every minute. Tight cadence keeps notifications snappy without overwhelming TG.
  schedule: '* * * * *',
  handler: processInboxTgQueue,
});

logger.info('inbox-tg: worker registered (every minute)');
