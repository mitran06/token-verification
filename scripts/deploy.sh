#!/usr/bin/env bash
# Pull-based auto-deploy, run by a systemd timer on the VM (see
# scripts/amrita-deploy.{service,timer}). Safe for a public repo: this host runs
# NO GitHub Actions runner, so no PR/fork code ever executes here — it only pulls
# and deploys commits that are already on origin/main AND passed CI.
#
# On each tick: if origin/main advanced and its GitHub checks succeeded, reset to
# it, rebuild + redeploy, wait for the app to become healthy, and AUTO-ROLL-BACK
# to the previous commit if anything fails.
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/token-verification}"
GH_REPO="${GH_REPO:-mitran06/token-verification}"
BRANCH="${BRANCH:-main}"
DC="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

log() { echo "[deploy $(date -Is)] $*"; }

cd "$REPO_DIR"
git fetch --quiet --prune origin "$BRANCH"
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")
[ "$LOCAL" = "$REMOTE" ] && exit 0 # nothing new

# --- CI gate: only deploy a commit whose GitHub checks all succeeded. Public
# repo → no auth needed. Degrades gracefully if the API is unreachable. ---
if command -v jq >/dev/null 2>&1 && command -v curl >/dev/null 2>&1; then
  runs=$(curl -fsS "https://api.github.com/repos/$GH_REPO/commits/$REMOTE/check-runs" 2>/dev/null || echo "")
  if [ -n "$runs" ] && [ "$(echo "$runs" | jq '.total_count')" -gt 0 ]; then
    failed=$(echo "$runs" | jq '[.check_runs[] | select(.conclusion=="failure" or .conclusion=="cancelled" or .conclusion=="timed_out")] | length')
    pending=$(echo "$runs" | jq '[.check_runs[] | select(.status!="completed")] | length')
    if [ "$failed" -gt 0 ]; then log "CI failed for ${REMOTE:0:8} — not deploying"; exit 0; fi
    if [ "$pending" -gt 0 ]; then log "CI still running for ${REMOTE:0:8} — waiting"; exit 0; fi
  fi
fi

PREV=$LOCAL
log "deploying ${REMOTE:0:8} (from ${PREV:0:8})"

rollback() {
  log "ROLLBACK to ${PREV:0:8}"
  git reset --hard "$PREV"
  $DC up -d --build || log "ROLLBACK FAILED — manual intervention required"
}

git reset --hard "origin/$BRANCH" # leaves untracked/gitignored .env + backups/ intact

if ! $DC up -d --build; then
  log "compose up failed"
  rollback
  exit 1
fi

# The app only starts once the one-off `migrate` service completes successfully
# (depends_on: service_completed_successfully), so "app healthy" is the real gate
# — a failed migration => app never starts => never healthy => rollback.
healthy=false
for _ in $(seq 1 40); do
  cid=$($DC ps -q app 2>/dev/null || true)
  if [ -n "$cid" ]; then
    h=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)
    if [ "$h" = "healthy" ]; then
      healthy=true
      break
    fi
  fi
  sleep 3
done

if [ "$healthy" != "true" ]; then
  log "app did not become healthy"
  rollback
  exit 1
fi

docker image prune -f --filter "until=168h" >/dev/null 2>&1 || true # keep ~1 week of rollback images
log "deployed ${REMOTE:0:8} OK"
