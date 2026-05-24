# ghcr-pull — GHCR imagePullSecret

All three deployments reference `imagePullSecrets: [{ name: ghcr-pull }]`. It is
**not** committed — create it once per cluster after generating a GitHub
Personal Access Token (classic) with the `read:packages` scope.

```bash
# On the server (or any machine with kubectl pointed at the cluster):
export GHCR_USER=lnlockly
export GHCR_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
export GHCR_EMAIL=you@example.com

kubectl -n trendex create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username="$GHCR_USER" \
  --docker-password="$GHCR_TOKEN" \
  --docker-email="$GHCR_EMAIL" \
  --dry-run=client -o yaml | kubectl apply -f -
```

To rotate: re-run the same command with a fresh token — the `--dry-run | apply`
pattern makes it idempotent.
