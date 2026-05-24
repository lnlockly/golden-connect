# Golden Connect

Рекламная платформа с распределённой прибылью. **4 баланса** на пользователя, **10-уровневая партнёрская программа**, **бинарная матрица** (запускается админом), биржа заданий, маркетплейс цифровых товаров. USD-only, no token.

> Слайды презентации (v2, апрель 2026): тарифы LAUNCH $45 / BOOST $90 / ROCKET $135 — see `Golden Connect_presentation3.pdf` for full marketing.

## Layout

```
golden-connect/
├── api/       ← Hono + Drizzle + Postgres (Neon). Schema, accruals, balance routes, cron workers.
├── bot/       ← Grammy Telegram bot @Golden Connect_bizbot. Thin HTTP client to api over INTERNAL_API_SECRET.
├── cabinet/   ← Express + vanilla JS. Personal cabinet, marketing UI, /finance page, admin Statистика.
├── landing/   ← Vite + React. Public landing golden-connect.to.
└── deploy/k8s/  ← Kubernetes manifests applied by GitHub Actions on push to main.
```

## Ports (local dev)

| Service | Port | Command |
|---|---|---|
| api | 4001 | `cd api && npm run dev` |
| cabinet | 3810 | `cd cabinet && npm run dev` |
| landing | 5179 | `cd landing && npm run dev` |
| bot | — | `cd bot && npm run dev` (long polling) |

## 4-balance system

Each user has **four independent balances**:

| Balance | Source | Spendable on | Withdrawable |
|---|---|---|---|
| 🟢 **Working** | 80% of all earnings (split via `applyIncomeSplit`) | вывод (мин $3), покупка/апгрейд тарифа, перевод на Subscription | ✅ Yes |
| 🟣 **Subscription** | 20% of all earnings (capped per-tariff), manual transfers from Working | only tariff (buy / renew / upgrade) | ❌ No |
| 🟡 **Gift** | bonuses, promo doubling, raffle prizes | only ADX advertising inside Golden Connect | ❌ No |
| ⚡ **Karma** | activity rewards (login streak, tasks, refs) | weekly raffle entry | ❌ No (points, not USD) |

### Subscription caps (auto-stop accumulation)

| Current tariff | Cap | Pays for |
|---|---|---|
| FREE | $45 | upgrade to LAUNCH |
| LAUNCH | $15 | 1-month renewal (1 seat) |
| BOOST | $30 | 1-month renewal (2 seats × $15) |
| ROCKET | $45 | 1-month renewal (3 seats × $15) |

Past cap → 100% goes to Working. (`subscription_caps` table is mutable for admin tuning.)

### Karma raffle

Every Sunday 20:00 MSK, top-10 users by karma earned that week split a fixed **$100 prize pool**:
1st = $30, 2nd = $20, 3rd = $15, 4th = $10, 5th = $8, 6th = $6, 7th = $4, 8th = $3, 9-10 = $2.

Karma earning rules (`services/karma.ts:KARMA_RULES`):
- `login_streak` +1 per consecutive day
- `task_complete` +1 (hooked into `task-pool.completeTask`)
- `referral_joined` +2 (signup via /start with ref)
- `referral_bought` +10 (someone in your downline buys/upgrades a tariff)
- `self_buy_tariff` +20
- `self_upgrade` +10
- `onboarding_done` +5
- `event_subscribe` +3

## Tariffs (Marketing v2, April 2026)

| Code | Entry | Monthly fee | Seats | Matrix depth | Per-seat rate | Cycle income |
|---|---|---|---|---|---|---|
| FREE | $0 | $0 | 0 | — | — | activity-only |
| LAUNCH | **$45** | $15 | 1 | 12 levels | $0.50 | $4 095 |
| BOOST | **$90** | $30 | 2 | 14 levels | $0.60 | $19 660 |
| ROCKET | **$135** | $45 | 3 | 17 levels | $0.70 | $183 499 |

Entry price = activation + first month, charged upfront. Monthly fee scales with seat count and is debited via `tariff-renewal.job` 30 days after activation.

### Partner status (PARTNER)

Invite **10 referrals on any tariff (incl. FREE)** → unlock PARTNER status pioneers. **+10% to ставка вознаграждения** lifetime, applies on every payout.

### Matching Bonus

ROCKET-only. **+10% от партнёрских начислений refs L1-L3** when those refs earn from their own downline.

## 10-level referral chain (slide 8)

