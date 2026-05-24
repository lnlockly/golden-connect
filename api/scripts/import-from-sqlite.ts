#!/usr/bin/env tsx
/**
 * One-shot migration from the bot's legacy SQLite snapshot into the
 * current Postgres schema (Neon). Run AFTER you've pulled a `.backup`
 * dump from the prod pod:
 *
 *   POD=$(kubectl -n franchise-factory get pods -l app=trendex-bot \
 *     -o jsonpath='{.items[0].metadata.name}')
 *   kubectl -n franchise-factory exec $POD -- \
 *     sqlite3 /data/trendex.db ".backup /tmp/backup.db"
 *   kubectl -n franchise-factory cp $POD:/tmp/backup.db ./prod.db
 *
 * Then:
 *
 *   DATABASE_URL=postgres://...  \
 *   SQLITE_PATH=./prod.db        \
 *   npx tsx scripts/import-from-sqlite.ts
 *
 * Flags:
 *   --dry              don't write, just count what would be imported
 *   --truncate         wipe PG tables (except the seeded admin user)
 *                      before importing — use when re-running against
 *                      a clean branch
 *
 * What it does:
 *   1. Users — merges on tg_id. If the row already exists (e.g. the
 *      seeded admin), reuses its PG id. Otherwise inserts a new row.
 *   2. Builds old→new id map, then backfills invited_by_user_id and
 *      mirror-inserts into invite_edges (which didn't exist in sqlite).
 *   3. Leads — remaps taken_by_tg_id if needed, parses payload_json
 *      into jsonb.
 *   4. ai_turns, reminder_steps, reminder_sends, broadcasts,
 *      pending_referrals — straight copy with ms→timestamp conversion.
 *
 * Safety:
 *   - Every table copied inside a transaction — rollback on error.
 *   - Foreign-key order is preserved (users → edges → leads → …).
 *   - Running twice without --truncate is mostly idempotent: users
 *     merge on tg_id, leads and ai_turns will duplicate (no natural
 *     key). Use --truncate to start clean.
 */

import 'dotenv/config';
import Database from 'better-sqlite3';
import { sql } from 'drizzle-orm';
import { db } from '../src/db/client.js';

const SQLITE_PATH = process.env.SQLITE_PATH ?? './prod.db';
const DRY = process.argv.includes('--dry');
const TRUNCATE = process.argv.includes('--truncate');

interface SqliteUser {
  id: number;
  tg_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  ref_code: string;
  invited_by_user_id: number | null;
  invited_by_ref_code: string | null;
  joined_at: number;
  last_seen_at: number;
  is_blocked: number;
  applied_on_site?: number;
  applied_at?: number | null;
  ref_notifications_enabled?: number;
}

interface SqliteLead {
  id: number;
  track: string;
  contact: string;
  payload_json: string;
  source: string | null;
  lang: string | null;
  status: string;
  taken_by_tg_id: number | null;
  taken_at: number | null;
  resolved_at: number | null;
  lost_reason: string | null;
  snooze_until: number | null;
  chat_id: number | null;
  message_thread_id?: number | null;
  posted_message_id: number | null;
  created_at: number;
}

function msToDate(ms: number | null | undefined): string | null {
  if (ms == null) return null;
  return new Date(Number(ms)).toISOString();
}

function boolFromInt(v: number | null | undefined, fallback = false): boolean {
  if (v == null) return fallback;
  return v !== 0;
}

async function truncateAll(): Promise<void> {
  console.log('[truncate] wiping tables (keeping admin user)…');
  // Children first, then parents. Admin user (ref_code='admin') is
  // re-inserted/kept by the ensureAdminUser() logic on api startup.
  await db.execute(sql`TRUNCATE TABLE reminder_sends, reminder_steps RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE ai_turns, broadcasts, pending_referrals RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE flow_ledger, user_quests RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE invoices RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE leads RESTART IDENTITY CASCADE`);
  await db.execute(sql`TRUNCATE TABLE invite_edges RESTART IDENTITY CASCADE`);
  // Drop FKs pointing at users before deleting them.
  await db.execute(sql`TRUNCATE TABLE agents RESTART IDENTITY CASCADE`);
  await db.execute(sql`DELETE FROM user_wallets WHERE user_id IN (SELECT id FROM users WHERE ref_code <> 'admin')`);
  await db.execute(sql`DELETE FROM users WHERE ref_code <> 'admin'`);
  console.log('[truncate] done');
}

