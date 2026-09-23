#!/bin/bash
# MariaDB Backup für TechStackCrawler (auf dem Server ausführen)
# Verwendung: ./backup-db.sh [REMOTE_DIR]

REMOTE_DIR="${1:-/opt/techstack-crawler}"
BACKUP_DIR="/opt/techstack-backups"
CONTAINER_NAME="techstack-mariadb"
DB_NAME="techstack_crawler"

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/techstack_${TIMESTAMP}.sql"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  # Kein Default-Passwort: sonst erzeugt ein fehlerhafter Lauf eine leere
  # Backup-Datei, die ein echtes Backup überschreiben könnte.
  if [ -z "${DB_ROOT_PASSWORD:-}" ]; then
    echo "DB_ROOT_PASSWORD nicht gesetzt – Backup abgebrochen" >&2
    exit 1
  fi
  docker exec "$CONTAINER_NAME" mariadb-dump -u root -p"${DB_ROOT_PASSWORD}" \
    --single-transaction --routines --triggers "$DB_NAME" > "$BACKUP_FILE"
  echo "Backup erstellt: $BACKUP_FILE"
else
  echo "Container $CONTAINER_NAME nicht gefunden – kein Backup möglich"
  exit 1
fi
