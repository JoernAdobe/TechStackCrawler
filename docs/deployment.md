# TechStackCrawler – Deployment

## Topologie (Produktion)

```
Browser ──HTTPS──▶ Hub-Caddy (hub/, Ports 80/443)
                     ├─ saleshub.corp.adobe.com   → statische Hub-Seite
                     ├─ techstack.corp.adobe.com  → 172.17.0.1:8516 (dieses Projekt)
                     ├─ rfp.corp.adobe.com        → 172.17.0.1:8513
                     └─ battlemind.corp.adobe.com → 172.17.0.1:8519
techstack-caddy (:8516 → :80) ──▶ techstack-techstack (:3001) ──▶ techstack-mariadb
```

TLS terminiert ausschließlich im Hub-Caddy. Die Zertifikate liegen auf dem Server unter
`/opt/ssl/*.crt|*.key` und werden nur per Volume eingebunden – sie sind **nicht** im Repo.
Der Hub liefert außerdem `banner-inject.js`/`banner.html` aus (Navigationsleiste, die in die
Tools eingebunden wird); beide werden von `make deploy-hub` mit übertragen.

## Port-Matrix (Server)

| Port | Projekt | REMOTE_DIR |
|------|---------|------------|
| 80/443, 8510 | Hub (Caddy) | Hub-Verzeichnis (`HUB_REMOTE_DIR` im Makefile) |
| 8513 | RFP Tool | `/opt/rfp-tool` |
| **8516** | **TechStackCrawler** | `/opt/techstack-crawler` |
| 8519 | BattleMind | – |

## Deployment

```bash
cp .env.deploy.example .env.deploy   # SSH_HOST, REMOTE_DIR, HOST_PORT anpassen
make deploy                          # App
make deploy-hub                      # Hub (nur bei Änderungen in hub/)
```

`make deploy` erstellt vorher ein DB-Backup, baut das Image lokal (`linux/amd64`),
überträgt es per SCP, startet die Container und prüft Health + Commit-Hash.

## Server-`.env` (in `REMOTE_DIR`)

Pflicht: `DB_PASSWORD`, `DB_ROOT_PASSWORD` (Compose bricht ohne sie ab), Bedrock-Zugang,
`OKTA_CLIENT_ID`, `OKTA_CLIENT_SECRET`, `OKTA_REDIRECT_URI`, `ADMIN_EMAILS`.
Optional: `DASHBOARD_EMAIL` + `DASHBOARD_PASSWORD_HASH` (Break-Glass, scrypt-Hash via
`npm run hash-dashboard-password -- '<pw>'`), `CORS_ORIGIN`, `HOST_BIND`, ElevenLabs.
Vollständige Liste: `project/.env.example` und README.

## Härtung (offen – vor breitem Rollout umsetzen)

- `HOST_BIND=172.17.0.1` setzen, damit Port 8516 nur über den Hub (HTTPS) erreichbar ist.
  Dann den Health-Check in `make deploy` auf `ssh … curl http://172.17.0.1:8516/api/health`
  umstellen, da er sonst von außen fehlschlägt.
- **Pflicht:** Egress-Filter für den App-Container (RFC1918, 100.64.0.0/10, 169.254.0.0/16 und
  Docker-Host 172.17.0.1 sperren). Die App-seitigen SSRF-Checks decken nicht alle Browser-Kanäle ab.

## MariaDB & Backup

- MariaDB speichert Analysen, API-Tokens und den TTS-Audio-Cache.
- Backup vor jedem Deploy: `/opt/techstack-backups/techstack_YYYYMMDD_HHMMSS.sql`
  (manuell: `scripts/backup-db.sh`).
