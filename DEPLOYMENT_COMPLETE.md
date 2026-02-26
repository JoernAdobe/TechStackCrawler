# Deployment-Dokumentation (portabel & Multi-Projekt)

Vollständige Anleitung für Docker-Build, Server-Upload und Secrets. Portabel für neue Projekte und vorbereitet für parallele Multi-Projekt-Installationen auf demselben Server.

---

## 1. Voraussetzungen

### Lokal (Build- und Deploy-Maschine)

- **Node.js 20** (für Frontend-Build)
- **Python 3.11** (für Backend, optional lokal)
- **Docker** und **Docker Compose** (Plugin)
- **SSH-Client** (mit `ssh` und `scp`)
- **SSH-Key** im Projektroot (z.B. `BattleMindAI_Dev_57819.txt`)

### Auf dem Server

- **Ubuntu** (oder kompatibles Linux)
- **Docker** wird bei Bedarf automatisch installiert (siehe `deploy.sh`)

### Vor dem ersten Deploy

- **`.env`** (oder `backend/.env`) mit allen erforderlichen Variablen (siehe Abschnitt 5)
- **SSH-Zugang** zum Server (root oder sudo-fähiger User)

---

## 2. Projekt-spezifische Konfiguration (Checkliste für neues Projekt)

Für jedes Projekt bzw. jede Installation auf dem Server anpassen:

| Variable | Beschreibung | Beispiel (RFP Tool) | Projekt 2 |
|----------|--------------|---------------------|-----------|
| `PROJECT_NAME` | Projektname (für Logs) | `rfp-tool` | `mein-projekt` |
| `REMOTE_DIR` | Zielverzeichnis auf dem Server | `/opt/rfp-tool` | `/opt/mein-projekt` |
| `HOST_PORT` | Öffentlicher Port (Host) | `8513` | `8514` |
| `CONTAINER_PREFIX` | Präfix für Container-Namen | `rfp-` | `mein-` |
| `DB_NAME` | MariaDB Datenbankname (eindeutig!) | `rfp_tool` | `mein_projekt_db` |
| `REDIS_DB` | Redis DB-Index (0, 1, 2 …) | `0` | `1` |
| `APP_BASE_URL` | Öffentliche URL der App | `http://10.42.71.232:8513` | `http://10.42.71.232:8514` |

### Deploy-Konfiguration (.env.deploy.example)

Eine Vorlage für deploy-spezifische Variablen liegt unter `.env.deploy.example`:

- `SSH_KEY` – Pfad zum SSH-Key
- `SSH_HOST` – Server-Adresse (z.B. `root@10.42.71.232`)
- `REMOTE_DIR` – Zielverzeichnis auf dem Server
- `HOST_PORT` – Öffentlicher Port (8513, 8514, …)

Kopiere nach `.env.deploy` und passe an. `deploy.sh` und `recover.sh` lesen diese Datei derzeit nicht automatisch – die Werte müssen dort manuell gesetzt oder das Skript erweitert werden.

### In deploy.sh anpassen

```bash
SSH_KEY="BattleMindAI_Dev_57819.txt"      # Pfad zum SSH-Key
SSH_HOST="root@10.42.71.232"              # Server-Adresse
REMOTE_DIR="/opt/rfp-tool"                # Zielverzeichnis
```

### In recover.sh anpassen

```bash
SSH_KEY="BattleMindAI_Dev_57819.txt"
SSH_HOST="root@10.42.71.232"
REMOTE_DIR="/opt/rfp-tool"
```

### In docker-compose.yml (für Multi-Projekt)

- `ports: "${HOST_PORT:-8513}:8501"`
- `container_name: "${CONTAINER_PREFIX}rfp-tool-v3"` (analog für mariadb, redis, celery-worker)
- `REDIS_URL: redis://redis:6379/${REDIS_DB:-0}`
- `APP_BASE_URL` in der `.env` setzen

---

## 3. Docker-Build

