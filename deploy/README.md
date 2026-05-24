# deploy/ — golden-connect.to on k3s

Everything infra lives here. Service code is untouched.

```
deploy/
├── k8s/                  # namespace + api/bot/landing manifests
│   ├── namespace.yaml
│   ├── api.yaml
│   ├── bot.yaml
│   ├── landing.yaml
│   └── registry-secret.md
├── prod.api.env.example  # → deploy/prod.api.env  (gitignored)
├── prod.bot.env.example  # → deploy/prod.bot.env  (gitignored)
├── bootstrap.sh          # one-shot server-side setup
└── README.md
```

## Cluster assumptions

- k3s v1.34.x on `144.217.65.94` (user `ubuntu`)
- `ingress-nginx` installed (IngressClass `nginx`)
- `cert-manager` installed with a `ClusterIssuer` named **`letsencrypt-prod`**
  using HTTP-01 solver via ingress-nginx. If you don't have one yet, apply
  something like:

  ```yaml
  apiVersion: cert-manager.io/v1
  kind: ClusterIssuer
  metadata:
    name: letsencrypt-prod
  spec:
    acme:
      server: https://acme-v02.api.letsencrypt.org/directory
      email: REPLACE_WITH_A_REAL_EMAIL   # required by Let's Encrypt
      privateKeySecretRef:
        name: letsencrypt-prod-account-key
      solvers:
        - http01:
            ingress:
              class: nginx
  ```

  **⚠ Let's Encrypt requires a valid email** on the ClusterIssuer — use a
  mailbox you actually read, Let's Encrypt sends expiry warnings there.

## 1 · DNS records

Point the domain at the k3s node. Add all three at your DNS provider:

| Type | Host             | Value             | TTL |
|------|------------------|-------------------|-----|
| A    | `golden-connect.to`    | `144.217.65.94`   | 300 |
| A    | `www.golden-connect.to`| `144.217.65.94`   | 300 |
| A    | `api.golden-connect.to`| `144.217.65.94`   | 300 |

Verify with `dig +short golden-connect.to` before the first deploy — Let's Encrypt
won't issue a cert until the A records resolve.

## 2 · GitHub repo settings

The CI workflow (`.github/workflows/deploy.yml`) needs:

**Repository variables** (Settings → Secrets and variables → Actions → Variables):

| Name          | Value           |
|---------------|-----------------|
| `DEPLOY_HOST` | `144.217.65.94` |
| `DEPLOY_USER` | `ubuntu`        |

**Repository secrets** (Settings → Secrets and variables → Actions → Secrets):

| Name             | Value                                                                 |
|------------------|-----------------------------------------------------------------------|
| `DEPLOY_SSH_KEY` | Private SSH key (contents of `~/.ssh/id_ed25519`) paired with the public key already in `ubuntu@144.217.65.94:~/.ssh/authorized_keys` |

`GITHUB_TOKEN` is supplied automatically and has `packages:write` for
`ghcr.io/lnlockly/golden-connect-{api,bot,landing}`.

## 3 · Server-side one-shot bootstrap

SSH to the node, clone the repo (or just `scp deploy/` over), then:

```bash
ssh ubuntu@144.217.65.94
git clone https://github.com/lnlockly/golden-connect.git
cd golden-connect/deploy

# 3.1 fill in prod env files
cp prod.api.env.example prod.api.env && $EDITOR prod.api.env
cp prod.bot.env.example prod.bot.env && $EDITOR prod.bot.env

# 3.2 set GHCR creds (classic PAT with read:packages)
export GHCR_USER=lnlockly
export GHCR_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
export GHCR_EMAIL=you@example.com

# 3.3 run bootstrap
./bootstrap.sh
```

After this, the cluster has: namespace `golden-connect`, `ghcr-pull` secret,
`golden-connect-api-env` + `golden-connect-bot-env` secrets, and all three deployments.

Cert-manager will fetch TLS certs on first ingress apply (~30–90s). Watch:

```bash
kubectl -n golden-connect get certificate -w
```

## 4 · First push to main

From your dev machine:

```bash
git add deploy/ .github/ api/Dockerfile landing/Dockerfile landing/nginx.conf
git commit -m "infra: k8s + CI/CD for golden-connect.to"
git push origin main
```

GitHub Actions then:
1. builds & pushes `ghcr.io/lnlockly/golden-connect-{api,bot,landing}:<sha>` + `:latest`
2. SSHes to `ubuntu@144.217.65.94`
3. `kubectl apply -f deploy/k8s/` (ensures manifests stay in sync)
4. `kubectl -n golden-connect set image deploy/golden-connect-<x> golden-connect-<x>=...:<sha>`
5. `kubectl rollout status` (3 min timeout each)

## Verify

```bash
# from anywhere:
curl -sS https://api.golden-connect.to/health | jq
curl -sS -o /dev/null -w '%{http_code}\n' https://golden-connect.to         # → 200
curl -sS -o /dev/null -w '%{http_code}\n' https://www.golden-connect.to     # → 308 to apex

# on the node:
kubectl -n golden-connect get pods,svc,ingress,certificate
kubectl -n golden-connect logs deploy/golden-connect-api --tail=50
```

## Database notes

For the MVP, `DATABASE_URL` points at the shared Neon project used by
`agentflow` + `trandx-dev`. Migrations run via an `initContainer` in
`api.yaml` (`npx drizzle-kit migrate`) on every rollout — `drizzle-kit` skips
migrations already recorded in `__drizzle_migrations`, so re-runs are safe.

**Before public launch**, create a dedicated Neon branch / project for
production, update `prod.api.env.DATABASE_URL`, re-run `bootstrap.sh` (it
rewrites the secret), and trigger a rollout restart:

```bash
kubectl -n golden-connect rollout restart deploy/golden-connect-api
```

## Rotating the bot token

1. Update `deploy/prod.bot.env` on the server.
2. `./bootstrap.sh` — rewrites the `golden-connect-bot-env` secret.
3. `kubectl -n golden-connect rollout restart deploy/golden-connect-bot`.
