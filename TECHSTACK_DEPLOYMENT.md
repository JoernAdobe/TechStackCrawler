# TechStackCrawler – Deployment

Siehe **DEPLOYMENT_COMPLETE.md** für die allgemeine Multi-Projekt-Dokumentation.

## Port-Matrix (Server 10.42.71.232)

| Port | Projekt        | REMOTE_DIR           |
|------|----------------|----------------------|
| 8513 | RFP Tool       | `/opt/rfp-tool`      |
| 8514 | Projekt 2      | `/opt/projekt2`      |
| 8515 | Projekt 3      | `/opt/projekt3`      |
| **8516** | **TechStackCrawler** | `/opt/techstack-crawler` |

**TechStackCrawler nutzt Port 8516** – keine Überschneidung mit anderen Projekten.

## Deployment

```bash
cp .env.deploy.example .env.deploy
# .env.deploy anpassen: SSH_HOST, REMOTE_DIR, HOST_PORT=8516

make deploy
```

## Nach dem Deploy

- **App:** `http://10.42.71.232:8516`
- **Container:** `techstack-techstack` (Präfix vermeidet Konflikte mit RFP Tool etc.)

## MariaDB & Backup

- **MariaDB** speichert alle Analysen und TTS-Audio-Cache
- **Backup** vor jedem Deploy: `/opt/techstack-backups/techstack_YYYYMMDD_HHMMSS.sql`
- `.env` auf dem Server muss enthalten: `DB_PASSWORD`, `DB_ROOT_PASSWORD`

## Unterschied zu RFP Tool

TechStackCrawler nutzt **MariaDB** für Analysen und Audio-Cache, aber **kein Redis**.
