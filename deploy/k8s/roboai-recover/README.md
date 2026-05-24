# roboai-engine schema self-heal (Neon→self-hosted PG recovery)

## Why this exists

On 2026-05-20 the Trendex DB moved Neon → self-hosted `trendex-postgres`. The move
replayed only **committed** prisma migrations (newest `20260512300000_account_spambot`).
Everything added later via `prisma db push` / raw SQL — never committed — was lost:

- CRM messenger tables (`CrmConversation`, `CrmConversationMessage`, `CrmDailyCap`, `CrmFolder`)
- `AdCampaign` deposit-billing columns (`balanceCents`, `autoTopup`, …) + enum `PAUSED_NO_FUNDS`
- `Campaign.maxNewDialogsPerAccountPerDay`, `Dialog.adCampaignId/firstMessageSentAt`
- tables `CampaignBilling`, `MlmPayout`

Symptoms: `crm.trendex.biz` → HTTP 500 (`42P01 relation "roboai.CrmConversation" does not exist`),
BillingCron/AdCampaignDispatcher crashing (`42703 column "balanceCents" does not exist`).

> Root fragility: the roboai-engine **source** for the CRM service/cron/folders and the
> whole `billing` module is NOT in the `alphaleaderss/Roboaisender` repo — it lives only as
> compiled `dist` inside the GHCR image. The repo cannot be cleanly rebuilt. Until the source
> is recovered, treat the running image + this SQL as the source of truth.

## How it self-heals now

`roboai-schema-recover.sql` is **idempotent** (`CREATE TABLE IF NOT EXISTS`,
`ADD COLUMN IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`). It is mounted into the
roboai-engine pod as a ConfigMap and runs on **every boot** before the app starts:

```
sh -c "npx prisma db execute --schema=prisma/schema.prisma --file=/sql/recover.sql \
       && echo '[recover] schema ensured' || echo '[recover] skipped (non-fatal)'; \
       npx prisma migrate deploy && node dist/main.js"
```

The `|| ...` makes it non-fatal: if the SQL step ever errors, the engine still starts
(degrades to prior behaviour) — no crashloop. On a fresh/empty DB the SQL recreates the
full CRM/billing schema; on the existing DB it is a no-op.

## (Re)apply manually

```bash
# 1. ConfigMap (holds the SQL)
kubectl create configmap roboai-schema-recover -n trendex \
  --from-file=recover.sql=deploy/k8s/roboai-recover/roboai-schema-recover.sql \
  --dry-run=client -o yaml | kubectl apply -f -

# 2. Patch the engine deploy to mount it + run on boot
kubectl patch deploy roboai-engine -n trendex \
  --patch-file deploy/k8s/roboai-recover/roboai-engine-selfheal.patch.yaml

# 3. (one-off, optional) apply straight to the DB without waiting for a restart
PGPOD=$(kubectl get pods -n trendex -l app=trendex-postgres -o jsonpath='{.items[0].metadata.name}')
kubectl cp deploy/k8s/roboai-recover/roboai-schema-recover.sql trendex/$PGPOD:/tmp/r.sql
kubectl exec -n trendex $PGPOD -- psql -U trendex_owner -d trendex -f /tmp/r.sql
```

## Durability

- `trendex-postgres.yaml` — self-hosted PG, PVC `trendex-postgres-data` (20Gi, local-path).
- `trendex-postgres-backup.yaml` — CronJob every 6h: `pg_dump` all schemas (incl. `roboai`)
  → gzip → Telegram channel via @Trendex_bizbot, keeps last 12. Restores include CRM/billing.
