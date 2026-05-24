# TRENDEX Waitlist Bot

Telegram waitlist bot for TRENDEX with infinite-depth referral tree, admin panel, and broadcasts. Node 20, TypeScript, grammy, better-sqlite3.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: BOT_TOKEN, ADMIN_TG_ID
npm run dev        # watch mode
npm run build && npm start
npm run typecheck
npm test           # smoke tests
```

## Env vars

| Var            | Required | Default                  |
|----------------|----------|--------------------------|
| `BOT_TOKEN`    | yes      | —                        |
| `ADMIN_TG_ID`  | yes      | —                        |
| `DATABASE_PATH`| no       | `./data/trendex.db`    |
| `BOT_USERNAME` | no       | `AgentflowWaitlistBot`   |
| `NODE_ENV`     | no       | `development`            |
| `LOG_LEVEL`    | no       | `info`                   |

With `BOT_TOKEN=111:fake` (or `NODE_ENV=test`) the bot builds, migrates the DB, and exits after printing "started" — no network call. Useful in CI.

## User commands

- `/start [ref_XXXXXXXX]` — onboarding; deep link sets inviter on first signup
- `/me`, `/stats` — personal ref code, invite link, direct + total network
- `/lang en|ru|zh` — language (auto-detected from Telegram locale on first /start)
- `/help` — command list

## Admin commands (ADMIN_TG_ID only)

- `/admin` — totals, 24h/7d joins, broadcast stats, top-10 direct + top-10 network
- `/users` — paginated list (← → inline keyboard, 10 per page)
- `/tree <ref_code|tg_id>` — tree up to 5 levels, 30 nodes per level
- `/broadcast` — send text; preview with Confirm / Cancel; ~20 msg/sec, handles 403/429
- `/block <tg_id>`, `/unblock <tg_id>`
- `/export` — CSV of all users

## Referral semantics

Deep link: `https://t.me/<BOT_USERNAME>?start=ref_XXXXXXXX`. Inviter is recorded once, at signup; re-using `/start` with a different code is a no-op. If the claimed code isn't registered yet, it's stored in `pending_referrals` and resolved when the inviter joins. Self-referral is impossible by construction (user has no ref code before signup).

Total-descendants count uses a recursive CTE capped at depth 64.

## Deploy

Container is rootless, stores SQLite in `/data` (mount a volume).

```bash
docker build -t trendex-bot .
docker run -d --name trendex-bot \
  -e BOT_TOKEN=... -e ADMIN_TG_ID=... \
  -v trendex-data:/data trendex-bot
```

Migrate to Postgres later by swapping `src/db/index.ts` + `src/db/users.ts` implementations; the rest of the code only talks to `UsersRepo` / `BroadcastsRepo`.