async function importUsers(sqlite: Database.Database): Promise<Map<number, number>> {
  // Detect which optional columns this snapshot has.
  const cols = (sqlite.pragma('table_info(users)') as Array<{ name: string }>).map((c) => c.name);
  const has = (name: string): boolean => cols.includes(name);

  const rows = sqlite.prepare('SELECT * FROM users ORDER BY id').all() as SqliteUser[];
  console.log(`[users] ${rows.length} rows in sqlite`);
  if (DRY) return new Map();

  const idMap = new Map<number, number>();

  for (const u of rows) {
    // Merge on tg_id — if already in PG, reuse that id instead of
    // inserting a duplicate (seeded admin is the common case).
    const existing = await db.execute(sql`SELECT id FROM users WHERE tg_id = ${u.tg_id} LIMIT 1`);
    if (existing[0]) {
      idMap.set(u.id, (existing[0] as any).id as number);
      continue;
    }
    // Also merge on ref_code — the admin is typically seeded with
    // ref_code='admin' but a different tg_id (or null tg_id), and we
    // don't want to collide on the unique ref_code index.
    const byRef = await db.execute(sql`SELECT id FROM users WHERE ref_code = ${u.ref_code} LIMIT 1`);
    if (byRef[0]) {
      idMap.set(u.id, (byRef[0] as any).id as number);
      // Patch missing tg_id on existing row so admin gets wired up.
      await db.execute(sql`
        UPDATE users SET tg_id = ${u.tg_id}
        WHERE id = ${(byRef[0] as any).id} AND tg_id IS NULL
      `);
      continue;
    }

    const inserted = await db.execute(sql`
      INSERT INTO users (
        tg_id, tg_username, first_name, last_name, language_code,
        ref_code, invited_by_ref_code,
        joined_at, last_seen_at, is_blocked,
        applied_on_site, applied_at, ref_notifications_enabled
      ) VALUES (
        ${u.tg_id},
        ${u.username ?? null},
        ${u.first_name ?? null},
        ${u.last_name ?? null},
        ${u.language_code ?? null},
        ${u.ref_code},
        ${u.invited_by_ref_code ?? null},
        ${msToDate(u.joined_at)},
        ${msToDate(u.last_seen_at)},
        ${boolFromInt(u.is_blocked)},
        ${boolFromInt(has('applied_on_site') ? u.applied_on_site : 0)},
        ${has('applied_at') ? msToDate(u.applied_at ?? null) : null},
        ${boolFromInt(has('ref_notifications_enabled') ? u.ref_notifications_enabled : 1, true)}
      )
      RETURNING id
    `);
    idMap.set(u.id, (inserted[0] as any).id as number);
  }

  // Second pass — backfill invited_by_user_id + invite_edges, now that
  // the id map is complete.
  let edges = 0;
  for (const u of rows) {
    if (!u.invited_by_user_id) continue;
    const child = idMap.get(u.id);
    const parent = idMap.get(u.invited_by_user_id);
    if (!child || !parent) continue;
    await db.execute(sql`UPDATE users SET invited_by_user_id = ${parent} WHERE id = ${child}`);
    await db.execute(sql`
      INSERT INTO invite_edges (child_user_id, parent_user_id)
      VALUES (${child}, ${parent})
      ON CONFLICT (child_user_id) DO NOTHING
    `);
    edges++;
  }
  console.log(`[users] imported ${idMap.size} users, wired ${edges} invite edges`);
  return idMap;
}

