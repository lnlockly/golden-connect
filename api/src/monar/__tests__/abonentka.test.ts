import { describe, expect, it } from 'vitest';
import { dueCharges, dueNotifications, weeklyFeeCents } from '../abonentka.js';

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

describe('weeklyFeeCents', () => {
  it('0.5% of lot per week', () => {
    expect(weeklyFeeCents(50)).toBe(25);       // $0.25
    expect(weeklyFeeCents(100)).toBe(50);      // $0.50
    expect(weeklyFeeCents(300)).toBe(150);     // $1.50
    expect(weeklyFeeCents(500)).toBe(250);     // $2.50
    expect(weeklyFeeCents(1000)).toBe(500);    // $5.00
  });
});

describe('dueCharges', () => {
  const now = Date.now();

  it('lot activated < 7 days ago → not due', () => {
    const charges = dueCharges([{
      id: 1, userId: 1, lotUsd: 500,
      activatedAt: now - 3 * DAY, lastChargeAt: null, closed: false,
    }], now);
    expect(charges).toHaveLength(0);
  });

  it('lot activated 7+ days ago, never charged → due', () => {
    const charges = dueCharges([{
      id: 1, userId: 1, lotUsd: 500,
      activatedAt: now - 8 * DAY, lastChargeAt: null, closed: false,
    }], now);
    expect(charges).toHaveLength(1);
    expect(charges[0].amountCents).toBe(250);
  });

  it('closed lot → not charged', () => {
    const charges = dueCharges([{
      id: 1, userId: 1, lotUsd: 500,
      activatedAt: now - 30 * DAY, lastChargeAt: null, closed: true,
    }], now);
    expect(charges).toHaveLength(0);
  });

  it('lot charged 7+ days ago → due again', () => {
    const charges = dueCharges([{
      id: 1, userId: 1, lotUsd: 500,
      activatedAt: now - 30 * DAY, lastChargeAt: now - 8 * DAY, closed: false,
    }], now);
    expect(charges).toHaveLength(1);
  });
});

describe('dueNotifications', () => {
  const now = Date.now();
  it('notifies 24h before next charge', () => {
    // charge due in 12h (≤24h) → should notify
    const notifications = dueNotifications([{
      id: 1, userId: 1, lotUsd: 500,
      activatedAt: now - (WEEK - 12 * 60 * 60 * 1000),
      lastChargeAt: null, closed: false,
    }], now);
    expect(notifications).toHaveLength(1);
  });

  it('does NOT notify if charge already due', () => {
    const notifications = dueNotifications([{
      id: 1, userId: 1, lotUsd: 500,
      activatedAt: now - 8 * DAY, lastChargeAt: null, closed: false,
    }], now);
    expect(notifications).toHaveLength(0);
  });
});
