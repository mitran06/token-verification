#!/bin/sh
# Nightly pg_dump → /backups (keep 14 days). Run by the compose 'backup' service.
set -e
TS=$(date +%F_%H%M)
OUT="/backups/token-${TS}.dump"
echo "[backup] $(date) -> $OUT"
pg_dump -h db -U postgres -d token_system -Fc -f "$OUT"
find /backups -name 'token-*.dump' -mtime +14 -delete 2>/dev/null || true
echo "[backup] done. Restore with: pg_restore -h db -U postgres -d token_system -c <file>"
