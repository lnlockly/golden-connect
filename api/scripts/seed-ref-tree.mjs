/**
 * Seed a large, branched referral tree to stress-test the graph UI.
 * Topology is randomised but bounded so the total stays readable.
 *
 *   root
 *     ├── 6 L1 (3 with TG, 2 with agents)
 *     │    ├── 2–4 L2 each  (≈18 total)
 *     │    │    ├── 1–3 L3 each  (≈40 total)
 *     │    │    │    ├── 0–2 L4 each  (≈40 total)
 *     │    │    │    │    ├── 0–1 L5 each  (≈20 total)
 *     │    │    │    │    │    └── 0–1 L6  (≈8)
 *
 *  ≈120 nodes, depth 6.
 *
 * Usage:  DATABASE_URL=... ROOT_WALLET=0x... npx tsx scripts/seed-ref-tree.mjs
 */
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }

const sql = postgres(DATABASE_URL, { ssl: 'require' });
const ROOT_WALLET = (process.env.ROOT_WALLET ?? '').toLowerCase().trim();

// Per-depth fanout range [min, max]. Depth index 0 = L1 children of root.
const FANOUT = [
  [6, 6],   // L1
  [2, 4],   // L2
  [1, 3],   // L3
  [0, 2],   // L4
  [0, 1],   // L5
  [0, 1],   // L6
];

function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function hex(n) { return '0x' + randomBytes(n).toString('hex'); }
function refCode() {
  const A = 'abcdefghijkmnpqrstuvwxyz23456789';
  const b = randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += A[b[i] % A.length];
  return s;
}
function fakeTg() {
  const W = ['alpha','nova','pixel','cyber','lumen','echo','rune','flux','byte','zen','orb','vela',
             'proton','solo','neon','ember','frost','spark','glitch','pulse','hex','quark','zero','pyre'];
  return W[Math.floor(Math.random() * W.length)] + '_' + Math.floor(Math.random() * 900 + 100);
}

async function addFake(parentId, { withTg = false, withAgent = false } = {}) {
  const code = 'seed_' + refCode();
  const wallet = hex(20);
  const tgUsername = withTg ? fakeTg() : null;
  const tgId = withTg ? Math.floor(Math.random() * 1e9) + 1000 : null;
  const [u] = await sql`
    INSERT INTO users (ref_code, tg_username, tg_id)
    VALUES (${code}, ${tgUsername}, ${tgId})
    RETURNING id
  `;
  await sql`
    INSERT INTO user_wallets (user_id, address, chain_id)
    VALUES (${u.id}, ${wallet}, 56)
  `;
  await sql`
    INSERT INTO invite_edges (child_user_id, parent_user_id)
    VALUES (${u.id}, ${parentId})
  `;
  if (withAgent) {
    await sql`
      INSERT INTO agents (slug, owner_user_id, name, ticker, character, plugins, state)
      VALUES (
        ${'seed-' + refCode()},
        ${u.id},
        ${'Agent-' + code.slice(5, 9)},
        ${code.slice(5, 9).toUpperCase()},
        ${sql.json({ name: 'fake', bio: ['seed'] })},
        ${sql.json(['@elizaos/plugin-anthropic'])},
        ${'live'}
      )
    `;
  }
  return u.id;
}

async function resolveRoot() {
  if (ROOT_WALLET) {
    const [r] = await sql`
      SELECT u.id FROM users u
      JOIN user_wallets w ON w.user_id = u.id
      WHERE w.address = ${ROOT_WALLET} LIMIT 1
    `;
    if (!r) throw new Error(`No user for wallet ${ROOT_WALLET}`);
    return r.id;
  }
  const [r] = await sql`
    SELECT user_id AS id FROM user_wallets ORDER BY connected_at DESC LIMIT 1
  `;
  if (!r) throw new Error('No wallet users');
  return r.id;
}

async function cleanup() {
  const rows = await sql`SELECT id FROM users WHERE ref_code LIKE 'seed_%'`;
  if (rows.length === 0) return;
  await sql`DELETE FROM invite_edges WHERE child_user_id IN (SELECT id FROM users WHERE ref_code LIKE 'seed_%')`;
  await sql`DELETE FROM user_wallets WHERE user_id IN (SELECT id FROM users WHERE ref_code LIKE 'seed_%')`;
  await sql`DELETE FROM flow_ledger WHERE user_id IN (SELECT id FROM users WHERE ref_code LIKE 'seed_%') OR related_user_id IN (SELECT id FROM users WHERE ref_code LIKE 'seed_%')`;
  await sql`DELETE FROM agents WHERE owner_user_id IN (SELECT id FROM users WHERE ref_code LIKE 'seed_%')`;
  await sql`DELETE FROM users WHERE ref_code LIKE 'seed_%'`;
  console.log(`cleaned ${rows.length} prior seed users`);
}

async function grow(parentIds, depthIdx) {
  if (depthIdx >= FANOUT.length) return [];
  const [lo, hi] = FANOUT[depthIdx];
  const created = [];
  for (const parentId of parentIds) {
    const n = randInt(lo, hi);
    for (let i = 0; i < n; i++) {
      // TG probability decays with depth; agents rarer
      const withTg = Math.random() < Math.max(0.1, 0.6 - depthIdx * 0.1);
      const withAgent = Math.random() < Math.max(0.03, 0.2 - depthIdx * 0.05);
      created.push(await addFake(parentId, { withTg, withAgent }));
    }
  }
  return created;
}

async function main() {
  await cleanup();
  const root = await resolveRoot();
  console.log('root user id:', root);

  let current = [root];
  const perLevel = [];
  for (let d = 0; d < FANOUT.length; d++) {
    current = await grow(current, d);
    perLevel.push(current.length);
    console.log(`  L${d + 1}: +${current.length}  (parents ${perLevel[d - 1] ?? 1})`);
    if (current.length === 0) break;
  }

  const total = perLevel.reduce((s, n) => s + n, 0);
  console.log(`\ntotal fakes: ${total}`);

  // Ledger — simulate closed deals at L1/L2/L3
  const pool = 10_000_000;
  const curve = { 1: 0.10, 2: 0.05, 3: 0.03, 4: 0.01 };
  for (const [lvl, pct] of Object.entries(curve)) {
    const n = Math.min(3, Math.ceil(pool * pct / 500_000));
    for (let i = 0; i < n; i++) {
      await sql`
        INSERT INTO flow_ledger (user_id, kind, amount_micro, level, memo)
        VALUES (${root}, 'referral_reward', ${Math.floor(pool * pct)}, ${Number(lvl)}, ${'Sim L' + lvl + ' deal #' + (i + 1)})
      `;
    }
  }
  await sql`
    INSERT INTO flow_ledger (user_id, kind, amount_micro, level, memo)
    VALUES (${root}, 'signup_bonus', 5000000, null, 'Welcome bonus')
  `;
  console.log('ledger: seeded reward entries');

  const [stats] = await sql`
    WITH RECURSIVE d(user_id, level) AS (
      SELECT child_user_id, 1 FROM invite_edges WHERE parent_user_id = ${root}
      UNION ALL SELECT ie.child_user_id, d.level+1 FROM invite_edges ie JOIN d ON ie.parent_user_id = d.user_id WHERE d.level < 100
    ) SELECT COUNT(*)::int AS total, MAX(level)::int AS depth FROM d
  `;
  console.log(`\nroot=${root} · total=${stats.total} · depth=${stats.depth}`);

  await sql.end();
}

main().catch(async (e) => { console.error(e); await sql.end().catch(() => {}); process.exit(1); });
