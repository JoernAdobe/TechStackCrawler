# TechStackCrawler - Makefile
# Verwendung: make start | stop | deploy | ...

PROJECT_DIR := project
.PHONY: start stop deploy install build dev-start dev-stop docker-up docker-down docker-build

# Standard-Ziel
.DEFAULT_GOAL := help

help:
	@echo "TechStackCrawler - Verfügbare Befehle:"
	@echo ""
	@echo "  make install     - Abhängigkeiten installieren"
	@echo "  make start       - Dev-Server starten (Client + Server)"
	@echo "  make stop        - Dev-Server stoppen"
	@echo "  make build      - Projekt bauen (Client + Server)"
	@echo "  make docker-up   - Mit Docker starten"
	@echo "  make docker-down - Docker-Container stoppen"
	@echo "  make deploy     - Auf Server deployen (Docker)"
	@echo ""

# Abhängigkeiten installieren
install:
	cd $(PROJECT_DIR) && npm install

# Dev-Server starten (Client auf 5173, Server auf 3001)
start: dev-start

dev-start:
	@echo "Starte TechStack Analyzer..."
	cd $(PROJECT_DIR) && npm run dev

# Dev-Server stoppen (beendet Prozesse auf Port 5173 und 3001)
stop: dev-stop

dev-stop:
	@echo "Stoppe TechStack Analyzer..."
	@-lsof -ti:5173 | xargs kill -9 2>/dev/null || true
	@-lsof -ti:3001 | xargs kill -9 2>/dev/null || true
	@echo "Gestoppt."

# Projekt bauen
build:
	cd $(PROJECT_DIR) && npm run build

# Docker: Container starten
docker-up:
	cd $(PROJECT_DIR) && docker compose up -d --build

# Docker: Container stoppen
docker-down:
	cd $(PROJECT_DIR) && docker compose down

# Docker: Nur bauen
docker-build:
	cd $(PROJECT_DIR) && docker compose build