| Line | FREE | LAUNCH+ |
|---|---|---|
| L1 | 10% | 10% |
| L2 | — | 7% |
| L3 | — | 5% |
| L4 | — | 2% |
| L5 | — | 1.5% |
| L6 | — | 1.3% |
| L7 | — | 1.2% |
| L8 | — | 1% |
| L9 | — | 0.9% |
| L10 | — | 0.5% |

`services/referrals-10lvl.ts:CURVE_PPM`. Triggered on every entry processing in `processLinearOnly`.

## Pre-launch matrix (frozen)

`users.matrix_frozen = true` until admin presses **«Запустить матрицу»** in `#/admin_stats`.

Pre-launch:
- buyTariffFromBalance creates `business_seats` row, but no `matrix_positions` row
- Matrix payouts skipped — users only see partner-line referrals

Post-launch (admin button click → `POST /internal/admin/matrix/launch`):
- `services/matrix-launch.ts:launchMatrixBackfill`:
  1. Read all `business_seats` ordered by `activated_at`
  2. For each: `placeSeatForUser` (BFS with sponsor anchor)
  3. `UPDATE users SET matrix_frozen = false`
- From this point: every new tariff buy → `placeSeatForUser` in same transaction

Topology: heap-style **binary tree**, position 0 = root (admin user).
- children of N: 2N+1 (left), 2N+2 (right)
- parent of N: floor((N-1)/2)

Anchor BFS: walk `users.invited_by_user_id` ↑ until matrixed ancestor, then BFS down for first empty slot. Fallback to root.

## Notifications (UNIFIED)

Single source of truth: `notifications_inbox`. Each row visible in BOTH:
1. **Cabinet bell** — `GET /api/notifications` polled every 60s, dropdown in header
2. **@Golden Connect_bizbot** — `inbox-tg-deliver.job` polls `delivered_tg=false` every minute, sends via TG, marks delivered

5 retry attempts on transient errors, 403/blocked-by-user gives up gracefully.

## Cron workers (`api/src/jobs/`)

| Job | Schedule (cron) | Purpose |
|---|---|---|
| `inbox-tg-deliver` | `* * * * *` (every min) | Push inbox notifications to @Golden Connect_bizbot |
| `tariff-renewal` | `0 6 * * *` (09:00 MSK) | T-3 / T-1 / T-0 / T+1 escalation: reminders, auto-debit, downgrade |
| `karma-raffle` | `0 17 * * 0` (Sun 20:00 MSK) | Top-10 by week karma, $100 prize distribution |
| `leader-pool` | `0 9 1,15 * *` (1st & 15th 12:00 MSK) | Distribute 5% partner-fund to top-15 partners |
| `event-reminders` | `*/10 * * * *` | T-24h / T-1h / live event push |
| Plus existing | (welcome-drip, weekly-digest, db-backup, etc.) | Pre-existing |

## Endpoints

### `/me/finance/*` (session-auth)
- `GET /me/finance/balances` — 4 balances + tariff state
- `GET /me/finance/transactions?limit=50` — paginated history (cash_ledger ∪ wallet_transfers ∪ karma_log)
- `POST /me/finance/transfer` — working ↔ subscription
- `POST /me/finance/withdraw` — request withdrawal (admin manually approves)
- `GET /me/finance/withdraw` — list user's requests
- `GET /me/finance/tariff-options` — buy/upgrade options with cost calc
- `POST /me/finance/buy-tariff` — activate FREE → paid tariff
- `POST /me/finance/upgrade-tariff` — bump existing tariff (доплата)

### `/me/notifications/*` (session-auth)
- `GET /me/notifications` — bell feed
- `GET /me/notifications/unread-count`
- `POST /me/notifications/:id/read`
- `POST /me/notifications/read-all`

### `/internal/finance/*` and `/internal/admin/*` (`x-golden-connect-secret` header)
Cabinet bridge proxies + bot direct calls. All endpoints accept `user_id` or `email` (with `tg<id>@golden-connect.bot` fallback for TG-only users).

## Deploy flow

GitHub Actions builds + applies on push to `main`:
1. Build Docker images (api/bot/cabinet/landing) tagged with commit SHA
2. Push to `ghcr.io/lnlockly/golden-connect-*`
3. SSH to deploy host (144.217.65.94)
4. `kubectl apply -f deploy/k8s/` — applies manifests
5. `kubectl set image deploy/golden-connect-X X=golden-connect-X:<SHA>` — bumps image tag
6. `kubectl rollout status` — wait until ready

