# Monar (real implementation)

Money-model for Monar / Golden Connect, ported from the 13-series source
of truth (`agentflow/ops/golden-connect-migration/monar-13-series-source.md`).

**Status: pure logic live, DB writes still stubbed.**

Read endpoints (`/api/monar/health`, `/api/monar/rules`, `/api/monar/lot/:lotUsd`,
`/api/monar/calc/*`) are real. They return canonical specs and run the pure
functions on demand so the cabinet/frontend can preview numbers without
re-implementing them.

Write endpoints (`POST /api/monar/entries`, `POST /api/monar/lots`,
`POST /api/monar/withdraw`, `POST /api/monar/admin/world-pool/settle`,
`POST /api/monar/admin/abonentka/charge`) return **501 not_wired** until the
activation PR plugs in DB calls.

## Files

| File | Role |
|---|---|
| `rules.ts` | Canonical constants. Lots, business places, ladders, abonentka, world pool buckets, networking coefs, balance kinds. |
| `distribute.ts` | Pure: `distributePlaceEntry`, `distributeLotPurchase`, `distributeLotClosure`. |
| `queue.ts` | Pure: single global queue of places, advance/respawn/depth. |
| `world-pool.ts` | Pure: 8-bucket monthly split + `decideAutoActivate` (auto-buy new lot from pool payout). |
| `reinvest.ts` | Pure: 50/50 split on closure + `pickLargestAffordableLot`. |
| `credit-lot.ts` | Pure: $10 free starter, one per user, unlock on first real lot. |
| `balances.ts` | Pure: 3-balance (topup/income/referral) accounting, withdrawal rules. |
| `withdraw.ts` | Pure: "новый лот ≥ 50% от дохода" eligibility check. |
| `abonentka.ts` | Pure: 0.5%/week fee, due-charge + 24h-notice schedulers. |
| `ads.ts` | Pure: per-lot ads allowance (posts/week × weeks, channels, langs). |
| `networking.ts` | Pure: `scoreOf` + monthly fund split. |
| `schema.ts` | Drizzle table defs for all of the above. NOT exported from `src/db/schema.ts` (so `drizzle-kit generate` skips it until activation). |
| `routes.ts` | Hono sub-app. Already mounted under `/api/monar` after activation step 2. |
| `__tests__/*.test.ts` | Vitest unit tests for all pure functions. |

## Canonical numbers (from 13-series)

```
Lot   | Places | Days | Cycles | Pool | VIP | Ads (posts/wk × wks)
$50   |   2    | ~90  |   17   |  0   | no  | 1 once
$100  |   4    | ~85  |   15   |  0   | no  | 1 × 4
$200  |   7    | ~80  |   14   |  0   | no  | 2 × 8
$300  |   9    | ~75  |   14   |  1   | no  | 3 × 12
$400  |  12    | ~70  |   13   |  2   | no  | 4 × 16
$500  |  15    | ~65  |   12   |  3   | yes | 5 × 20
$700  |  21    | ~55  |   10   |  5   | yes | 7 × 30
$1000 |  32    | ~40  |    7   |  8   | yes | 10 × 50
```

Place distribution: first $10 → 60% owner ($6), 40% system (referral ladder
10/5/3/2/1 + world pool 9% + networking 4% + events 3% + infra 3%).
Second $10 → reinvest place at queue tail.

## How to activate (3 PRs)

1. **Schema activation** (PR-A): in `src/db/schema.ts`, append:
   ```ts
   export * from '../monar/schema.js';
   ```
   Then `npm run generate`, commit the migration. Init-container `drizzle-migrate`
   will apply it on next rollout.

2. **Routes activation** (PR-B): in `src/server.ts`, add:
   ```ts
   import monarRoutes from './monar/routes.js';
   app.route('/api/monar', monarRoutes);
   ```
   This already exposes read-only + calc endpoints since they don't touch DB.

3. **DB-write wiring** (PR-C): replace the `notWired` stubs in
   `routes.ts` with actual drizzle calls. Use the schema from `monar/schema.ts`.

## Test plan

```bash
cd api
npm install
npm test -- monar
```

All pure functions are covered by unit tests in `__tests__/`.

## Source of truth

- Marketing text: `agentflow/ops/golden-connect-migration/monar-13-series-source.md`
- Visual schema: `agentflow/ops/golden-connect-migration/monar-golden-connect-admin-map.html`
- Live preview: <https://golden-connect.to/p/monar-admin-map.html>
