# Monar (dormant)

Web UI (cabinet + admin) + Telegram bot commands for Monar / Golden Connect.

**Status: dormant.** Nothing here is required by `src/server.js` or
`src/bot.js`. The files exist so the activation PR is a 2-line change.

## Files

| File | Role |
|---|---|
| `routes.js` | Express router with `/cabinet/lots|team|card|admin` placeholders. NOT mounted. |
| `bot-commands.js` | grammy command handlers `/lots /team /balance`. NOT registered. |
| `api-client.js` | thin fetch wrapper to talk to `golden-connect-api`'s `/api/monar/*`. Reads `MONAR_API_BASE` env. |

All money flows go through `golden-connect-api`. The cabinet's SQLite is for
bot-state only — Monar never writes to it.

## How to activate (later)

1. In `src/server.js`, after the other route mounts, add:

   ```js
   const monarRoutes = require('./monar/routes');
   app.use('/cabinet', monarRoutes);
   ```

2. In `src/bot.js`, after other `bot.command(...)` lines, add:

   ```js
   require('./monar/bot-commands').register(bot, config);
   ```

3. Set env `MONAR_API_BASE=http://golden-connect-api/api/monar` (cluster DNS).

Until those changes land, this directory is dead weight — safe.
