# Trendex Cabinet (cabinet pod)

Express + grammY + better-sqlite3 monolith hosting:
- Personal cabinet UI (`/cabinet/cabinet` → `public/site/cabinet.html`)
- Bio Hub (`/cabinet/#/bio` → `shortener-bio-arsenal.js`)
- Marketplace (`/cabinet/#/marketplace`)
- AdCenter / TG autoposting
- Telegram bot `@Trendex_bizbot` (long-polling)
- Public bio pages `/bio/<username>`
- Public landing showcase `/landings`

## Tech stack
- Node 22 (alpine), Express
- better-sqlite3 (planner.db = persistent SQLite)
- grammY (TG bot framework)
- sharp + qrcode (image generation)
- ffmpeg + yt-dlp (video pipeline for video-promo)
- Chromium + Puppeteer (banner generation, optional)
- web-push (browser push notifications)
- Backend API proxy → `api.trendex.biz` (Hono + Postgres)

## Local dev
```bash
cd cabinet
npm ci
DATA_DIR=./data BASE_PATH=/cabinet PORT=3810 node src/server.js
```

Required env (see `src/config.js`):
- `BOT_TOKEN`, `BOT_USERNAME`
- `TRENDEX_API_BASE_URL`, `TRENDEX_API_INTERNAL_SECRET`
- `SESSION_COOKIE_NAME`, `PUBLIC_BASE_URL`
- `GROQ_KEYS` (comma-separated)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL`
- `PLATEGA_*`, `CRYPTOBOT_TOKEN` (payments)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_TG_USER_ID`

## Deploy

Cabinet runs as k8s deployment in `trendex` namespace. Build:
```bash
cd cabinet
docker buildx build --platform linux/amd64 --push \
  -t ghcr.io/lnlockly/trendex-cabinet:$(git rev-parse --short=10 HEAD) \
  -t ghcr.io/lnlockly/trendex-cabinet:latest .
kubectl -n trendex set image deployment/trendex-cabinet trendex-cabinet=ghcr.io/lnlockly/trendex-cabinet:$(git rev-parse --short=10 HEAD)
kubectl -n trendex rollout status deployment/trendex-cabinet --timeout=200s
```

Dockerfile auto-stamps `cab_VERSION_PLACEHOLDER` in cabinet.html with `cab_YYYYMMDD_HHMMSS` and bumps all `?v=...` query strings on every build → invalidates browser/CF cache.

### Ingress

Persistent ingress manifest is at `k8s/ingress.yaml`. Apply with:
```bash
kubectl apply -f cabinet/k8s/ingress.yaml
```
This routes `/cabinet, /bio, /s, /hub, /sitemap-bio.xml, /auth/magic` to cabinet.

## Health check

`GET /cabinet/health` returns:
```json
{
  "ok": true,
  "service": "trendex-cabinet",
  "db_ok": true,
  "bot_running": true,
  "uptimeSec": 123,
  "memory": { "rssMb": 110, "heapUsedMb": 25 },
  "webUsersCount": 172,
  "telegramUsersCount": 0
}
```
Returns 503 if `db_ok=false` or `api_ok=false`.

## Tariff limits

Per-day limits enforced through `src/helpers/usage-limits.js`:

| Service | FREE | LAUNCH ($45) | BOOST ($90) | ROCKET ($135) |
|---|---|---|---|---|
| ai.text / ai.rewrite / ai.captions | 30 | 200 | 1000 | 9999 |
| ai.hashtags | 50 | 500 | 5000 | 99999 |
| ai.bio-gen | 5 | 30 | 100 | 9999 |
| video.transcribe | 5 | 30 | 100 | 9999 |
| adcenter.send (per day) | 100 | 1000 | 10000 | 999999 |
| adcenter.sources (lifetime) | 5 | 30 | 100 | 999 |
| adcenter.monitors (lifetime) | 2 | 10 | 50 | 999 |
| shortener.create | 50 | 500 | 5000 | 99999 |