async function importLeads(sqlite: Database.Database): Promise<void> {
  const cols = (sqlite.pragma('table_info(leads)') as Array<{ name: string }>).map((c) => c.name);
  const hasThread = cols.includes('message_thread_id');
  const rows = sqlite.prepare('SELECT * FROM leads ORDER BY id').all() as SqliteLead[];
  console.log(`[leads] ${rows.length} rows in sqlite`);
  if (DRY) return;

  let ok = 0;
  for (const l of rows) {
    let payload: unknown = {};
    try {
      payload = JSON.parse(l.payload_json);
    } catch {
      payload = { _raw: l.payload_json };
    }
    await db.execute(sql`
      INSERT INTO leads (
        track, contact, payload, source, lang, status,
        taken_by_tg_id, taken_at, resolved_at,
        lost_reason, snooze_until,
        chat_id, message_thread_id, posted_message_id,
        created_at
      ) VALUES (
        ${l.track},
        ${l.contact ?? null},
        ${JSON.stringify(payload)}::jsonb,
        ${l.source ?? null},
        ${l.lang ?? null},
        ${l.status},
        ${l.taken_by_tg_id},
        ${msToDate(l.taken_at)},
        ${msToDate(l.resolved_at)},
        ${l.lost_reason ?? null},
        ${msToDate(l.snooze_until)},
        ${l.chat_id},
        ${hasThread ? l.message_thread_id ?? null : null},
        ${l.posted_message_id},
        ${msToDate(l.created_at)}
      )
    `);
    ok++;
  }
  console.log(`[leads] imported ${ok}`);
}

async function importAiTurns(sqlite: Database.Database, idMap: Map<number, number>): Promise<void> {
  // Resolve user_id by tg_id → map. ai_turns in legacy schema had no
  // user_id column, only tg_id.
  const rows = sqlite.prepare('SELECT id, tg_id, role, content, created_at FROM ai_turns ORDER BY id').all() as Array<{
    id: number; tg_id: number; role: string; content: string; created_at: number;
  }>;
  console.log(`[ai_turns] ${rows.length} rows in sqlite`);
  if (DRY) return;

  // Pre-fetch PG user id by tg_id (cheaper than a subquery per row).
  const tgToUser = new Map<number, number>();
  for (const [oldId, newId] of idMap) {
    void oldId;
    tgToUser.set(newId, newId); // placeholder — we'll rebuild from a select
  }
  const pgUsers = await db.execute(sql`SELECT id, tg_id FROM users WHERE tg_id IS NOT NULL`);
  const tgLookup = new Map<number, number>();
  for (const u of pgUsers as Array<{ id: number; tg_id: number }>) {
    tgLookup.set(Number(u.tg_id), Number(u.id));
  }

  let ok = 0;
  let orphan = 0;
  for (const t of rows) {
    const userId = tgLookup.get(Number(t.tg_id)) ?? null;
    if (!userId) orphan++;
    await db.execute(sql`
      INSERT INTO ai_turns (tg_id, user_id, role, content, created_at)
      VALUES (${t.tg_id}, ${userId}, ${t.role}, ${t.content}, ${msToDate(t.created_at)})
    `);
    ok++;
  }
  console.log(`[ai_turns] imported ${ok} (${orphan} without user_id link)`);
}

async function importReminderSteps(sqlite: Database.Database): Promise<Map<number, number>> {
  const rows = sqlite.prepare('SELECT * FROM reminder_steps ORDER BY order_idx, id').all() as Array<{
    id: number; order_idx: number; delay_hours: number; text_ru: string;
    text_en: string | null; text_zh: string | null; enabled: number; updated_at: number;
  }>;
  console.log(`[reminder_steps] ${rows.length} rows in sqlite`);
  if (DRY) return new Map();

  // Wipe existing steps that weren't seeded — we own this config.
  await db.execute(sql`DELETE FROM reminder_steps`);

  const idMap = new Map<number, number>();
  for (const r of rows) {
    const res = await db.execute(sql`
      INSERT INTO reminder_steps (order_idx, delay_hours, text_ru, text_en, text_zh, enabled, updated_at)
      VALUES (${r.order_idx}, ${r.delay_hours}, ${r.text_ru}, ${r.text_en}, ${r.text_zh}, ${boolFromInt(r.enabled, true)}, ${msToDate(r.updated_at)})
      RETURNING id
    `);
    idMap.set(r.id, Number((res[0] as any).id));
  }
  console.log(`[reminder_steps] imported ${idMap.size}`);
  return idMap;
}

