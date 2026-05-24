// Networking fund: distributed monthly based on (lot coefficient × talks count).
//
// Score = coef(lot) × talks
// User share = userScore / totalScore × monthlyFund

import { LotUsd, networkingCoefOf } from './rules.js';

export interface NetworkingParticipant {
  userId: number;
  lotUsd: LotUsd;
  talks: number;
}

export interface NetworkingPayout {
  userId: number;
  score: number;
  shareCents: number;
}

export function scoreOf(p: NetworkingParticipant): number {
  return networkingCoefOf(p.lotUsd) * p.talks;
}

export function distributeNetworkingFund(
  fundCents: number,
  participants: NetworkingParticipant[],
): NetworkingPayout[] {
  const scored = participants.map(p => ({ userId: p.userId, score: scoreOf(p) }));
  const totalScore = scored.reduce((s, p) => s + p.score, 0);
  if (totalScore === 0) {
    return scored.map(s => ({ userId: s.userId, score: 0, shareCents: 0 }));
  }
  let distributed = 0;
  const payouts: NetworkingPayout[] = scored.map((s, i, arr) => {
    const exact = (fundCents * s.score) / totalScore;
    let share = Math.trunc(exact);
    // Last user picks up the rounding remainder so the fund is fully spent.
    if (i === arr.length - 1) share = fundCents - distributed;
    else distributed += share;
    return { userId: s.userId, score: s.score, shareCents: share };
  });
  return payouts;
}