### Aufbau des Dockerfiles

**Multi-Stage Build:**

1. **Stage 1 (frontend-build):** Node 20 Alpine
   - `npm ci` – Abhängigkeiten
   - `npm run build` – React-Build

2. **Stage 2:** Python 3.11 slim
   - `pip install -r requirements.txt`
   - Backend-Code kopieren
   - Statische Dateien aus Stage 1 nach `./static/`
   - `uvicorn api:app --host 0.0.0.0 --port 8501`

### Vollständiger Dockerfile

```dockerfile
# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python Backend + Static Files
FROM python:3.11-slim
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-build /app/frontend/dist ./static

EXPOSE 8501

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8501"]
```

### .dockerignore

```
node_modules
frontend/node_modules
frontend/dist
__pycache__
*.pyc
.env
.git
*.db
test_rfp.xlsx
documentation/
```

Wichtig: `.env` wird nicht ins Image kopiert – sie wird zur Laufzeit per `env_file` oder `environment` injiziert.

### Lokaler Test

```bash
docker compose build --no-cache
docker compose up -d
# App: http://localhost:8513
```

---

## 4. Deployment-Ablauf

### Ablauf von deploy.sh

1. **DB-Backup** (vor Deploy)
   - Bei bestehendem Deployment: `mariadb-dump` mit `--single-transaction`
   - Speicherort: `/opt/rfp-backups/rfp_tool_YYYYMMDD_HHMMSS.sql`
   - Bei Fehler: Deploy wird abgebrochen

2. **Docker-Check**
   - Falls Docker nicht installiert: automatische Installation (Ubuntu)

3. **Projekt packen**
   - Tarball ohne: `.git`, `node_modules`, `*.db`, `__pycache__`, `frontend/dist`, `BattleMindAI_Dev*`, `.env`
   - `tar -czf /tmp/rfp-tool-deploy.tar.gz -C .. .`

4. **Upload**
   - `scp` des Tarballs auf den Server
   - Altes Deployment nach `$REMOTE_DIR.old` verschieben
   - Tarball entpacken

5. **Daten wiederherstellen**
   - `data/` und `user_templates/` aus `.old` wiederherstellen

6. **.env kopieren**
   - Aus `backend/.env` oder `.env` (Projektroot)
   - `.env` wird **nicht** im Tarball mitgepackt – separat per `scp`

7. **Container starten**
   - `docker compose build --no-cache -q`
   - `docker compose up -d`

### Deployment ausführen

```bash
make deploy
# oder
./deploy.sh
```

### Variablen in deploy.sh

| Variable | Typ | Beschreibung |
|----------|-----|--------------|
| `SSH_KEY` | Pfad | SSH-Private-Key-Datei |
| `SSH_HOST` | Host | `user@host` (z.B. `root@10.42.71.232`) |
| `REMOTE_DIR` | Pfad | Zielverzeichnis auf dem Server |
| `REPO_URL` | URL | Optional, für Referenz |

---

## 5. Secrets & .env

### Vollständige .env.example (Pflicht + optional)

```bash
# === AWS Bedrock (Pflicht für AI) ===
BEDROCK_API_KEY=
BEDROCK_ENDPOINT=https://bedrock-runtime.us-west-2.amazonaws.com
BEDROCK_MODEL_ID=us.anthropic.claude-sonnet-4-6
BEDROCK_REGION=us-west-2
BEDROCK_MAX_CONCURRENT=2

# === App ===
JWT_SECRET=rfp-tool-secret-key-change-in-production
APP_ENV=production
APP_BASE_URL=http://10.42.71.232:8513

# === MariaDB (Docker Compose) ===
DB_USER=rfp_user
DB_PASSWORD=rfp_secret_change_me
DB_NAME=rfp_tool

# === Redis + Celery ===
REDIS_URL=redis://redis:6379/0

# === Optional: Experience League ===
# ENABLE_EXPERIENCE_LEAGUE_FETCH=true
# ENABLE_EXPERIENCE_LEAGUE_SEARCH_FALLBACK=true
# EXPERIENCE_LEAGUE_SEARCH_PRODUCT=Experience Platform

# === Optional: Okta SSO ===
# OKTA_DOMAIN=adobe.okta.com
# OKTA_CLIENT_ID=0oa23fsnk0dVLJG9Z0h8
# OKTA_CLIENT_SECRET=<von Okta Admin Console>
# OKTA_ISSUER=https://adobe.okta.com/oauth2

# === Optional: ElevenLabs TTS ===
# ELEVENLABS_API_KEY=
# ELEVENLABS_VOICE_ID=
```