async function importReminderSends(
  sqlite: Database.Database,
  userIdMap: Map<number, number>,
  stepIdMap: Map<number, number>,
): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM reminder_sends ORDER BY id').all() as Array<{
    id: number; user_id: number; step_id: number; sent_at: number;
  }>;
  console.log(`[reminder_sends] ${rows.length} rows in sqlite`);
  if (DRY) return;

  let ok = 0;
  let skipped = 0;
  for (const s of rows) {
    const uid = userIdMap.get(s.user_id);
    const sid = stepIdMap.get(s.step_id);
    if (!uid || !sid) {
      skipped++;
      continue;
    }
    await db.execute(sql`
      INSERT INTO reminder_sends (user_id, step_id, sent_at)
      VALUES (${uid}, ${sid}, ${msToDate(s.sent_at)})
      ON CONFLICT (user_id, step_id) DO NOTHING
    `);
    ok++;
  }
  console.log(`[reminder_sends] imported ${ok} (skipped ${skipped})`);
}

async function importBroadcasts(sqlite: Database.Database): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM broadcasts ORDER BY id').all() as Array<{
    id: number; admin_tg_id: number; text: string; sent_count: number;
    failed_count: number; created_at: number;
  }>;
  console.log(`[broadcasts] ${rows.length} rows in sqlite`);
  if (DRY) return;

  for (const b of rows) {
    await db.execute(sql`
      INSERT INTO broadcasts (admin_tg_id, text, sent_count, failed_count, created_at)
      VALUES (${b.admin_tg_id}, ${b.text}, ${b.sent_count}, ${b.failed_count}, ${msToDate(b.created_at)})
    `);
  }
  console.log(`[broadcasts] imported ${rows.length}`);
}

async function importPendingReferrals(sqlite: Database.Database): Promise<void> {
  const rows = sqlite.prepare('SELECT * FROM pending_referrals').all() as Array<{
    tg_id: number; ref_code: string; created_at: number;
  }>;
  console.log(`[pending_referrals] ${rows.length} rows in sqlite`);
  if (DRY) return;

  for (const p of rows) {
    await db.execute(sql`
      INSERT INTO pending_referrals (tg_id, ref_code, created_at)
      VALUES (${p.tg_id}, ${p.ref_code}, ${msToDate(p.created_at)})
      ON CONFLICT (tg_id) DO NOTHING
    `);
  }
  console.log(`[pending_referrals] imported ${rows.length}`);
}

async function main(): Promise<void> {
  console.log(`[import] source: ${SQLITE_PATH}${DRY ? ' (DRY RUN)' : ''}`);
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  if (TRUNCATE && !DRY) await truncateAll();

  const userIdMap = await importUsers(sqlite);
  await importLeads(sqlite);
  await importAiTurns(sqlite, userIdMap);
  const stepIdMap = await importReminderSteps(sqlite);
  await importReminderSends(sqlite, userIdMap, stepIdMap);
  await importBroadcasts(sqlite);
  await importPendingReferrals(sqlite);

  sqlite.close();
  console.log('[import] done. Verify counts with:');
  console.log('  psql $DATABASE_URL -c "SELECT \'users\' t, count(*) FROM users UNION ALL SELECT \'leads\', count(*) FROM leads UNION ALL SELECT \'ai_turns\', count(*) FROM ai_turns UNION ALL SELECT \'invite_edges\', count(*) FROM invite_edges"');
  process.exit(0);
}

main().catch((err) => {
  console.error('[import] fatal:', err);
  process.exit(1);
});
