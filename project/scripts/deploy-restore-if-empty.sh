#!/bin/sh
# Läuft auf dem Server nach docker compose up.
# Wenn analyses-Tabelle leer ist und ein Backup existiert → Restore.
set -e
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . .env && set +a
CONTAINER="${CONTAINER_PREFIX:-techstack-}mariadb"
# Kein Default-Passwort mehr: Ein stiller Fallback würde bei fehlender .env
# gegen ein fremdes/altes Passwort laufen und den Restore unbemerkt überspringen.
ROOT_PW="${DB_ROOT_PASSWORD:-}"
if [ -z "$ROOT_PW" ]; then
  echo ">>> DB_ROOT_PASSWORD nicht gesetzt – Restore übersprungen." >&2
  exit 0
fi
COUNT=$(docker exec "$CONTAINER" mariadb -u root -p"$ROOT_PW" -N -e "SELECT COUNT(*) FROM techstack_crawler.analyses" 2>/dev/null || echo "0")
if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  LATEST=$(ls -t /opt/techstack-backups/techstack_*.sql 2>/dev/null | head -1)
  if [ -n "$LATEST" ]; then
    echo ">>> DB leer – Restore aus $LATEST"
    docker exec -i "$CONTAINER" mariadb -u root -p"$ROOT_PW" techstack_crawler < "$LATEST"
    echo ">>> Restore OK"
  fi
fi