**GitOps drift caveats:**
- `deploy/k8s/cabinet.yaml` has `cpu: 1m` (lowered from default 30m due to CPU-overcommitted node)
- `deploy/k8s/bot.yaml` has `replicas: 1` (was 0; long-poller for @Golden Connect_bizbot)
- `cabinet.yaml` env `CABINET_BOT_POLL_DISABLED=1` to prevent 409 conflict with bot deployment

## Server access

```bash
ssh -i ~/.ssh/golden-connect_ed25519 ubuntu@144.217.65.94
cd /home/ubuntu/golden-connect/

# Logs
kubectl logs -n golden-connect deploy/golden-connect-api --tail=100
kubectl logs -n golden-connect deploy/golden-connect-bot --tail=50

# DB direct (postgres-js inside api pod)
APIPOD=$(kubectl get pods -n golden-connect -l app=golden-connect-api -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n golden-connect $APIPOD -c golden-connect-api -- node -e '
  const p=require("/app/node_modules/postgres");
  const c=p(process.env.DATABASE_URL);
  (async()=>{
    const r=await c.unsafe("SELECT * FROM users LIMIT 3");
    console.log(JSON.stringify(r));
    await c.end();
  })();
'

# Test internal endpoint (admin stats, requires INTERNAL_API_SECRET)
SECRET=$(kubectl get secret -n golden-connect golden-connect-api-env -o jsonpath='{.data.INTERNAL_API_SECRET}' | base64 -d)
kubectl exec -n golden-connect $APIPOD -c golden-connect-api -- node -e '
  const h=require("http");
  h.get({hostname:"localhost",port:4001,path:"/internal/admin/stats",headers:{"x-golden-connect-secret":process.env.INTERNAL_API_SECRET}},
    r=>{let b="";r.on("data",c=>b+=c);r.on("end",()=>console.log(r.statusCode, b))});
'
```

## Migration applied (Phase 1, commit fd892b2)

`api/src/db/migrations/0014_balances_karma_subscription.sql`:
- `users.subscription_balance_micro`, `users.karma_points`, `users.active_tariff_code`, `users.tariff_started_at`, `users.tariff_expires_at`, `users.tariff_auto_renew`, `users.matrix_frozen`
- New tables: `karma_log`, `wallet_transfers`, `karma_raffles`, `karma_raffle_winners`, `subscription_caps`, `tariff_history`, `notifications_inbox`

`0015_tariff_prices.sql`: aligns entry_micro with full price + scales monthly_fee with seat count.

Migrations are idempotent (use `IF NOT EXISTS`, `ON CONFLICT DO UPDATE`, and `DO $$ ... EXCEPTION WHEN duplicate_object $$` blocks for constraints) so re-running on already-migrated DB is safe.

## Invariant (income split)

For every income event with positive `amount_micro` of kind in {task_reward, ad_view, ref_L*, matching_bonus, leader_pool_prize, karma_raffle_prize}, after `applyIncomeSplit` runs:
- `cash_ledger` shows the original entry +amount + an offsetting `subscription_split` -amount × 20% (capped)
- `users.subscription_balance_micro` increases by the same 20% × amount

Working balance (`SUM(cash_ledger WHERE user_id)`) ends at 80% of original. Daily cap math (which only sums positive income kinds) is unaffected.

## First-time setup (local dev)

```bash
# 1. API
cd api
cp .env.example .env           # set DATABASE_URL, INTERNAL_API_SECRET, AUTH_JWT_SECRET, BOT_TOKEN
npm install
npx drizzle-kit migrate
npx tsx scripts/seed-tariffs.ts
npm run dev                    # → http://localhost:4001

# 2. Cabinet
cd ../cabinet
cp .env.example .env           # set DATABASE_URL, BOT_TOKEN, INTERNAL_API_BASE_URL, INTERNAL_API_SECRET
npm install
npm run dev                    # → http://localhost:3810

# 3. Bot
cd ../bot
cp .env.example .env           # set BOT_TOKEN, INTERNAL_API_BASE_URL, INTERNAL_API_SECRET
npm install
npm run dev

# 4. Landing
cd ../landing
cp .env.example .env.local
npm install
npm run dev                    # → http://localhost:5179
```

## Tests

```bash
cd api && npx vitest run
```

DB-integration tests are gated on `DATABASE_URL_TEST` — point it at an isolated Neon branch before running.
