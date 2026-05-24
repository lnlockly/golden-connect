// /opt/banner-webapp/scripts/adx-stats-cron.js
// Run every 6 hours via system cron to collect TG channel stats
process.chdir('/opt/banner-webapp');
require('dotenv').config();
const Database = require('better-sqlite3');
const db = new Database('data/bannergen.db');

async function tgReq(method, params) {
  const token = process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN;
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  return r.json();
}

async function collectStats() {
  const channels = db.prepare(`
    SELECT c.*, s.tg_chat_id FROM adx_channels c
    JOIN ad_sources s ON s.id=c.source_id
    WHERE c.status='active'
  `).all();

  const today = new Date().toISOString().split('T')[0];
  let updated = 0;

  for (const ch of channels) {
    try {
      // Get member count
      const countResp = await tgReq('getChatMemberCount', { chat_id: ch.tg_chat_id });
      const memberCount = countResp.ok ? countResp.result : ch.member_count;

      // Update channel, preserve 7d ago snapshot (set once when 0)
      db.prepare(`UPDATE adx_channels SET
        member_count=?,
        member_count_7d_ago=CASE WHEN member_count_7d_ago=0 THEN ? ELSE member_count_7d_ago END,
        updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(memberCount, memberCount, ch.id);

      // Insert daily stats
      db.prepare('INSERT OR REPLACE INTO adx_channel_stats (channel_id, date, member_count) VALUES (?,?,?)').run(ch.id, today, memberCount);

      updated++;
      // Rate limit: 200ms between requests
      await new Promise(r => setTimeout(r, 200));
    } catch(e) {
      console.error(`[ADX Stats] channel ${ch.id}:`, e.message);
    }
  }

  // Rotate 7d_ago: update member_count_7d_ago weekly (every Sunday)
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 0) {
    db.prepare('UPDATE adx_channels SET member_count_7d_ago=member_count WHERE status="active"').run();
    console.log('[ADX Stats] Rotated 7d_ago snapshots (weekly)');
  }

  console.log(`[ADX Stats] Updated ${updated}/${channels.length} channels for ${today}`);
  db.close();
}

collectStats().catch(e => {
  console.error('[ADX Stats] Fatal:', e.message);
  db.close();
  process.exit(1);
});
