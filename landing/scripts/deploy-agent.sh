#!/usr/bin/env bash
# AgentFlow — deploy an ElizaOS agent from the on-disk queue.
#
# Usage:
#   scripts/deploy-agent.sh <slug>              # apply against the live cluster
#   scripts/deploy-agent.sh <slug> --dry-run    # render + kubectl dry-run only
#
# Steps:
#   1. Load infra/deploy-queue/<slug>.json
#   2. Unseal infra/deploy-queue/<slug>.secrets.enc (XOR/b64, see infra/README.md)
#   3. Render infra/k8s/agent-namespace.template.yaml with the slug/tag/replicas
#   4. Inject decrypted secrets into the Secret's stringData
#   5. kubectl apply (or --dry-run=client)
#   6. Write state transitions back to the queue file:
#        queued → deploying → live     (or failed with an "error" field)
#
# This script is intentionally bash-only so ops folks can run it
# without installing the Node toolchain.
#
# Requires: bash >= 4, kubectl, python3 (for JSON munging — no new npm deps).

set -euo pipefail

SLUG="${1:-}"
DRY_RUN=0
for arg in "${@:2}"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

if [[ -z "$SLUG" ]]; then
  echo "usage: $0 <slug> [--dry-run]" >&2
  exit 2
fi

if [[ ! "$SLUG" =~ ^[a-z][a-z0-9-]{0,31}$ ]]; then
  echo "slug '$SLUG' does not match ^[a-z][a-z0-9-]{0,31}$" >&2
  exit 2
fi

# Repo-relative paths, resolved from the script location so this
# works no matter where it's invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
QUEUE_DIR="$REPO_DIR/infra/deploy-queue"
TEMPLATE="$REPO_DIR/infra/k8s/agent-namespace.template.yaml"
QUEUE_FILE="$QUEUE_DIR/$SLUG.json"
SEALED_FILE="$QUEUE_DIR/$SLUG.secrets.enc"

if [[ ! -f "$QUEUE_FILE" ]]; then
  echo "queue file not found: $QUEUE_FILE" >&2
  exit 1
fi
if [[ ! -f "$TEMPLATE" ]]; then
  echo "k8s template not found: $TEMPLATE" >&2
  exit 1
fi

IMAGE_TAG="${IMAGE_TAG:-latest}"
REPLICAS="${REPLICAS:-1}"
KCTX="${AGENT_K8S_CONTEXT:-}"
KUBECTL=(kubectl)
[[ -n "$KCTX" ]] && KUBECTL+=(--context "$KCTX")

log() { printf '[deploy-agent %s] %s\n' "$SLUG" "$*" >&2; }

# ── mutate queue state ───────────────────────────────────────
# We do this via python3 to avoid adding jq as a dep. The repo
# already assumes a modern Linux/macOS dev env where python3 is
# present (Alpine container ships it too).
write_state() {
  local new_state="$1"
  local err_msg="${2:-}"
  python3 - "$QUEUE_FILE" "$new_state" "$err_msg" <<'PY'
import json, sys, datetime
path, new_state, err_msg = sys.argv[1], sys.argv[2], sys.argv[3]
with open(path) as f:
    data = json.load(f)
data["state"] = new_state
if new_state == "live":
    data["deployed_at"] = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    data.setdefault("ingress_url", f"https://agent-{data['slug']}.agentflow.xyz")
if err_msg:
    data["error"] = err_msg
elif new_state != "failed":
    data.pop("error", None)
with open(path, "w") as f:
    json.dump(data, f, indent=2)
PY
}

