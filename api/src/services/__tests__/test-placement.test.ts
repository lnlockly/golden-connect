import { describe, expect, it } from 'vitest';
import { fmtMicro } from '../test-placement.js';

/**
 * Pure-math tests for test-placement helpers. The simulator itself runs
 * SQL (descendant counts) and is exercised in the smoke test from prod;
 * here we cover the deterministic bigint formatter that drives every
 * dollar-amount string the user sees.
 */

describe('fmtMicro — micro-USD bigint → "$X.XX" string', () => {
  it('renders zero as "$0.00"', () => {
    expect(fmtMicro(0n)).toBe('$0.00');
  });

  it('renders whole dollars with two-decimal padding', () => {
    expect(fmtMicro(45_000_000n)).toBe('$45.00');
    expect(fmtMicro(135_000_000n)).toBe('$135.00');
  });

  it('renders fractional cents correctly', () => {
    expect(fmtMicro(393_200_000n)).toBe('$393.20'); // MLM808 LAUNCH total
    expect(fmtMicro(423_300_000n)).toBe('$423.30'); // MLM808 BOOST total
    expect(fmtMicro(499_170_000n)).toBe('$499.17'); // MLM808 ROCKET total
  });

  it('truncates micro-cents below 0.01 to 0', () => {
    // $0.001 = 1_000 micro → drops to "$0.00"
    expect(fmtMicro(1_000n)).toBe('$0.00');
    // Just under one cent
    expect(fmtMicro(9_999n)).toBe('$0.00');
    // Exactly one cent
    expect(fmtMicro(10_000n)).toBe('$0.01');
  });

  it('handles negative amounts (e.g. corrections)', () => {
    expect(fmtMicro(-50_000n)).toBe('-$0.05');
    expect(fmtMicro(-1_500_000n)).toBe('-$1.50');
  });

  it('handles values larger than Number.MAX_SAFE_INTEGER without precision loss', () => {
    // 10 billion dollars — well beyond JS Number precision but bigint-safe
    expect(fmtMicro(10_000_000_000_000_000n)).toBe('$10000000000.00');
  });
});


import { buildSimMessage, type PlacementSim } from '../test-placement.js';

function makeSim(overrides: Partial<PlacementSim> = {}): PlacementSim {
  const team = overrides.team_by_level || {
    1: 38, 2: 4, 3: 1,
    4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0,
    11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0,
  };
  return {
    team_by_level: team,
    team_total: overrides.team_total ?? 43,
    launch: overrides.launch ?? {
      matrix_micro: 21_500_000n, refs_micro: 371_700_000n,
      matching_micro: 0n, total_micro: 393_200_000n,
      team_in_depth: 43, team_in_refs: 43,
    },
    boost: overrides.boost ?? {
      matrix_micro: 51_600_000n, refs_micro: 371_700_000n,
      matching_micro: 0n, total_micro: 423_300_000n,
      team_in_depth: 43, team_in_refs: 43,
    },
    rocket: overrides.rocket ?? {
      matrix_micro: 90_300_000n, refs_micro: 371_700_000n,
      matching_micro: 37_170_000n, total_micro: 499_170_000n,
      team_in_depth: 43, team_in_refs: 43,
    },
  };
}

describe('buildSimMessage — TG body structure', () => {
  it('includes team summary with L1/L2/L3 counts', () => {
    const out = buildSimMessage(makeSim());
    expect(out).toMatch(/Твоя команда: 43 чел\./);
    expect(out).toMatch(/L1: 38/);
    expect(out).toMatch(/L2: 4/);
    expect(out).toMatch(/L3: 1/);
  });

  it('lists all three tariffs with MLM808 reference totals', () => {
    const out = buildSimMessage(makeSim());
    expect(out).toMatch(/LAUNCH \(\$45\) — \$393\.20/);
    expect(out).toMatch(/BOOST \(\$90\) — \$423\.30/);
    expect(out).toMatch(/ROCKET \(\$135\) — \$499\.17/);
  });

  it('includes matching-bonus line only when ROCKET earns it', () => {
    const out = buildSimMessage(makeSim());
    expect(out).toMatch(/matching bonus: \$37\.17/);

    const emptyTeam = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0,
      11: 0, 12: 0, 13: 0, 14: 0, 15: 0, 16: 0, 17: 0,
    };
    const zero = {
      matrix_micro: 0n, refs_micro: 0n, matching_micro: 0n, total_micro: 0n,
      team_in_depth: 0, team_in_refs: 0,
    };
    const empty = makeSim({
      team_total: 0,
      team_by_level: emptyTeam,
      launch: zero,
      boost: zero,
      rocket: zero,
    });
    const emptyOut = buildSimMessage(empty);
    expect(emptyOut).not.toMatch(/matching bonus/);
  });

  it('contains explicit "оценка" disclaimer (not a promise)', () => {
    const out = buildSimMessage(makeSim());
    expect(out).toMatch(/оценка/i);
  });

  it('contains no HTML tags — body is escaped by inbox-tg-deliver', () => {
    const out = buildSimMessage(makeSim());
    expect(out).not.toMatch(/<\w+>/);
    expect(out).not.toMatch(/<\/\w+>/);
  });

  it('renders matrix depth labels per tariff (11 / 12 / 17)', () => {
    const out = buildSimMessage(makeSim());
    expect(out).toMatch(/глубине 11/);
    expect(out).toMatch(/глубине 12, ×2 места/);
    expect(out).toMatch(/глубине 17, ×3 места/);
  });
});
