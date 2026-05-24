/**
 * Тестовая расстановка (Test Placement) — daily simulation that motivates
 * FREE users to upgrade by showing their hypothetical 30-day income for
 * each tariff (LAUNCH / BOOST / ROCKET) based on their current team graph.
 *
 * Pre-launch model: matrix isn't placed yet, so we can't show real matrix
 * payouts. Instead we project from the user's REAL team tree
 * (`users.invited_by_user_id` recursive descendants) under a synthetic
 * assumption: "if every member of your team bought a $90 BOOST". This
 * gives realistic-ish projections that scale with team size and motivate
 * recruitment alongside upgrade.
 *
 * Output for one user:
 *   {
 *     team: { l1: 38, l2: 4, l3: 1, ..., total_in_depth_17: 43 },
 *     launch:  { matrix_micro, refs_micro, total_micro },
 *     boost:   { ... },
 *     rocket:  { ... },
 *   }
 *
 * Math (per spec):
 *   - Tariff config from `tariffs` table:
 *     LAUNCH: depth=11, rate=$0.50, seats=1, ref_levels=3
 *     BOOST:  depth=12, rate=$0.60, seats=2, ref_levels=5
 *     ROCKET: depth=17, rate=$0.70, seats=3, ref_levels=10 (+ matching bonus)
 *   - Matrix monthly income = Σ_l(team_at_lvl * rate * seats), l=1..depth
 *   - Refs monthly income   = Σ_l(team_at_lvl * REF_PCT[lvl]) * $90
 *   - Matching bonus (ROCKET only) = +10% of L1+L2+L3 ref earnings
 *
 * Numbers are projections, not promises — clearly labelled as "оценка".
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { REFERRAL_CURVE_10LVL } from './referrals-10lvl.js';

const ASSUMED_AVG_ENTRY_MICRO = 90_000_000n; // $90 = BOOST median
const MATCHING_BONUS_PCT = 10n; // +10% on L1..L3 partner earnings (ROCKET)

export interface TariffSimResult {
  matrix_micro: bigint;
  refs_micro: bigint;
  matching_micro: bigint;
  total_micro: bigint;
  /** Number of team members reachable within this tariff's matrix depth. */
  team_in_depth: number;
  /** Number of team members reachable within this tariff's referral levels. */
  team_in_refs: number;
}

export interface PlacementSim {
  team_by_level: Record<number, number>; // 1..17
  team_total: number;
  launch: TariffSimResult;
  boost: TariffSimResult;
  rocket: TariffSimResult;
}

const TARIFFS = {
  launch: { depth: 11, rate_micro: 500_000n,  seats: 1, ref_levels: 3,  matching: false },
  boost:  { depth: 12, rate_micro: 600_000n,  seats: 2, ref_levels: 5,  matching: false },
  rocket: { depth: 17, rate_micro: 700_000n,  seats: 3, ref_levels: 10, matching: true  },
};

/**
 * Walks `users.invited_by_user_id` recursively for `userId` and returns a
 * level→count map (level 1..17). Bounded at depth 17 for safety
 * (ROCKET's max depth) — doesn't need to go deeper for any tariff.
 */
export async function teamSizeByLevel(userId: number): Promise<Record<number, number>> {
  const rows = (await db.execute(sql`
    WITH RECURSIVE descendants(id, lvl) AS (
      SELECT id, 1 AS lvl FROM users WHERE invited_by_user_id = ${userId}
      UNION ALL
      SELECT u.id, d.lvl + 1
      FROM users u
      JOIN descendants d ON u.invited_by_user_id = d.id
      WHERE d.lvl < 17
    )
    SELECT lvl::int AS lvl, COUNT(*)::int AS n
    FROM descendants
    GROUP BY lvl
    ORDER BY lvl
  `)) as unknown as Array<{ lvl: number; n: number }>;

  const out: Record<number, number> = {};
  for (let i = 1; i <= 17; i++) out[i] = 0;
  for (const r of rows) out[r.lvl] = Number(r.n);
  return out;
}

