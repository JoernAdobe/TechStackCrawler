#!/bin/sh
# Läuft auf dem Server nach docker compose up.
# Wenn analyses-Tabelle leer ist und ein Backup existiert → Restore.
set -e
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . .env && set +a
CONTAINER="${CONTAINER_PREFIX:-techstack-}mariadb"
ROOT_PW="${DB_ROOT_PASSWORD:-techstack_root}"
COUNT=$(docker exec "$CONTAINER" mariadb -u root -p"$ROOT_PW" -N -e "SELECT COUNT(*) FROM techstack_crawler.analyses" 2>/dev/null || echo "0")
if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  LATEST=$(ls -t /opt/techstack-backups/techstack_*.sql 2>/dev/null | head -1)
  if [ -n "$LATEST" ]; then
    echo ">>> DB leer – Restore aus $LATEST"
    docker exec -i "$CONTAINER" mariadb -u root -p"$ROOT_PW" techstack_crawler < "$LATEST"
    echo ">>> Restore OK"
  fi
fi