### Variablen-Übersicht

| Variable | Typ | Pflicht | Beschreibung |
|----------|-----|---------|--------------|
| `BEDROCK_API_KEY` | Secret | Ja | AWS Bedrock API Key |
| `BEDROCK_ENDPOINT` | Config | Ja | Bedrock Endpoint URL |
| `BEDROCK_MODEL_ID` | Config | Ja | Modell-ID (z.B. `us.anthropic.claude-sonnet-4-6`) |
| `BEDROCK_REGION` | Config | Ja | AWS Region |
| `JWT_SECRET` | Secret | Ja | Starkes Passwort für JWT-Signing |
| `DB_USER` | Secret | Ja | MariaDB User |
| `DB_PASSWORD` | Secret | Ja | MariaDB Passwort |
| `DB_NAME` | Config | Ja | Datenbankname |
| `APP_BASE_URL` | Config | Ja | Öffentliche URL (z.B. `http://10.42.71.232:8513`) |
| `APP_ENV` | Config | Ja | `production` |
| `REDIS_URL` | Config | Ja | `redis://redis:6379/0` (Docker: `redis` = Service-Name) |
| `OKTA_CLIENT_SECRET` | Secret | Nein | Für Okta SSO |
| `ELEVENLABS_API_KEY` | Secret | Nein | Für TTS |
| `ELEVENLABS_VOICE_ID` | Config | Nein | Für TTS |

### Wichtig

- **`.env` nie ins Git committen.** `.gitignore` und `.dockerignore` sollten `.env` enthalten.
- `.env` wird separat per `scp` auf den Server kopiert (siehe `deploy.sh`).
- `backend/.env` oder `.env` im Projektroot – beide werden von `deploy.sh` unterstützt.

---

## 6. Multi-Projekt-Setup

Mehrere Projekte parallel auf demselben Server:

### Pro Projekt: eigene Konfiguration

| Projekt | REMOTE_DIR | HOST_PORT | DB_NAME | REDIS_DB |
|--------|------------|-----------|---------|----------|
| RFP Tool | `/opt/rfp-tool` | 8513 | `rfp_tool` | 0 |
| Projekt 2 | `/opt/projekt2` | 8514 | `projekt2_db` | 1 |
| Projekt 3 | `/opt/projekt3` | 8515 | `projekt3_db` | 2 |

### Option A: Vollständig isoliert

Jedes Projekt hat eigene Docker-Container (MariaDB, Redis, App, Celery):

- `deploy.sh` mit `REMOTE_DIR=/opt/projekt2`
- `docker-compose.yml` mit `ports: "8514:8501"`, `container_name: projekt2-...`
- Eigene MariaDB-Datenbank pro Projekt
- Eigene Redis-Instanz pro Projekt (oder gemeinsamer Redis mit DB-Index)

### Option B: Gemeinsamer Redis, unterschiedliche DBs

- Ein Redis-Prozess auf dem Server
- Pro Projekt: `REDIS_URL=redis://redis:6379/0`, `/1`, `/2` etc.
- **Hinweis:** Bei Option A (docker-compose pro Projekt) ist jeder Redis in seinem eigenen Docker-Netzwerk. Für gemeinsamen Redis müsste ein externer Redis laufen oder ein Projekt den Redis als "Host" bereitstellen.