# Deploy: Auf Remote-Server deployen
# Erfordert: .env.deploy mit SSH_HOST, REMOTE_DIR (optional: SSH_KEY)
# Oder: make deploy SSH_HOST=user@server REMOTE_DIR=/opt/techstack
deploy:
	@[ -f .env.deploy ] && . .env.deploy 2>/dev/null; \
	GIT_COMMIT=$$(git rev-parse --short HEAD 2>/dev/null || echo "unknown"); \
	ROOT_DIR=$$(pwd); \
	HOST_PORT=$${HOST_PORT:-8516}; \
	if [ -z "$$SSH_HOST" ] || [ -z "$$REMOTE_DIR" ]; then \
		echo "Fehler: SSH_HOST und REMOTE_DIR müssen gesetzt sein."; \
		echo "  Erstelle .env.deploy (siehe .env.deploy.example)"; \
		echo "  Oder: make deploy SSH_HOST=user@server REMOTE_DIR=/opt/techstack HOST_PORT=8516"; \
		exit 1; \
	fi; \
	echo ">>> TechStackCrawler Deploy (Port $$HOST_PORT, REMOTE_DIR=$$REMOTE_DIR)"; \
	echo ">>> DB-Backup auf Server (vor Deploy)..."; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY" || true) $$([ -n "$$SSH_KEY" ] && echo "-o IdentitiesOnly=yes" || true) "$$SSH_HOST" "mkdir -p /opt/techstack-backups && (cd $$REMOTE_DIR 2>/dev/null && set -a && [ -f .env ] && . .env; set +a; CONTAINER=\$${CONTAINER_PREFIX:-techstack-}mariadb; docker ps --format '{{.Names}}' | grep -q \"^\$$CONTAINER\$$\" && docker exec \$$CONTAINER mariadb-dump -u root -p\"\$${DB_ROOT_PASSWORD:-techstack_root}\" --single-transaction techstack_crawler > /opt/techstack-backups/techstack_\$$(date +%Y%m%d_%H%M%S).sql && echo 'Backup OK' || echo 'Backup übersprungen (kein laufender Container)')"; \
	echo ">>> Exportiere lokale Analysen für Migration..."; \
	(cd $$ROOT_DIR/$(PROJECT_DIR) && npm run export-for-deploy 2>/dev/null) || true; \
	echo ">>> Baue Docker-Image lokal (Server braucht keinen Docker-Hub-Zugriff)..."; \
	echo ">>> Plattform: linux/amd64 (für x86-Server, auch beim Bau auf Apple Silicon)"; \
	(cd $$ROOT_DIR/$(PROJECT_DIR) && DOCKER_DEFAULT_PLATFORM=linux/amd64 GIT_COMMIT=$$GIT_COMMIT HOST_PORT=$$HOST_PORT CONTAINER_PREFIX=$${CONTAINER_PREFIX:-techstack-} docker compose build) || { \
	  echo ""; \
	  echo ">>> Docker-Build fehlgeschlagen. Ist Docker Desktop gestartet?"; \
	  echo ">>> Ohne laufenden Docker kann das Image nicht lokal gebaut werden."; \
	  echo ">>> Alternative: DEPLOY_SKIP_LOCAL_BUILD=1 make deploy (baut auf dem Server – braucht dort Docker-Hub-Zugriff)."; \
	  exit 1; \
	}; \
	echo ">>> Exportiere TechStack-Image als Tar..."; \
	(cd $$ROOT_DIR/$(PROJECT_DIR) && docker save techstack-app -o $$ROOT_DIR/.deploy-techstack.tar) || { echo "Fehler: Image-Export fehlgeschlagen"; exit 1; }; \
	echo ">>> Erstelle Deploy-Archiv..."; \
	(cd $$ROOT_DIR/$(PROJECT_DIR) && COPYFILE_DISABLE=1 tar --exclude=node_modules --exclude=client/dist --exclude=server/dist --exclude=.env -czf $$ROOT_DIR/.deploy.tar.gz .) || { echo "Fehler: Archiv konnte nicht erstellt werden"; exit 1; }; \
	echo ">>> Kopiere auf Server..."; \
	scp $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY" || true) $$([ -n "$$SSH_KEY" ] && echo "-o IdentitiesOnly=yes" || true) $$ROOT_DIR/.deploy.tar.gz $$ROOT_DIR/.deploy-techstack.tar "$$SSH_HOST:/tmp/" || { echo "Fehler: SCP fehlgeschlagen"; exit 1; }; \
	rm -f $$ROOT_DIR/.deploy.tar.gz $$ROOT_DIR/.deploy-techstack.tar; \
	echo ">>> Starte auf Server..."; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY" || true) $$([ -n "$$SSH_KEY" ] && echo "-o IdentitiesOnly=yes" || true) "$$SSH_HOST" "mkdir -p $$REMOTE_DIR"; \
	if [ -f "$$ROOT_DIR/$(PROJECT_DIR)/.env" ]; then \
	  echo ">>> Kopiere .env auf Server ($$REMOTE_DIR/.env)..."; \
	  scp $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY" || true) $$([ -n "$$SSH_KEY" ] && echo "-o IdentitiesOnly=yes" || true) "$$ROOT_DIR/$(PROJECT_DIR)/.env" "$$SSH_HOST:$$REMOTE_DIR/.env" || true; \
	else \
	  echo ">>> Hinweis: Keine project/.env – Server nutzt bestehende $$REMOTE_DIR/.env (oder erstelle sie manuell)."; \
	fi; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY" || true) $$([ -n "$$SSH_KEY" ] && echo "-o IdentitiesOnly=yes" || true) "$$SSH_HOST" "cd $$REMOTE_DIR && tar -xzf /tmp/.deploy.tar.gz && rm -f docker-compose.override.yml && docker load -i /tmp/.deploy-techstack.tar && rm -f /tmp/.deploy-techstack.tar && GIT_COMMIT=$$GIT_COMMIT HOST_PORT=$$HOST_PORT CONTAINER_PREFIX=$${CONTAINER_PREFIX:-techstack-} docker compose down 2>/dev/null; GIT_COMMIT=$$GIT_COMMIT HOST_PORT=$$HOST_PORT CONTAINER_PREFIX=$${CONTAINER_PREFIX:-techstack-} docker compose up -d && sleep 5 && (sh scripts/deploy-restore-if-empty.sh 2>/dev/null || true) && rm -f /tmp/.deploy.tar.gz"; \
	DEPLOY_HOST=$${SSH_HOST#*@}; \
	DEPLOY_URL="http://$$DEPLOY_HOST:$$HOST_PORT"; \
	echo ""; \
	echo ">>> Deploy abgeschlossen."; \
	echo ">>> App-URL: $$DEPLOY_URL"; \
	echo ""; \
	echo ">>> Teste Frontend-Erreichbarkeit..."; \
	sleep 5; \
	if curl -sf -o /dev/null -w "   HTTP %{http_code} – erreichbar\n" "$$DEPLOY_URL/api/health" 2>/dev/null; then \
		echo ">>> Frontend: $$DEPLOY_URL"; \
		echo ">>> Health-Check: OK"; \
	else \
		echo ">>> Frontend: $$DEPLOY_URL"; \
		echo ">>> Health-Check: noch nicht bereit (Container startet evtl. noch)"; \
	fi
