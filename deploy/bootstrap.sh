#!/usr/bin/env bash
#
# One-shot server-side bootstrap for trendex.biz.
#
# Run ONCE on the k3s host after filling in:
#   deploy/prod.api.env    (see prod.api.env.example)
#   deploy/prod.bot.env    (see prod.bot.env.example)
#   GHCR_USER / GHCR_TOKEN / GHCR_EMAIL env vars exported in this shell
#
# Idempotent: every step uses `kubectl apply` so re-running is safe.
set -euo pipefail

NS=trendex
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

need() {
  if [ -z "${!1:-}" ]; then
    echo "missing env: $1" >&2
    exit 1
  fi
}

need GHCR_USER
need GHCR_TOKEN
need GHCR_EMAIL

[ -f "$HERE/prod.api.env" ] || { echo "missing $HERE/prod.api.env (copy from prod.api.env.example)"; exit 1; }
[ -f "$HERE/prod.bot.env" ] || { echo "missing $HERE/prod.bot.env (copy from prod.bot.env.example)"; exit 1; }

echo "==> namespace $NS"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f -

echo "==> ghcr-pull imagePullSecret"
kubectl -n "$NS" create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username="$GHCR_USER" \
  --docker-password="$GHCR_TOKEN" \
  --docker-email="$GHCR_EMAIL" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> trendex-api-env"
kubectl -n "$NS" create secret generic trendex-api-env \
  --from-env-file="$HERE/prod.api.env" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> trendex-bot-env"
kubectl -n "$NS" create secret generic trendex-bot-env \
  --from-env-file="$HERE/prod.bot.env" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> applying manifests"
kubectl apply -f "$HERE/k8s/"

echo "==> waiting for rollouts"
kubectl -n "$NS" rollout status deploy/trendex-api     --timeout=5m || true
kubectl -n "$NS" rollout status deploy/trendex-bot     --timeout=5m || true
kubectl -n "$NS" rollout status deploy/trendex-landing --timeout=5m || true

echo
echo "done. Verify:"
echo "  curl -sS https://api.trendex.biz/health | jq"
echo "  curl -sS -o /dev/null -w '%{http_code}\n' https://trendex.biz"
echo "  kubectl -n $NS get pods,ingress,certificate"
