#!/usr/bin/env bash
# Sales Hub (adobe-tools-hub, Caddy für saleshub/rfp/battlemind/techstack/salesperformance) – einzige Quelle: hub/.
#
#   scripts/hub-deploy.sh check   Drift-Check: weicht der Server vom zuletzt deployten Stand bzw. von hub/ ab?
#   scripts/hub-deploy.sh pull    Server-Stand nach hub/ holen (danach committen) – nach Änderungen direkt auf dem Server
#   scripts/hub-deploy.sh deploy  hub/ ausrollen: Drift-Guard → Backup → in-place schreiben → validieren → Health-Check
#                                 → bei Fehler Rollback → Manifest schreiben. FORCE=1 überschreibt trotz Drift.
#
# Verwaltet werden alle Dateien in hub/ außer README*. Das Manifest (.hub-manifest, sha256) auf dem Server hält fest,
# was zuletzt deployt wurde; jede Abweichung davon ist eine Handänderung auf dem Server und blockiert den Deploy.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -f .env.deploy ] && . ./.env.deploy
: "${SSH_HOST:?SSH_HOST fehlt (.env.deploy)}"
HUB_REMOTE_DIR="${HUB_REMOTE_DIR:-/opt/adobe-tools-hub}"
HUB_PORT="${HUB_PORT:-8510}"
SSH_OPTS=(-q -o ConnectTimeout=20 -o LogLevel=ERROR)
[ -n "${SSH_KEY:-}" ] && SSH_OPTS+=(-i "$ROOT/$SSH_KEY" -o IdentitiesOnly=yes)
HEALTH_URLS=(
  https://saleshub.corp.adobe.com/ https://saleshub.corp.adobe.com/banner-inject.js
  https://saleshub.corp.adobe.com/digest/ https://saleshub.corp.adobe.com/tra/ https://saleshub.corp.adobe.com/story/
  https://rfp.corp.adobe.com/ https://battlemind.corp.adobe.com/ https://techstack.corp.adobe.com/
  https://salesperformance.corp.adobe.com/
)

remote() { ssh "${SSH_OPTS[@]}" "$SSH_HOST" "$@"; }
managed_files() { (cd hub && find . -maxdepth 1 -type f ! -name 'README*' ! -name '.*' | sed 's|^\./||' | LC_ALL=C sort); }
local_manifest() { managed_files | (cd hub && xargs shasum -a 256); }

# Pfade aus docker-compose.yml (./datei), die in hub/ fehlen, würden beim Deploy als leere Verzeichnisse gemountet.
check_compose_mounts() {
  local missing
  missing=$(grep -o '\- \./[^:]*' hub/docker-compose.yml | sed 's|- \./||' | grep -v '^logs$' | while read -r f; do [ -e "hub/$f" ] || echo "$f"; done)
  [ -z "$missing" ] || { echo "FEHLER: in hub/docker-compose.yml gemountet, aber nicht in hub/: $missing" >&2; exit 1; }
}

# Dateien, die auf dem Server seit dem letzten Deploy geändert/neu angelegt wurden (leer = kein Drift).
# Ohne Manifest (Erst-Deploy) wird direkt gegen hub/ verglichen.
detect_drift() {
  # shellcheck disable=SC2029
  remote "cd '$HUB_REMOTE_DIR' && if [ -f .hub-manifest ]; then M=.hub-manifest; else M=/tmp/hub-local.manifest; cat > \$M; fi
    sha256sum -c --quiet \$M 2>/dev/null | sed 's/: .*//'
    ls -1 | grep -v -E '^(logs|backup-.*|.*\\.bak.*|.*\\.new|inspect-backup\\.json)\$' \
      | while read -r f; do grep -q \"  \$f\$\" \$M || echo \"\$f (neu, nicht im Hub-Repo)\"; done
    rm -f /tmp/hub-local.manifest" < <(local_manifest)
}

cmd_check() {
  DRIFT=$(detect_drift)
  if [ -n "$DRIFT" ]; then
    echo ">>> DRIFT: Auf dem Server wurde am Hub vorbei geändert ($HUB_REMOTE_DIR):"
    echo "$DRIFT" | sed 's/^/      /'
    echo ">>> Erst 'make hub-pull' (Server-Stand nach hub/ holen, prüfen, committen), dann erneut deployen."
    return 1
  fi
  echo ">>> Kein Drift: Server entspricht dem zuletzt deployten Stand."
}