function simOneTariff(
  team: Record<number, number>,
  cfg: typeof TARIFFS.launch,
): TariffSimResult {
  // Matrix income: members within matrix depth × rate × seats
  let matrixCount = 0;
  for (let l = 1; l <= cfg.depth; l++) matrixCount += team[l] || 0;
  const matrix_micro = BigInt(matrixCount) * cfg.rate_micro * BigInt(cfg.seats);

  // Referral income: count members within ref_levels weighted by curve %, × avg entry
  let refsMicro = 0n;
  let refCount = 0;
  for (let l = 1; l <= cfg.ref_levels && l <= 10; l++) {
    const n = BigInt(team[l] || 0);
    refCount += team[l] || 0;
    const ppm = BigInt(Math.round((REFERRAL_CURVE_10LVL[l - 1] ?? 0) * 1_000_000));
    refsMicro += (n * ASSUMED_AVG_ENTRY_MICRO * ppm) / 1_000_000n;
  }

  // Matching bonus: ROCKET-only, 10% of L1..L3 ref earnings
  let matching_micro = 0n;
  if (cfg.matching) {
    let l1to3Refs = 0n;
    for (let l = 1; l <= 3; l++) {
      const n = BigInt(team[l] || 0);
      const ppm = BigInt(Math.round((REFERRAL_CURVE_10LVL[l - 1] ?? 0) * 1_000_000));
      l1to3Refs += (n * ASSUMED_AVG_ENTRY_MICRO * ppm) / 1_000_000n;
    }
    matching_micro = (l1to3Refs * MATCHING_BONUS_PCT) / 100n;
  }

  return {
    matrix_micro,
    refs_micro: refsMicro,
    matching_micro,
    total_micro: matrix_micro + refsMicro + matching_micro,
    team_in_depth: matrixCount,
    team_in_refs: refCount,
  };
}

export async function simulateForUser(userId: number): Promise<PlacementSim> {
  const team = await teamSizeByLevel(userId);
  let team_total = 0;
  for (let l = 1; l <= 17; l++) team_total += team[l];

  return {
    team_by_level: team,
    team_total,
    launch: simOneTariff(team, TARIFFS.launch),
    boost: simOneTariff(team, TARIFFS.boost),
    rocket: simOneTariff(team, TARIFFS.rocket),
  };
}

/** Format $X.XX from micro-USD bigint. */
export function fmtMicro(micro: bigint): string {
  const sign = micro < 0n ? '-' : '';
  const abs = micro < 0n ? -micro : micro;
  const dollars = abs / 1_000_000n;
  const cents = (abs % 1_000_000n) / 10_000n; // two decimal places
  return `${sign}$${dollars.toString()}.${cents.toString().padStart(2, '0')}`;
}

/**
 * Build the plain-text body for notifications_inbox.body. inbox-tg-deliver
 * wraps it with <b>title</b> + escapes the body, so we MUST NOT include
 * HTML tags here (they'd be escaped to literal &lt;b&gt;). Bullets and
 * emojis carry the visual hierarchy instead.
 */
export function buildSimMessage(sim: PlacementSim): string {
  const lines: string[] = [];
  lines.push(`Твоя команда: ${sim.team_total} чел. (L1: ${sim.team_by_level[1]}, L2: ${sim.team_by_level[2]}, L3: ${sim.team_by_level[3]})`);
  lines.push('');
  lines.push('Если бы ты сейчас активировал тариф, твой потенциальный доход с этой команды (при условии что все купили средний тариф $90) был бы:');
  lines.push('');
  lines.push(`🚀 LAUNCH ($45) — ${fmtMicro(sim.launch.total_micro)}`);
  lines.push(`   • матрица: ${fmtMicro(sim.launch.matrix_micro)} (${sim.launch.team_in_depth} чел в глубине 11)`);
  lines.push(`   • рефералы: ${fmtMicro(sim.launch.refs_micro)} (L1-L3)`);
  lines.push('');
  lines.push(`⚡ BOOST ($90) — ${fmtMicro(sim.boost.total_micro)}`);
  lines.push(`   • матрица: ${fmtMicro(sim.boost.matrix_micro)} (${sim.boost.team_in_depth} чел в глубине 12, ×2 места)`);
  lines.push(`   • рефералы: ${fmtMicro(sim.boost.refs_micro)} (L1-L5)`);
  lines.push('');
  lines.push(`💎 ROCKET ($135) — ${fmtMicro(sim.rocket.total_micro)}`);
  lines.push(`   • матрица: ${fmtMicro(sim.rocket.matrix_micro)} (${sim.rocket.team_in_depth} чел в глубине 17, ×3 места)`);
  lines.push(`   • рефералы: ${fmtMicro(sim.rocket.refs_micro)} (L1-L10)`);
  if (sim.rocket.matching_micro > 0n) {
    lines.push(`   • matching bonus: ${fmtMicro(sim.rocket.matching_micro)} (+10% с L1-L3)`);
  }
  lines.push('');
  lines.push('Это разовая оценка при условии что вся команда купит средний тариф. Реальный доход зависит от активности и периодических платежей твоей сети.');
  return lines.join('\n');
}
