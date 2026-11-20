# Sales Hub (`adobe-tools-hub`)

Gemeinsamer Caddy auf dem V-Server (`/opt/adobe-tools-hub`, 10.42.71.232): einzige TLS-Terminierung für
`saleshub` (Landing Page + `/digest/`, `/tra/`, `/story/`), `techstack`, `rfp`, `battlemind`, `salesperformance`.

## Regel: Dieses Verzeichnis ist die einzige Quelle

Jede Änderung am Hub (Kachel, Route, Header, Zertifikat-Mount, Banner), auch aus anderen Repos
(Tech Approval, Experience Story Studio, Sales Digest, Sales Performance), wird **hier** gemacht und mit
`make deploy-hub` ausgerollt. Kein `sed`, `scp` oder Patch-Skript direkt auf dem Server.

Hintergrund: Am 20.11.2026 hat ein `deploy-hub` aus einem veralteten `hub/` die Server-Patches anderer Tools
überschrieben (TRA-/Story-Kacheln, `/digest/`, Log-Filter, salesperformance-Zertifikat). Mehrere Tools waren
dadurch nicht erreichbar.

## Befehle

| Befehl | Wirkung |
|---|---|
| `make hub-check` | Drift-Check: Server gegen das Manifest des letzten Deploys (`.hub-manifest`, sha256), inkl. neuer Dateien |
| `make deploy-hub` | Drift-Guard → Backup (`backup-hub-<ts>.tgz`, 14 bleiben) → in place schreiben → bei Compose-Änderung `up -d` → `caddy validate`/`reload` → Health-Check aller Hosts → bei Fehler Rollback → Manifest |
| `make hub-pull` | Server-Stand (verwaltete Dateien + alle Compose-Mounts) nach `hub/` holen |
| `FORCE=1 make deploy-hub` | Drift bewusst überschreiben (nur nach Prüfung; Backup wird trotzdem angelegt) |

## Notfall-Hotfix direkt auf dem Server

Wenn es doch sein muss: Fix auf dem Server, danach **sofort** `make hub-pull`, Diff prüfen und committen.
Solange das fehlt, blockiert der Drift-Guard jeden `deploy-hub`. Damit wird der Hotfix nicht mehr still überschrieben.

## Hinweise

- Einzeldatei-Bind-Mounts: Dateien in place schreiben (`cat neu > datei`), nie `mv`/`sed -i`, sonst sieht der Container den alten Inode.
- Neue Datei (z. B. Kachelbild) → in `hub/` ablegen **und** in `docker-compose.yml` mounten; das Skript bricht ab, wenn ein Mount in `hub/` fehlt.
- Zertifikate (`/opt/ssl/*`) liegen nur auf dem Server, nie im Repo.
- Verwaltet werden alle Dateien in `hub/` außer `README*` und Dotfiles.