### Option C: Gemeinsame MariaDB, unterschiedliche DB_NAME

- Eine MariaDB-Instanz
- Pro Projekt: `DB_NAME=projekt1_db`, `projekt2_db` etc.
- MariaDB erstellt die Datenbank automatisch bei erstem Start (via `MYSQL_DATABASE`)

### CORS-Anpassung

Bei neuer Domain/Port: `APP_BASE_URL` in `.env` setzen. Die CORS-Origins in `backend/api.py` sind derzeit hardcodiert. Für flexible Multi-Projekt-Nutzung: `CORS_ORIGINS` aus Umgebungsvariable lesen (z.B. `APP_BASE_URL` automatisch in `allow_origins` aufnehmen).

### Port-Matrix

| Port | Verwendung |
|------|------------|
| 8513 | RFP Tool (Standard) |
| 8514 | Projekt 2 |
| 8515 | Projekt 3 |
| … | … |

---

## 7. Recovery & Troubleshooting

### Alte Version wiederherstellen (recover.sh)

```bash
./recover.sh
```

Startet die Container aus `$REMOTE_DIR.old` (falls vorhanden). Nützlich, wenn ein Deploy fehlschlägt oder die neue Version Probleme macht.

### DB-Backup wiederherstellen

```bash
# Auf dem Server
docker exec -i rfp-mariadb mariadb -u root -p rfp_tool < /opt/rfp-backups/rfp_tool_YYYYMMDD_HHMMSS.sql
```

### Logs prüfen

```bash
# App
docker logs rfp-tool-v3 -f

# Celery Worker (AI-Background)
docker logs rfp-celery-worker -f

# MariaDB
docker logs rfp-mariadb -f

# Redis
docker logs rfp-redis -f
```

### Celery Worker läuft nicht (0/0 bei Fortschritt)

- `docker ps | grep celery` – Worker prüfen
- `docker logs rfp-celery-worker --tail 50` – Fehler prüfen
- `REDIS_URL` muss identisch sein (rfp-tool und celery-worker)
- `./data` muss als Volume gemountet sein (Uploads für Worker)

### Container-Namen bei Multi-Projekt

Bei angepasstem `CONTAINER_PREFIX` die Namen entsprechend ersetzen (z.B. `projekt2-tool-v3`, `projekt2-celery-worker`).

---

## 8. Firewall / Security

### Port freigeben

- **Firewall:** Port 8513 (bzw. Projekt-Port) in der VM-Konsole freigeben (TCP)
- **Security Group:** Bei AWS/Azure/GCP: Inbound-Regel für den Port hinzufügen

### SSH-Key

- SSH-Key sicher aufbewahren (nicht ins Git)
- `deploy.sh` schließt `BattleMindAI_Dev*` vom Tarball aus
- Key-Berechtigungen: `chmod 600 BattleMindAI_Dev_57819.txt`

### .env

- Nicht im Repository
- Nicht im Docker-Image
- Nur per `scp` auf den Server kopieren

---

## 9. Schnellreferenz

| Aktion | Befehl |
|--------|--------|
| Deploy | `make deploy` oder `./deploy.sh` |
| Recovery | `./recover.sh` |
| Lokal bauen | `make build` oder `docker compose build --no-cache` |
| Lokal starten | `docker compose up -d` |
| Logs | `docker logs rfp-tool-v3 -f` |
| DB-Backup wiederherstellen | `docker exec -i rfp-mariadb mariadb -u root -p rfp_tool < backup.sql` |

### Nach dem Deploy

- App: `http://10.42.71.232:8513` (oder konfigurierte URL)
- Admin anlegen: `docker exec rfp-tool-v3 python3 -c "from database import create_user, update_user_verification; from auth import hash_data; create_user('admin@example.com', hash_data('passwort'), None); update_user_verification('admin@example.com', True)"`
