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
	HOST_PORT=$${HOST_PORT:-8516}; \
	if [ -z "$$SSH_HOST" ] || [ -z "$$REMOTE_DIR" ]; then \
		echo "Fehler: SSH_HOST und REMOTE_DIR müssen gesetzt sein."; \
		echo "  Erstelle .env.deploy (siehe .env.deploy.example)"; \
		echo "  Oder: make deploy SSH_HOST=user@server REMOTE_DIR=/opt/techstack HOST_PORT=8516"; \
		exit 1; \
	fi; \
	echo ">>> TechStackCrawler Deploy (Port $$HOST_PORT, REMOTE_DIR=$$REMOTE_DIR)"; \
	echo ">>> DB-Backup auf Server (vor Deploy)..."; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$SSH_KEY") "$$SSH_HOST" "mkdir -p /opt/techstack-backups && (cd $$REMOTE_DIR 2>/dev/null && set -a && [ -f .env ] && . .env; set +a; CONTAINER=\$${CONTAINER_PREFIX:-techstack-}mariadb; docker ps --format '{{.Names}}' | grep -q \"^\$$CONTAINER\$$\" && docker exec \$$CONTAINER mariadb-dump -u root -p\"\$${DB_ROOT_PASSWORD:-techstack_root}\" --single-transaction techstack_crawler > /opt/techstack-backups/techstack_\$$(date +%Y%m%d_%H%M%S).sql && echo 'Backup OK' || echo 'Backup übersprungen (kein laufender Container)')"; \
	echo ">>> Baue Docker-Image lokal..."; \
	cd $(PROJECT_DIR) && HOST_PORT=$$HOST_PORT CONTAINER_PREFIX=$${CONTAINER_PREFIX:-techstack-} docker compose build; \
	echo ">>> Erstelle Deploy-Archiv..."; \
	cd $(PROJECT_DIR) && tar --exclude=node_modules --exclude=client/dist --exclude=server/dist -czf ../.deploy.tar.gz .; \
	echo ">>> Kopiere auf Server..."; \
	scp $$([ -n "$$SSH_KEY" ] && echo "-i $$SSH_KEY") ../.deploy.tar.gz "$$SSH_HOST:/tmp/"; \
	rm -f ../.deploy.tar.gz; \
	echo ">>> Starte auf Server..."; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$SSH_KEY") "$$SSH_HOST" "mkdir -p $$REMOTE_DIR && cd $$REMOTE_DIR && tar -xzf /tmp/.deploy.tar.gz && HOST_PORT=$$HOST_PORT CONTAINER_PREFIX=$${CONTAINER_PREFIX:-techstack-} docker compose down 2>/dev/null; HOST_PORT=$$HOST_PORT CONTAINER_PREFIX=$${CONTAINER_PREFIX:-techstack-} docker compose up -d --build && rm /tmp/.deploy.tar.gz"; \
	echo ">>> Deploy abgeschlossen. App: http://$${SSH_HOST#*@}:$$HOST_PORT"
