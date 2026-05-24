import Database from 'better-sqlite3';
const db = new Database('./prod.db');
const r = db.pragma('wal_checkpoint(TRUNCATE)');
console.log('checkpoint:', r);
const counts = db.prepare(`
  SELECT 'users' AS t, COUNT(*) AS n FROM users
  UNION ALL SELECT 'leads', COUNT(*) FROM leads
  UNION ALL SELECT 'ai_turns', COUNT(*) FROM ai_turns
  UNION ALL SELECT 'reminder_steps', COUNT(*) FROM reminder_steps
  UNION ALL SELECT 'reminder_sends', COUNT(*) FROM reminder_sends
  UNION ALL SELECT 'broadcasts', COUNT(*) FROM broadcasts
  UNION ALL SELECT 'pending_referrals', COUNT(*) FROM pending_referrals
`).all();
console.table(counts);
db.close();
