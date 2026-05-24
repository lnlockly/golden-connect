/**
 * XP + level math. Pure functions — no DB. Callers that need to persist XP
 * should `upsertXp(userId, delta)` in `routes/gamification.ts` and use these
 * helpers to render the level line.
 *
 * Curve:
 *   levelN requires sum_{i=1..N-1} LEVEL_STEP(i) XP
 *   LEVEL_STEP(i) = BASE * i            (linear growth — easy to reason about
 *                                        and readable in the UI: "200 XP to
 *                                        level 2", "400 XP to level 3", ...)
 *   BASE = 100 XP
 *
 * This matches the x-health-bot "1 XP ~ 1 minute of engagement" heuristic and
 * lets the single-quest rewards (5..500 XP) span ~5 levels cleanly.
 */

const BASE = 100;

/** XP threshold to REACH level `n` (n ≥ 1). Level 1 starts at 0. */
export function thresholdForLevel(n: number): number {
  if (n <= 1) return 0;
  // sum of 1..n-1 multiplied by BASE.
  const k = n - 1;
  return (BASE * k * (k + 1)) / 2;
}

/** Inverse of thresholdForLevel — highest level reachable with `xp` XP. */
export function levelForXp(xp: number): number {
  if (xp < BASE) return 1;
  let level = 1;
  while (thresholdForLevel(level + 1) <= xp) level += 1;
  return level;
}

export interface LevelProgress {
  level: number;
  /** XP still needed to reach the next level (0 iff at the curve ceiling). */
  xpToNext: number;
  /** XP the user has accumulated *past* the current level's threshold. */
  xpInLevel: number;
  /** Total XP span of the current level (next - current threshold). */
  xpSpan: number;
  /** Convenience 0..1 fraction of progress inside the current level. */
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const base = thresholdForLevel(level);
  const next = thresholdForLevel(level + 1);
  const span = Math.max(1, next - base);
  const inLevel = Math.max(0, xp - base);
  return {
    level,
    xpToNext: Math.max(0, next - xp),
    xpInLevel: inLevel,
    xpSpan: span,
    fraction: Math.min(1, inLevel / span),
  };
}
