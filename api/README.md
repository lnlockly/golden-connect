# trendex-api

Backend for TrendeX — Node 22 + hono + Drizzle ORM on Postgres.

## Phase A scope

Working endpoints:
- `GET /health` — liveness + DB latency
- `POST /auth/nonce` — issue SIWE nonce (base32, TTL 10 min)
- `POST /auth/verify` — verify SIWE signature, find-or-create user, set `af_session` cookie
- `POST /auth/logout` — clear session cookie
- `GET /me` — current user, wallet, inviter, balance (0 in Phase A)

Stubs (return `501`):
- `POST /me/link-telegram`, `GET /me/agents`
- `GET /referrals/*`, `GET /balance`, `GET /ledger`
- `POST /leads`, `POST /leads/:id/resolve`
- `GET|POST /agents*`

## Local setup

```bash
cp .env.example .env
# fill DATABASE_URL (Neon recommended) and AUTH_JWT_SECRET

npm install
npm run push           # drizzle-kit push — fast-path for dev
# or: npm run generate && npm run migrate

npm run dev            # :4000
curl localhost:4000/health
```

For production-like migration workflow:

```bash
npm run generate       # writes src/db/migrations/*.sql
git add src/db/migrations
npm run migrate        # applies pending migrations via drizzle-kit
```

## Tests

```bash
npm test
```

- `tests/jwt.test.ts` — always runs (no DB).
- `tests/auth-siwe.test.ts` — end-to-end via viem. Requires `DATABASE_URL` pointing at a disposable schema. If unset, the suite is skipped.

## Environment

| Var | Required | Default | Notes |
|-----|----------|---------|-------|
| `DATABASE_URL` | yes (server) | — | `postgres://user:pass@host/db?sslmode=require` |
| `AUTH_JWT_SECRET` | yes (server) | — | HS256 signing key, ≥32 bytes recommended |
| `AUTH_COOKIE_DOMAIN` | no | empty | e.g. `.ai-winlab.com` for prod; empty for localhost |
| `BSC_CHAIN_ID` | no | `56` | SIWE chain pin |
| `LEADS_WEBHOOK_SECRET` | no | — | consumed in Phase C |
| `PORT` | no | `4000` | |
| `ALLOWED_ORIGINS` | no | — | comma-separated, appended to CORS allowlist |

## Docker

```bash
docker build -t trendex-api .
docker run --rm -p 4000:4000 \
  -e DATABASE_URL=... \
  -e AUTH_JWT_SECRET=... \
  trendex-api
```

## Structure

```
src/
  server.ts           hono app + wiring
  db/
    client.ts         postgres.js pool + drizzle
    schema.ts         all Phase A tables
    migrations/       drizzle-kit output
  middleware/
    auth.ts           JWT verify (cookie or Bearer)
    cors.ts           allowlist
  routes/
    auth.ts           /auth/{nonce,verify,logout}
    me.ts             /me, stubs for link-telegram & agents
    referrals.ts      501 stubs (Phase C)
    ledger.ts         501 stubs (Phase C)
    leads.ts          501 stubs (Phase C)
    agents.ts         501 stubs (Phase F)
    health.ts         /health
  services/
    env.ts            dotenv + required/optional helpers
    jwt.ts            HS256 sign/verify, 7-day TTL
    siwe.ts           nonce lifecycle + SIWE verify
    users.ts          find/create user, invite-edge attach
```
