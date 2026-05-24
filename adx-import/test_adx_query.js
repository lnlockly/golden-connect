require('dotenv').config();
const { init, getDb } = require('./src/database');
init('./data/bannergen.db');
const db = getDb();

// Simulate the exact handler for GET /api/adx/channels/my
// Test with userId=1 (or first user)
const users = db.prepare('SELECT id FROM users LIMIT 3').all();
console.log('Testing with users:', users.map(u => u.id));

for (const user of users) {
  const userId = user.id;
  try {
    const channels = db.prepare(`
      SELECT c.*, s.title, s.username, s.avatar_url, s.tg_chat_id, s.member_count as src_member_count, s.type as channel_type
      FROM adx_channels c
      JOIN ad_sources s ON s.id=c.source_id
      WHERE c.user_id=?
      ORDER BY c.created_at DESC
    `).all(userId);
    console.log(`User ${userId}: ${channels.length} channels`);

    channels.forEach(ch => {
      try { ch.categories = JSON.parse(ch.categories || '[]'); } catch(e) { ch.categories = []; }
      ch.pending_orders = db.prepare("SELECT COUNT(*) as n FROM adx_orders WHERE channel_id=? AND status='pending_approval'").get(ch.id)?.n || 0;
      ch.active_orders = db.prepare("SELECT COUNT(*) as n FROM adx_orders WHERE channel_id=? AND status='active'").get(ch.id)?.n || 0;
    });

    const registered = channels.map(c => c.source_id);
    const available = db.prepare("SELECT * FROM ad_sources WHERE user_id=? AND bot_is_admin=1 AND status='active'").all(userId)
      .filter(s => !registered.includes(s.id));
    console.log(`User ${userId}: ${available.length} available sources`);
  } catch(e) {
    console.error(`User ${userId} ERROR:`, e.message);
  }
}