Tariff is fetched from api Postgres via `/internal/finance/balances` with 5-min in-memory + DB cache. After payment, call `invalidatePlan(userId)` to force fresh lookup.

## Bot commands

- `/start` — welcome, ref-link auto-bind
- `/cabinet` — magic-login URL
- `/me` (`/dashboard`) — compact dashboard
- `/menu` — main reply-keyboard
- `/withdraw` — payout instructions
- `/banner` — personal QR banner (PNG)
- `/vp` (`/video_promo`) — video-promo assignments
- `/promo`, `/post`, `/qr`, `/short`, `/hashtags`, `/aipost` — promo tools
- In groups: `/members`, `/quiet`, `/active7d`, `/today_active`, `/who`, `/sync`, `/trendex_active` (admin), `/trendex_silent` (admin)

## SEO

- `/sitemap.xml` — index referencing /sitemap-bio.xml
- `/sitemap-bio.xml` — dynamic XML of all public bio pages (up to 5000)
- `/robots.txt` — Disallow /api, /cabinet/api, /cabinet/admin, /webhooks; Allow /bio, /landing
- `/p/:slugId` — product page with Schema.org Product JSON-LD
- `/bio/:username` — public bio page with og + twitter meta

## Architecture notes

- **State**: planner.db (SQLite, persistent on PVC `/data`) is the source of truth for sessions, bio-pages, planner tasks, ad-claims, ad-campaigns, group-tracking. `api.trendex.biz` Postgres holds balance + tariff (single source of truth for money).
- **Cache**: tariff per-user cached 5 min in memory + planner.db (`users.tariff_cached_*`). Invalidate via `invalidatePlan(userId)` after payment success.
- **Bot polling vs webhook**: bot uses long-polling (no webhook URL). To temporarily disable bot polling on this pod, set `CABINET_BOT_POLL_DISABLED=1`.
- **Group silence**: bot is silent by default in 3rd-party groups (only tracker). Admin uses `/trendex_active` to enable announcements.
- **Karma raffle**: weekly Sun 20:00 MSK cron creates `pending_admin` raffle and notifies admins via TG. Admin clicks `🎲 Разыграть` or `⏭ Перенести` → API /internal/karma-raffle/run|skip/:id.

## Key files

- `src/server.js` — Express bootstrap
- `src/web-routes.js` — main API router (5700+ lines, monolithic)
- `src/bot.js` — grammY bot setup + crons (banner, video-distrib, group-silence)
- `src/ads.js` — ad-campaigns + tasks + video-tasks (advertiser/executor flows)
- `src/storage.js` — JSON state.json + cabinet sessions
- `src/helpers/usage-limits.js` — tariff cache + checkLimit/checkLimitAsync
- `src/services/streaks.js` — login_streak counter
- `src/services/video-distribution.js` — video-promo rolling distribution
- `src/services/personal-banner.js` — QR banner PNG generator
- `src/routes/shortener-arsenal.js` — shortener + bio API (ported from arsenal-profi)
- `src/routes/ads-web.js` — ads UI proxy (advertiser/executor)
- `src/routes/ad-center-arsenal.js` — TG autoposting routes
- `src/routes/bio-public-arsenal.js` — public bio SSR
- `public/site/cabinet.html` — main SPA shell (380KB)
- `public/site/js/shortener-bio-arsenal.js` — bio + marketplace UI (4500 lines)
- `public/site/js/ad-center.js` — adcenter UI
- `public/site/js/ads-web.js` — ads-web UI
- `public/site/trendex-ai-chat.js` — AI chat widget (FAB + panel)

## Adding a new cabinet page

1. `<div class="page" id="page-XXX"><div id="XXXContent"></div></div>` in `cabinet.html`
2. Sidebar nav button: `<button class="sb-btn" data-page="XXX" onclick="goPage('XXX')">…</button>`
3. Switcher entry: `else if (name === 'XXX') { if (window.loadXXXPage) window.loadXXXPage(); }`
4. Render function exposed as `window.loadXXXPage`
5. Bump cabinet.html version (or rely on auto-stamp via Dockerfile)
