# TrendeX — hosted ElizaOS infrastructure

This directory owns everything between `POST /api/agent-deploy` and
a live agent serving traffic inside our k3s cluster.

## Architecture

```
  ┌────────────────────────┐
  │  landing (React)       │
  │  /agents/new           │
  └──────────┬─────────────┘
             │  POST /api/agent-deploy
             │    { character, plugins, secrets, contact, lang }
             ▼
  ┌────────────────────────┐     ┌──────────────────────────┐
  │  api/agent-deploy.ts   │───► │ Telegram alert           │
  │  (validate + seal)     │     │ chat=TG_CHAT_ID          │
  │                        │     │ topic=TG_TOPIC_DEPLOY    │
  │                        │     └──────────────────────────┘
  │        writes           │
  ▼                        ▼
infra/deploy-queue/     infra/deploy-queue/
  <slug>.json             <slug>.secrets.enc
(state + redacted       (XOR-b64 sealed, mode 0600)
 copy of request)
             │
             │   scripts/deploy-agent.sh <slug> [--dry-run]
             ▼
  ┌────────────────────────┐
  │  render k8s template   │  ← infra/k8s/agent-namespace.template.yaml
  │  kubectl apply -f -    │
  └──────────┬─────────────┘
             ▼
  ┌────────────────────────────────────────────────────────┐
  │  k3s namespace: agent-<slug>                           │
  │   ├─ Deployment (ghcr.io/lnlockly/trendex-agent:...) │
  │   ├─ Service   (ClusterIP :80 → pod :3000)             │
  │   ├─ Ingress   (agent-<slug>.trendex.xyz, TLS)       │
  │   ├─ Secret    (agent-secrets, envFrom)                │
  │   └─ NetworkPolicy (default-deny + DNS/HTTPS egress)   │
  └────────────────────────────────────────────────────────┘
             ▲
             │  GET /api/agent-status?slug=<slug>
             │    → { state: queued|deploying|live|failed, ingress_url? }
             │  (reads the queue file, no k8s calls)
             └── landing polling
```

## Endpoints

| Method | Path                                 | Owner file                 |
|-------:|--------------------------------------|----------------------------|
| POST   | `/api/agent-deploy`                  | `api/agent-deploy.ts`      |
| GET    | `/api/agent-status?slug=<slug>`      | `api/agent-status.ts`      |

Both are mounted from `server/index.ts`.

## Environment variables

The landing and the deploy script share the same env file.

| Var                     | Where    | What                                                                 |
|-------------------------|----------|----------------------------------------------------------------------|
| `ANTHROPIC_API_KEY`     | api      | already in use by `api/chat.ts`                                      |
| `TG_BOT_TOKEN`          | api      | Bot API token for the deploy alert                                   |
| `TG_CHAT_ID`            | api      | forum chat that receives deploy alerts                               |
| `TG_TOPIC_DEPLOY`       | api      | (optional) integer thread id for `agent_deploy` track                |
| `AGENT_SECRETS_KEY`     | api + sh | key for XOR-sealing `<slug>.secrets.enc`. If unset, falls back to plain base64 — see MVP caveat below |
| `AGENT_K8S_CONTEXT`     | sh       | (optional) `kubectl --context` to target a specific cluster          |
| `IMAGE_TAG`             | sh       | docker tag for the agent image, default `latest`                     |
| `REPLICAS`              | sh       | `Deployment.replicas`, default `1`                                   |

See `.env.example` at the repo root for the canonical list.

## Local dry-run

No cluster? No problem. The deploy script has a `--dry-run` flag
that renders the manifest and calls `kubectl --dry-run=client`
(which validates client-side, no API server required).

```bash
# 1. Simulate a deploy request locally
curl -sS -X POST http://localhost/api/agent-deploy \
  -H 'content-type: application/json' \
  -d '{
    "track": "agent_deploy",
    "character": {
      "name": "Ada",
      "bio": ["a helpful research assistant"]
    },
    "plugins": [
      "@elizaos/plugin-bootstrap",
      "@elizaos/plugin-anthropic",
      "@elizaos/plugin-node"
    ],
    "secrets": { "ANTHROPIC_API_KEY": "sk-ant-demo" },
    "contact": "@me",
    "lang": "en"
  }'
# → { ok: true, slug: "ada", queued_at: "...", status_url: "/api/agent-status?slug=ada" }

# 2. Dry-run the k8s apply (kubectl must be installed; no cluster needed)
AGENT_SECRETS_KEY=devkey scripts/deploy-agent.sh ada --dry-run

# 3. Poll status
curl -sS "http://localhost/api/agent-status?slug=ada"
```

## Deploying for real

```bash
# Real apply against the configured context.
AGENT_SECRETS_KEY="$prod_key" \
  AGENT_K8S_CONTEXT=prod-k3s \
  IMAGE_TAG=v42 \
  scripts/deploy-agent.sh ada
```

The script mutates `infra/deploy-queue/<slug>.json`:
`queued → deploying → live` (or `failed` with an `error` field).

## Revoking a live agent

```bash
kubectl --context="$AGENT_K8S_CONTEXT" delete namespace "agent-<slug>"
# and remove its queue trail
rm infra/deploy-queue/<slug>.json infra/deploy-queue/<slug>.secrets.enc
```

Namespace deletion cascades to the Deployment / Secret / Ingress /
NetworkPolicy, so one command is enough.

## Secret sealing — MVP caveat

The "sealing" in `api/agent-deploy.ts` is a placeholder:

- If `AGENT_SECRETS_KEY` is set we XOR the JSON plaintext against
  that key and base64 the result.
- If it isn't set we just base64 the plaintext and log a warning.

**This is not production-grade crypto.** XOR with a static key
gives zero guarantees against an attacker who can read the file
and has any partial plaintext knowledge (and secret keys are
predictable). It's here purely so we don't accidentally grep a
live token out of disk during MVP demos.

Before handling real customer funds or any production credentials
we must swap this for one of:

- [bitnami-labs/sealed-secrets](https://github.com/bitnami-labs/sealed-secrets)
  — encrypt at intake with a cluster public key, decrypt only inside
  the target cluster. Matches our "never hold plaintext outside the
  cluster" story.
- HashiCorp Vault with the k8s auth method + Agent injector.

## Known TODOs

- [ ] **Real sealed-secrets**: see above. Highest priority.
- [ ] **Per-plugin egress allowlist**: the `NetworkPolicy` currently
      allows all HTTPS out. Enumerate the plugins' endpoints and
      restrict per-agent.
- [ ] **Horizontal autoscaling**: HPA based on CPU + custom queue
      metric (agent-specific).
- [ ] **SLA monitoring**: Prometheus scrape + alerts on
      readinessProbe failures; per-agent uptime in the landing UI.
- [ ] **Per-agent billing meter**: pod CPU-seconds + egress bytes
      → invoice line item; feeds into the tokenomics model.
- [ ] **cert-manager ClusterIssuer wiring**: the Ingress annotations
      assume `letsencrypt-prod` exists cluster-wide. Needs to be
      provisioned by the infra-team base chart, not here.
- [ ] **Character-specific image build pipeline**: right now the
      Deployment references `ghcr.io/lnlockly/trendex-agent:<tag>`,
      a single shared image. Move to buildkit-on-k8s that bakes
      each agent's character + plugin list into its own image and
      pushes to GHCR.
- [ ] **Queue backend**: `infra/deploy-queue/*.json` is fine for
      demo; migrate to Postgres or Redis Streams once we have more
      than a couple deploys per minute.