# ── unseal secrets ───────────────────────────────────────────
# Mirrors the sealing logic in api/agent-deploy.ts:
#   scheme=base64  → plain base64
#   scheme=xor-b64 → base64(plaintext XOR AGENT_SECRETS_KEY)
unseal_secrets() {
  if [[ ! -f "$SEALED_FILE" ]]; then
    echo "{}"
    return
  fi
  AGENT_SECRETS_KEY="${AGENT_SECRETS_KEY:-}" python3 - "$SEALED_FILE" <<'PY'
import base64, json, os, sys
with open(sys.argv[1]) as f:
    env = json.load(f)
blob = base64.b64decode(env["blob"])
scheme = env.get("scheme", "base64")
if scheme == "xor-b64":
    key = os.environ.get("AGENT_SECRETS_KEY", "").encode("utf-8")
    if not key:
        sys.stderr.write("AGENT_SECRETS_KEY missing but sealed scheme is xor-b64\n")
        sys.exit(3)
    out = bytes(b ^ key[i % len(key)] for i, b in enumerate(blob))
elif scheme == "base64":
    out = blob
else:
    sys.stderr.write(f"unknown seal scheme: {scheme}\n"); sys.exit(3)
secrets = json.loads(out.decode("utf-8"))
# Emit as JSON — the caller hands this to the rendering step.
print(json.dumps(secrets))
PY
}

# ── render template ──────────────────────────────────────────
render_manifest() {
  local secrets_json="$1"
  local tmpl
  tmpl="$(cat "$TEMPLATE")"
  tmpl="${tmpl//\{\{SLUG\}\}/$SLUG}"
  tmpl="${tmpl//\{\{IMAGE_TAG\}\}/$IMAGE_TAG}"
  tmpl="${tmpl//\{\{REPLICAS\}\}/$REPLICAS}"

  # Inject stringData into the `agent-secrets` Secret document.
  # Done in python3 to keep this multi-doc-safe.
  SECRETS_JSON="$secrets_json" MANIFEST_IN="$tmpl" python3 <<'PY'
import os, sys, re, json

manifest = os.environ["MANIFEST_IN"]
secrets = json.loads(os.environ["SECRETS_JSON"])

indent = "  "
if secrets:
    lines = ["stringData:"]
    for k, v in secrets.items():
        # YAML block scalar — preserves leading whitespace and
        # special chars without manual escaping.
        lines.append(f"{indent}{k}: |-")
        for ln in str(v).splitlines() or [""]:
            lines.append(f"{indent}{indent}{ln}")
    block = "\n".join(lines)
else:
    block = "stringData: {}"

# Replace the placeholder "stringData: {}" in the Secret document only.
out = re.sub(r"stringData:\s*\{\}", block, manifest, count=1)
sys.stdout.write(out)
PY
}

main() {
  log "loading queue entry"
  local secrets_json manifest
  if ! secrets_json="$(unseal_secrets)"; then
    write_state failed "unseal failed"
    exit 1
  fi

  manifest="$(render_manifest "$secrets_json")"

  if (( DRY_RUN )); then
    log "--dry-run: printing rendered manifest (secret values redacted below)"
    # Log a redacted copy; apply the real one.
    MANIFEST_IN="$manifest" python3 <<'PY'
import os, re
text = os.environ["MANIFEST_IN"]
# Redact every value line inside a `stringData:` block.
text = re.sub(r"(stringData:\n(?:  [A-Z_][A-Z0-9_]*: \|-\n(?:    .*\n)+)+)",
              lambda m: re.sub(r"(    )(.+)", r"\1***", m.group(0)), text)
print(text)
PY
    log "running kubectl --dry-run=client apply"
    printf '%s' "$manifest" | "${KUBECTL[@]}" apply --dry-run=client -f - >/dev/null
    log "dry-run ok"
    return
  fi

  write_state deploying
  log "kubectl apply"
  if ! printf '%s' "$manifest" | "${KUBECTL[@]}" apply -f -; then
    write_state failed "kubectl apply failed"
    exit 1
  fi

  write_state live
  log "deploy complete — https://agent-${SLUG}.agentflow.xyz"
}

trap 'rc=$?; if (( rc != 0 )); then write_state failed "script exited $rc" || true; fi' ERR
main "$@"
