import 'dotenv/config';
import postgres from 'postgres';
import Database from 'better-sqlite3';

const pg = postgres(process.env.DATABASE_URL);
const sq = new Database('./prod.db', { readonly: true });

const queries = [
  ['users (excl admin)',        'SELECT COUNT(*) n FROM users WHERE ref_code <> \'admin\'',            'SELECT COUNT(*) n FROM users'],
  ['leads',                     'SELECT COUNT(*) n FROM leads',                                        'SELECT COUNT(*) n FROM leads'],
  ['ai_turns',                  'SELECT COUNT(*) n FROM ai_turns',                                     'SELECT COUNT(*) n FROM ai_turns'],
  ['reminder_sends',            'SELECT COUNT(*) n FROM reminder_sends',                               'SELECT COUNT(*) n FROM reminder_sends'],
  ['broadcasts',                'SELECT COUNT(*) n FROM broadcasts',                                   'SELECT COUNT(*) n FROM broadcasts'],
  ['reminder_steps',            'SELECT COUNT(*) n FROM reminder_steps',                               'SELECT COUNT(*) n FROM reminder_steps'],
  ['invite_edges (PG-derived)', 'SELECT COUNT(*) n FROM invite_edges',                                 'SELECT COUNT(*) n FROM users WHERE invited_by_user_id IS NOT NULL'],
];

console.log('table'.padEnd(30), 'pg'.padEnd(6), 'sqlite'.padEnd(8), 'ok');
for (const [label, pgSql, sqSql] of queries) {
  const [pgR] = await pg.unsafe(pgSql);
  const sqR = sq.prepare(sqSql).get();
  const pgN = Number(pgR.n);
  const sqN = Number(sqR.n);
  console.log(label.padEnd(30), String(pgN).padEnd(6), String(sqN).padEnd(8), pgN === sqN ? '✓' : '✗');
}

console.log('\nsample users (first 3):');
const sample = await pg.unsafe('SELECT id, tg_id, tg_username, ref_code, invited_by_user_id FROM users ORDER BY id LIMIT 5');
console.table(sample);

await pg.end();
sq.close();