cmd_pull() {
  local tmp; tmp=$(mktemp -d)
  # Alle verwalteten Dateien + alles, was die Server-Compose zusätzlich mountet
  # shellcheck disable=SC2029
  remote "cd '$HUB_REMOTE_DIR' && { cat; grep -o -- '- \./[^:]*' docker-compose.yml | sed 's|- \./||'; } | grep -v '^logs\$' | sort -u \
    | while read -r f; do [ -f \"\$f\" ] && echo \"\$f\"; done | tar czf - -T -" < <(managed_files) | tar xzf - -C "$tmp"
  cp "$tmp"/* hub/
  rm -rf "$tmp"
  echo ">>> Server-Stand nach hub/ geholt. Änderungen:"
  git --no-pager status --short hub/
  echo ">>> Prüfen, committen, dann 'make deploy-hub'."
}

health() {
  local bad=0 code u
  for u in "${HEALTH_URLS[@]}"; do
    code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 15 "$u" || echo 000)
    case "$code" in 2*|3*|401) printf '   %s %s\n' "$code" "$u" ;; *) printf '   %s %s  <-- FEHLER\n' "$code" "$u"; bad=1 ;; esac
  done
  return $bad
}

cmd_deploy() {
  check_compose_mounts
  if ! cmd_check; then
    [ "${FORCE:-}" = 1 ] || exit 1
    echo ">>> FORCE=1: Drift wird überschrieben (Backup wird trotzdem angelegt)."
  fi
  local ts; ts=$(date +%Y%m%d_%H%M%S)
  echo ">>> Lade hub/ hoch (Staging) ..."
  remote "rm -rf /tmp/hub-stage && mkdir -p /tmp/hub-stage"
  managed_files | (cd hub && COPYFILE_DISABLE=1 tar --no-xattrs -czf - -T -) | remote "tar xzf - -C /tmp/hub-stage"
  local_manifest | remote "cat > /tmp/hub-stage/.hub-manifest"

  echo ">>> Backup, in-place schreiben, aktivieren ..."
  # shellcheck disable=SC2029
  remote "set -e; cd '$HUB_REMOTE_DIR'; S=/tmp/hub-stage; B=backup-hub-$ts.tgz
    tar czf \"\$B\" \$(ls -1 \$S | while read -r f; do [ -f \"\$f\" ] && echo \"\$f\"; done) \$( [ -f .hub-manifest ] && echo .hub-manifest)
    ls -1t backup-hub-*.tgz | tail -n +15 | xargs -r rm -f
    compose_changed=0; cmp -s \$S/docker-compose.yml docker-compose.yml || compose_changed=1
    for f in \$(ls -1 \$S); do cmp -s \"\$S/\$f\" \"\$f\" 2>/dev/null || cat \"\$S/\$f\" > \"\$f\"; done   # in place: Bind-Mounts behalten den Inode
    chmod 600 Caddyfile docker-compose.yml
    if [ \$compose_changed = 1 ]; then docker compose config -q && HOST_PORT=$HUB_PORT docker compose up -d 2>&1 | tail -2; sleep 4; fi
    docker exec adobe-tools-hub caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 || { echo VALIDATE_FAILED; exit 3; }
    docker exec adobe-tools-hub caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | grep -i error || true
    echo \"\$B\" > /tmp/hub-last-backup" || { echo ">>> FEHLER beim Aktivieren – Rollback"; rollback "$ts"; exit 1; }

  sleep 2
  echo ">>> Health-Check:"
  if ! health; then echo ">>> Health-Check fehlgeschlagen – Rollback"; rollback "$ts"; exit 1; fi
  remote "cd '$HUB_REMOTE_DIR' && cat /tmp/hub-stage/.hub-manifest > .hub-manifest && rm -rf /tmp/hub-stage"
  echo ">>> Hub deployt (Backup: $HUB_REMOTE_DIR/backup-hub-$ts.tgz, Manifest aktualisiert)."
}

rollback() {
  # shellcheck disable=SC2029
  remote "set -e; cd '$HUB_REMOTE_DIR'; B=backup-hub-$1.tgz; [ -f \"\$B\" ] || exit 0; R=\$(mktemp -d); tar xzf \"\$B\" -C \$R
    compose_changed=0; cmp -s \$R/docker-compose.yml docker-compose.yml || compose_changed=1
    for f in \$(ls -A1 \$R); do cat \"\$R/\$f\" > \"\$f\"; done; rm -rf \$R /tmp/hub-stage
    if [ \$compose_changed = 1 ]; then HOST_PORT=$HUB_PORT docker compose up -d 2>&1 | tail -1; sleep 4; fi
    docker exec adobe-tools-hub caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile 2>&1 | grep -i error || true; echo 'Rollback OK'"
  health || true
}

case "${1:-}" in
  check) cmd_check ;;
  pull) cmd_pull ;;
  deploy) cmd_deploy ;;
  *) echo "usage: $0 check|pull|deploy" >&2; exit 2 ;;
esac
