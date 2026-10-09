# TechStackCrawler - Makefile
# Verwendung: make start | stop | deploy | ...

PROJECT_DIR := project
.PHONY: start stop deploy deploy-hub install build dev-start dev-stop docker-up docker-down docker-build logs status tmp-inspect tmp-clean restart server-mem tmp-resize

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
	@echo "  make deploy-hub - Hub-Seite deployen (Adobe AI Tools)"
	@echo "  make ethos-image | ethos-secrets | ethos-deploy | ethos-status - Ethos (Coworker-Gateway), siehe docs/ethos-deployment.md"
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
	@echo ">>> Build: $$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"; \
	cd $(PROJECT_DIR) && npm run build

# Docker: Container starten
docker-up:
	cd $(PROJECT_DIR) && docker compose up -d --build

# Docker: Container stoppen
docker-down:
	cd $(PROJECT_DIR) && docker compose down

# Docker: Nur bauen
docker-build:
	@echo ">>> Build: $$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"; \
	cd $(PROJECT_DIR) && docker compose build

# Deploy: Auf Remote-Server deployen
# Erfordert: .env.deploy mit SSH_HOST, REMOTE_DIR (optional: SSH_KEY)
# Oder: make deploy SSH_HOST=user@server REMOTE_DIR=/opt/techstack
deploy:
	@[ -f .env.deploy ] && . .env.deploy 2>/dev/null; \
	GIT_COMMIT=$$(git rev-parse --short HEAD 2>/dev/null || echo "unknown"); \
	ROOT_DIR=$$(pwd); \
	HOST_PORT=$${HOST_PORT:-8516}; \
	HOST_PORT_HTTP=$${HOST_PORT_HTTP:-$$((HOST_PORT + 1))}; \
	if [ -z "$$SSH_HOST" ] || [ -z "$$REMOTE_DIR" ]; then \
		echo "Fehler: SSH_HOST und REMOTE_DIR müssen gesetzt sein."; \
		echo "  Erstelle .env.deploy (siehe .env.deploy.example)"; \
		echo "  Oder: make deploy SSH_HOST=user@server REMOTE_DIR=/opt/techstack HOST_PORT=8516"; \
		exit 1; \
	fi; \
	echo ">>> TechStackCrawler Deploy (Port $$HOST_PORT, REMOTE_DIR=$$REMOTE_DIR)"; \
	echo ">>> Build/Version: $$GIT_COMMIT"; \
	echo ">>> DB-Backup auf Server (vor Deploy)..."; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY" || true) $$([ -n "$$SSH_KEY" ] && echo "-o IdentitiesOnly=yes" || true) "$$SSH_HOST" "mkdir -p /opt/techstack-backups && (cd $$REMOTE_DIR 2>/dev/null && set -a && [ -f .env ] && . .env; set +a; CONTAINER=\$${CONTAINER_PREFIX:-techstack-}mariadb; if docker ps --format '{{.Names}}' | grep -q \"^\$$CONTAINER\$$\"; then [ -n \"\$$DB_ROOT_PASSWORD\" ] || { echo 'Backup FEHLER: DB_ROOT_PASSWORD fehlt in der Server-.env'; exit 1; }; docker exec \$$CONTAINER mariadb-dump -u root -p\"\$$DB_ROOT_PASSWORD\" --single-transaction techstack_crawler > /opt/techstack-backups/techstack_\$$(date +%Y%m%d_%H%M%S).sql && echo 'Backup OK' || { echo 'Backup FEHLER: mariadb-dump fehlgeschlagen'; exit 1; }; else echo 'Backup übersprungen (kein laufender Container)'; fi)" || { echo ">>> Abbruch: DB-Backup fehlgeschlagen."; exit 1; }; \
	echo ">>> Exportiere lokale Analysen für Migration..."; \
	(cd $$ROOT_DIR/$(PROJECT_DIR) && npm run export-for-deploy 2>/dev/null) || true; \
	echo ">>> Baue Docker-Image lokal (Server braucht keinen Docker-Hub-Zugriff)..."; \
	echo ">>> Plattform: linux/amd64 (für x86-Server, auch beim Bau auf Apple Silicon)"; \
	(cd $$ROOT_DIR/$(PROJECT_DIR) && DOCKER_DEFAULT_PLATFORM=linux/amd64 GIT_COMMIT=$$GIT_COMMIT HOST_PORT=$$HOST_PORT HOST_PORT_HTTP=$$HOST_PORT_HTTP CONTAINER_PREFIX=$${CONTAINER_PREFIX:-techstack-} docker compose build) || { \
	  echo ""; \
	  echo ">>> Docker-Build fehlgeschlagen. Ist Docker Desktop gestartet?"; \
	  echo ">>> Ohne laufenden Docker kann das Image nicht lokal gebaut werden."; \
	  echo ">>> Alternative: DEPLOY_SKIP_LOCAL_BUILD=1 make deploy (baut auf dem Server – braucht dort Docker-Hub-Zugriff)."; \
	  exit 1; \
	}; \
	echo ">>> Erstelle Deploy-Archiv..."; \
	(cd $$ROOT_DIR/$(PROJECT_DIR) && COPYFILE_DISABLE=1 tar --exclude=node_modules --exclude=client/dist --exclude=server/dist --exclude=.env -czf $$ROOT_DIR/.deploy.tar.gz .) || { echo "Fehler: Archiv konnte nicht erstellt werden"; exit 1; }; \
	echo ">>> Kopiere Code-Archiv auf Server..."; \
	scp $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY" || true) $$([ -n "$$SSH_KEY" ] && echo "-o IdentitiesOnly=yes" || true) $$ROOT_DIR/.deploy.tar.gz "$$SSH_HOST:/tmp/" || { echo "Fehler: SCP fehlgeschlagen"; exit 1; }; \
	rm -f $$ROOT_DIR/.deploy.tar.gz; \
	echo ">>> Streame Docker-Image auf Server (umgeht /tmp-Limit)..."; \
	docker save techstack-app | ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) "$$SSH_HOST" "docker load" || { echo "Fehler: Image-Stream fehlgeschlagen"; exit 1; }; \
	echo ">>> Starte auf Server..."; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY" || true) $$([ -n "$$SSH_KEY" ] && echo "-o IdentitiesOnly=yes" || true) "$$SSH_HOST" "mkdir -p $$REMOTE_DIR"; \
	if [ -f "$$ROOT_DIR/$(PROJECT_DIR)/.env" ]; then \
	  echo ">>> Kopiere .env auf Server ($$REMOTE_DIR/.env)..."; \
	  scp $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY" || true) $$([ -n "$$SSH_KEY" ] && echo "-o IdentitiesOnly=yes" || true) "$$ROOT_DIR/$(PROJECT_DIR)/.env" "$$SSH_HOST:$$REMOTE_DIR/.env" || true; \
	else \
	  echo ">>> Hinweis: Keine project/.env – Server nutzt bestehende $$REMOTE_DIR/.env (oder erstelle sie manuell)."; \
	fi; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY" || true) $$([ -n "$$SSH_KEY" ] && echo "-o IdentitiesOnly=yes" || true) "$$SSH_HOST" "cd $$REMOTE_DIR && tar -xzf /tmp/.deploy.tar.gz && rm -f docker-compose.override.yml && GIT_COMMIT=$$GIT_COMMIT HOST_PORT=$$HOST_PORT HOST_PORT_HTTP=$$HOST_PORT_HTTP CONTAINER_PREFIX=$${CONTAINER_PREFIX:-techstack-} docker compose down 2>/dev/null; GIT_COMMIT=$$GIT_COMMIT HOST_PORT=$$HOST_PORT HOST_PORT_HTTP=$$HOST_PORT_HTTP CONTAINER_PREFIX=$${CONTAINER_PREFIX:-techstack-} docker compose up -d && sleep 5 && (sh scripts/deploy-restore-if-empty.sh 2>/dev/null || true) && rm -f /tmp/.deploy.tar.gz"; \
	DEPLOY_HOST=$${SSH_HOST#*@}; \
	DEPLOY_URL="http://$$DEPLOY_HOST:$$HOST_PORT"; \
	echo ""; \
	echo ">>> Deploy abgeschlossen."; \
	echo ">>> App-URL: $$DEPLOY_URL"; \
	echo ">>> Lokaler Commit: $$GIT_COMMIT"; \
	echo ""; \
	echo ">>> Teste Frontend-Erreichbarkeit..."; \
	sleep 5; \
	HEALTH=$$(curl -ksf "$$DEPLOY_URL/api/health" 2>/dev/null); \
	if [ -n "$$HEALTH" ]; then \
		REMOTE_COMMIT=$$(echo "$$HEALTH" | grep -o '"commit":"[^"]*"' | cut -d'"' -f4); \
		echo ">>> Frontend: $$DEPLOY_URL"; \
		echo ">>> Health-Check: OK"; \
		echo ">>> Server-Commit: $$REMOTE_COMMIT"; \
		if [ "$$GIT_COMMIT" = "$$REMOTE_COMMIT" ]; then \
			echo ">>> Commit-Check: OK (lokal = server)"; \
		else \
			echo ">>> Commit-Check: MISMATCH (lokal=$$GIT_COMMIT, server=$$REMOTE_COMMIT)"; \
		fi; \
	else \
		echo ">>> Frontend: $$DEPLOY_URL"; \
		echo ">>> Health-Check: noch nicht bereit (Container startet evtl. noch)"; \
	fi

# Server-Diagnose: Container-Status + Logs holen
status:
	@[ -f .env.deploy ] && . .env.deploy 2>/dev/null; \
	ROOT_DIR=$$(pwd); \
	if [ -z "$$SSH_HOST" ]; then echo "Fehler: SSH_HOST fehlt"; exit 1; fi; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) "$$SSH_HOST" "docker ps -a --filter name=techstack --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'; echo; echo '=== /opt/techstack-crawler/.env ==='; ls -la /opt/techstack-crawler/.env 2>&1; echo; echo '=== mariadb volume ==='; docker volume ls | grep -E 'techstack|VOLUME'"

logs:
	@[ -f .env.deploy ] && . .env.deploy 2>/dev/null; \
	ROOT_DIR=$$(pwd); \
	SERVICE=$${SERVICE:-mariadb}; \
	LINES=$${LINES:-80}; \
	if [ -z "$$SSH_HOST" ]; then echo "Fehler: SSH_HOST fehlt"; exit 1; fi; \
	echo ">>> Logs: techstack-$$SERVICE (letzte $$LINES Zeilen)"; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) "$$SSH_HOST" "docker logs --tail $$LINES techstack-$$SERVICE 2>&1"

# /tmp-Inspektion (Server /tmp ist 512 MB tmpfs, hubblestack belegt ~201 MB davon — nicht löschen!)
tmp-inspect:
	@[ -f .env.deploy ] && . .env.deploy 2>/dev/null; \
	ROOT_DIR=$$(pwd); \
	if [ -z "$$SSH_HOST" ]; then echo "Fehler: SSH_HOST fehlt"; exit 1; fi; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) "$$SSH_HOST" "df -h /tmp; echo; echo '=== /tmp Inhalt (inkl. hidden) ==='; ls -lah /tmp/ | head -40; echo; echo '=== /tmp gesamt (inkl. hidden) ==='; du -sh /tmp/.[!.]* /tmp/* 2>/dev/null | sort -h | tail -25; echo; echo '=== runc/docker leftovers ==='; ls /tmp/runc-* /tmp/docker-* 2>/dev/null | wc -l"

# RAM- und Mount-Status auf Server
server-mem:
	@[ -f .env.deploy ] && . .env.deploy 2>/dev/null; \
	ROOT_DIR=$$(pwd); \
	if [ -z "$$SSH_HOST" ]; then echo "Fehler: SSH_HOST fehlt"; exit 1; fi; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) "$$SSH_HOST" "echo '=== free -h ==='; free -h; echo; echo '=== df -h /tmp ==='; df -h /tmp; echo; echo '=== /etc/fstab tmpfs entries ==='; grep -nE '^[^#].*tmpfs' /etc/fstab || echo '(kein tmpfs in fstab, /tmp wird wahrscheinlich systemd-managed via /usr/lib/systemd/system/tmp.mount)'; echo; echo '=== systemd tmp.mount ==='; systemctl cat tmp.mount 2>/dev/null | grep -E 'Options|What|Where' || echo '(no systemd tmp.mount)'"

# /tmp Größe auf SIZE erhöhen (default 2G), persistent via /etc/fstab
# Benutzung: make tmp-resize SIZE=2G
# Behält bestehende Mount-Flags (nodev, nosuid, noexec) — ändert NUR die size=.
tmp-resize:
	@[ -f .env.deploy ] && . .env.deploy 2>/dev/null; \
	ROOT_DIR=$$(pwd); \
	SIZE=$${SIZE:-2G}; \
	if [ -z "$$SSH_HOST" ]; then echo "Fehler: SSH_HOST fehlt"; exit 1; fi; \
	echo ">>> Erhöhe /tmp auf $$SIZE (persistent + live remount, behält noexec/nosuid/nodev)..."; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) "$$SSH_HOST" "set -e; echo '--- Pre-Status ---'; df -h /tmp; echo; echo '--- fstab vorher ---'; grep -nE '^[^#].*\s/tmp\s' /etc/fstab; echo; echo '--- fstab Backup ---'; cp -v /etc/fstab /etc/fstab.bak.\$$(date +%Y%m%d_%H%M%S); echo; echo '--- fstab in-place Update (size=*m|g → size=$$SIZE) ---'; sed -i -E '/^tmpfs[[:space:]]+\/tmp[[:space:]]+tmpfs/ s/size=[0-9]+[KkMmGg]?/size=$$SIZE/' /etc/fstab; grep -nE '^[^#].*\s/tmp\s' /etc/fstab; echo; echo '--- systemd daemon-reload (fstab-generator) ---'; systemctl daemon-reload; echo; echo '--- Live remount ---'; mount -o remount,size=$$SIZE /tmp; echo; echo '--- Post-Status ---'; df -h /tmp; mount | grep /tmp"
restart:
	@[ -f .env.deploy ] && . .env.deploy 2>/dev/null; \
	ROOT_DIR=$$(pwd); \
	REMOTE_DIR=$${REMOTE_DIR:-/opt/techstack-crawler}; \
	HOST_PORT=$${HOST_PORT:-8516}; \
	HOST_PORT_HTTP=$${HOST_PORT_HTTP:-$$((HOST_PORT + 1))}; \
	GIT_COMMIT=$$(git rev-parse --short HEAD 2>/dev/null || echo "unknown"); \
	if [ -z "$$SSH_HOST" ]; then echo "Fehler: SSH_HOST fehlt"; exit 1; fi; \
	echo ">>> Restart Container auf Server..."; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) "$$SSH_HOST" "cd $$REMOTE_DIR && GIT_COMMIT=$$GIT_COMMIT HOST_PORT=$$HOST_PORT HOST_PORT_HTTP=$$HOST_PORT_HTTP CONTAINER_PREFIX=$${CONTAINER_PREFIX:-techstack-} docker compose down; GIT_COMMIT=$$GIT_COMMIT HOST_PORT=$$HOST_PORT HOST_PORT_HTTP=$$HOST_PORT_HTTP CONTAINER_PREFIX=$${CONTAINER_PREFIX:-techstack-} docker compose up -d"; \
	echo ">>> Warte 15s auf Healthchecks..."; \
	sleep 15; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) "$$SSH_HOST" "docker ps --filter name=techstack --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"

# Sicheres /tmp Aufräumen: nur Deploy-Artefakte und runc-leftovers, NICHT hubblestack
tmp-clean:
	@[ -f .env.deploy ] && . .env.deploy 2>/dev/null; \
	ROOT_DIR=$$(pwd); \
	if [ -z "$$SSH_HOST" ]; then echo "Fehler: SSH_HOST fehlt"; exit 1; fi; \
	echo ">>> Räume nur Deploy-Artefakte aus /tmp auf (hubblestack bleibt unangetastet)..."; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) "$$SSH_HOST" "df -h /tmp | tail -1; rm -fv /tmp/.deploy.tar.gz /tmp/.deploy-techstack.tar /tmp/.deploy*.tar* 2>/dev/null; rm -fv /tmp/runc-process* 2>/dev/null; df -h /tmp | tail -1"

# Deploy Hub Page (Adobe AI Tools landing page)
HUB_DIR := hub
HUB_REMOTE_DIR := /opt/adobe-tools-hub
HUB_PORT := 8510

deploy-hub:
	@[ -f .env.deploy ] && . .env.deploy 2>/dev/null; \
	ROOT_DIR=$$(pwd); \
	if [ -z "$$SSH_HOST" ]; then \
		echo "Fehler: SSH_HOST muss gesetzt sein (in .env.deploy oder als Argument)"; \
		exit 1; \
	fi; \
	echo ">>> Adobe AI Tools Hub Deploy (Port $(HUB_PORT))"; \
	echo ">>> Kopiere Hub-Dateien auf Server..."; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) "$$SSH_HOST" "mkdir -p $(HUB_REMOTE_DIR)"; \
	scp $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) \
		$$ROOT_DIR/$(HUB_DIR)/index.html \
		$$ROOT_DIR/$(HUB_DIR)/Caddyfile \
		$$ROOT_DIR/$(HUB_DIR)/docker-compose.yml \
		$$ROOT_DIR/$(HUB_DIR)/adobe-hero.png \
		$$ROOT_DIR/$(HUB_DIR)/banner-inject.js \
		$$ROOT_DIR/$(HUB_DIR)/banner.html \
		"$$SSH_HOST:$(HUB_REMOTE_DIR)/"; \
	echo ">>> Starte Container auf Server..."; \
	ssh $$([ -n "$$SSH_KEY" ] && echo "-i $$ROOT_DIR/$$SSH_KEY -o IdentitiesOnly=yes" || true) "$$SSH_HOST" \
		"cd $(HUB_REMOTE_DIR) && HOST_PORT=$(HUB_PORT) docker compose pull && HOST_PORT=$(HUB_PORT) docker compose up -d"; \
	DEPLOY_HOST=$${SSH_HOST#*@}; \
	DEPLOY_URL="http://$$DEPLOY_HOST:$(HUB_PORT)"; \
	echo ""; \
	echo ">>> Deploy abgeschlossen."; \
	echo ">>> Hub-URL: $$DEPLOY_URL"; \
	sleep 3; \
	if curl -ksf -o /dev/null -w "   HTTP %{http_code}\n" "$$DEPLOY_URL" 2>/dev/null; then \
		echo ">>> Status: OK"; \
	else \
		echo ">>> Status: noch nicht bereit"; \
	fi

# ---------------------------------------------------------------------------
# Ethos (Nicht-Corp-Cluster, erreichbar vom CX Coworker Gateway)
# Konfig: .env.ethos (siehe .env.ethos.example), Runbook: docs/ethos-deployment.md
# ---------------------------------------------------------------------------
.PHONY: ethos-image ethos-secrets ethos-deploy ethos-migrate-db ethos-status ethos-logs

ETHOS_LOAD = [ -f .env.deploy ] && . ./.env.deploy; [ -f .env.ethos ] && . ./.env.ethos; \
	: "$${ETHOS_CONTEXT:?fehlt in .env.ethos}" "$${ETHOS_NAMESPACE:?fehlt in .env.ethos}" "$${ETHOS_HOST:?fehlt in .env.ethos}" "$${GHCR_IMAGE:?fehlt in .env.ethos}"; \
	KC="kubectl --context $$ETHOS_CONTEXT -n $$ETHOS_NAMESPACE"; \
	ETHOS_CORP_HOST=$${ETHOS_CORP_HOST:-$$(echo "$$ETHOS_HOST" | sed 's/\.int\./.corp./')}; \
	[ -n "$$GHCR_TOKEN" ] || GHCR_TOKEN=$$(security find-generic-password -s ghcr-techstack -w 2>/dev/null || true); \
	SSH_OPTS=$$([ -n "$$SSH_KEY" ] && echo "-i $$(pwd)/$$SSH_KEY -o IdentitiesOnly=yes" || true)

# kubelogin ≥ 0.2 speichert den Device-Code-Login mit --legacy nicht, sonst fragt jeder kubectl-Aufruf neu.
# Daher wird das Token EINMAL pro make-Aufruf geholt und per --token an alle kubectl-Aufrufe übergeben.
ETHOS_KUBELOGIN_ARGS ?= --server-id 41abc0c6-712d-4619-9b79-b96da7ffa825 --client-id 752c7d7f-e651-4ac3-939b-a049f390e19a --tenant-id fa7b1b5a-7b34-4387-94ae-d2c178decee1 --legacy
ETHOS_AUTH = if [ -z "$$ETHOS_TOKEN" ]; then \
		command -v kubelogin >/dev/null || { echo ">>> kubelogin fehlt: brew install Azure/kubelogin/kubelogin"; exit 1; }; \
		echo ">>> Ethos-Login: Code unten innerhalb von ~1 Minute auf https://login.microsoft.com/device eingeben"; \
		ETHOS_RAW=$$(kubelogin get-token --login devicecode $(ETHOS_KUBELOGIN_ARGS)) || { echo ">>> Ethos-Login fehlgeschlagen/abgelaufen – Befehl einfach neu starten"; exit 1; }; \
		ETHOS_TOKEN=$$(printf '%s' "$$ETHOS_RAW" | tr -d ' \n' | sed -E 's/.*"token":"([^"]+)".*/\1/'); \
		case "$$ETHOS_TOKEN" in ""|*'{'*) echo ">>> Ethos-Login lieferte kein Token – Befehl neu starten"; exit 1;; esac; \
	fi; \
	KC="$$KC --user ethos-token --token $$ETHOS_TOKEN"

# Image für linux/amd64 bauen und nach ghcr pushen (Tag = Git-Commit + latest)
ethos-image:
	@$(ETHOS_LOAD); \
	GIT_COMMIT=$$(git rev-parse --short HEAD); \
	[ -z "$$(git status --porcelain -- $(PROJECT_DIR))" ] || echo ">>> Warnung: uncommittete Änderungen in $(PROJECT_DIR) landen im Image $$GIT_COMMIT"; \
	if [ -n "$$GHCR_TOKEN" ]; then echo "$$GHCR_TOKEN" | docker login ghcr.io -u "$$GHCR_USER" --password-stdin >/dev/null || exit 1; fi; \
	echo ">>> Baue $$GHCR_IMAGE:$$GIT_COMMIT (linux/amd64)"; \
	cd $(PROJECT_DIR) && docker buildx build --platform linux/amd64 --build-arg GIT_COMMIT=$$GIT_COMMIT \
		-t $$GHCR_IMAGE:$$GIT_COMMIT -t $$GHCR_IMAGE:latest --push .

# k8s-Secrets anlegen/aktualisieren: ghcr-Pull-Secret + App-Env (Quelle: .env der Corp-VM oder ETHOS_ENV_FILE)
# Aufruf: make ethos-secrets (GHCR_TOKEN aus dem Schlüsselbund, Eintrag ghcr-techstack)
ethos-secrets:
	@$(ETHOS_LOAD); $(ETHOS_AUTH); \
	: "$${GHCR_TOKEN:?GHCR_TOKEN fehlt – im Schlüsselbund ablegen: security add-generic-password -a JoernAdobe -s ghcr-techstack -w}"; \
	TMP=$$(mktemp); trap 'rm -f $$TMP $$TMP.f' EXIT; \
	if [ -n "$$ETHOS_ENV_FILE" ]; then cp "$$ETHOS_ENV_FILE" $$TMP; \
	else : "$${SSH_HOST:?SSH_HOST fehlt (.env.deploy)}"; \
		ssh $$SSH_OPTS "$$SSH_HOST" "cat $${REMOTE_DIR:-/opt/techstack-crawler}/.env" > $$TMP || exit 1; fi; \
	grep -E '^[A-Za-z_][A-Za-z0-9_]*=|^export ' $$TMP | sed -E -e 's/^export +//' -e "s/^([A-Za-z0-9_]+)=[\"'](.*)[\"']$$/\1=\2/" \
		| grep -vE '^(DB_HOST|DB_PORT|DB_NAME|PORT|NODE_ENV|HOST_PORT|HOST_PORT_HTTP|HOST_BIND|CONTAINER_PREFIX|OKTA_REDIRECT_URI|GIT_COMMIT)=' > $$TMP.f; \
	grep -q '^DB_USER=' $$TMP.f || echo "DB_USER=techstack" >> $$TMP.f; \
	for k in DB_PASSWORD DB_ROOT_PASSWORD; do grep -q "^$$k=." $$TMP.f || { echo "Fehler: $$k fehlt in der Env-Quelle"; exit 1; }; done; \
	echo "OKTA_REDIRECT_URI=https://$$ETHOS_CORP_HOST/auth/callback" >> $$TMP.f; \
	$$KC create secret generic techstack-env --from-env-file=$$TMP.f --dry-run=client -o yaml | $$KC apply -f - && \
	$$KC create secret docker-registry ghcr-secret --docker-server=ghcr.io --docker-username="$$GHCR_USER" \
		--docker-password="$$GHCR_TOKEN" --dry-run=client -o yaml | $$KC apply -f - && \
	echo ">>> Secrets aktualisiert ($$(wc -l < $$TMP.f | tr -d ' ') Env-Keys: $$(cut -d= -f1 $$TMP.f | tr '\n' ' '))"

# Manifeste anwenden, Rollout abwarten, Health- und Commit-Check
ethos-deploy:
	@$(ETHOS_LOAD); $(ETHOS_AUTH); \
	GIT_COMMIT=$$(git rev-parse --short HEAD); IMAGE=$${IMAGE:-$$GHCR_IMAGE:$$GIT_COMMIT}; \
	echo ">>> Deploy $$IMAGE → $$ETHOS_CONTEXT/$$ETHOS_NAMESPACE ($$ETHOS_HOST + $$ETHOS_CORP_HOST)"; \
	sed -e "s|__NAMESPACE__|$$ETHOS_NAMESPACE|g" -e "s|__IMAGE__|$$IMAGE|g" -e "s|__HOST__|$$ETHOS_HOST|g" -e "s|__CORP_HOST__|$$ETHOS_CORP_HOST|g" \
		-e "s|__MARIADB_IMAGE__|$${MARIADB_IMAGE:-mariadb:11}|g" $(PROJECT_DIR)/ethos.k8s.yaml | $$KC apply -f - || exit 1; \
	$$KC rollout status deployment/techstack-mariadb --timeout=300s && \
	$$KC rollout status deployment/techstack --timeout=600s || { $$KC get pods; exit 1; }; \
	echo ">>> Warte auf Ingress/DNS von $$ETHOS_CORP_HOST …"; \
	for i in 1 2 3 4 5 6 7 8 9 10 11 12; do HEALTH=$$(curl -sf -m 10 "https://$$ETHOS_CORP_HOST/api/health") && break; sleep 10; done; \
	if [ -z "$$HEALTH" ]; then echo ">>> Health-Check: https://$$ETHOS_CORP_HOST/api/health nicht erreichbar (VPN an? HTTPProxy-Status prüfen: make ethos-status)"; exit 1; fi; \
	REMOTE_COMMIT=$$(echo "$$HEALTH" | grep -o '"commit":"[^"]*"' | cut -d'"' -f4); \
	echo ">>> Health-Check: OK, Server-Commit $$REMOTE_COMMIT"; \
	[ "$$REMOTE_COMMIT" = "$$GIT_COMMIT" ] && echo ">>> Commit-Check: OK" || echo ">>> Commit-Check: MISMATCH (lokal=$$GIT_COMMIT)"; \
	echo ">>> MCP-Endpoint (Gateway, nur Rechenzentrum): https://$$ETHOS_HOST/mcp"; \
	echo ">>> Web-UI/MCP über VPN: https://$$ETHOS_CORP_HOST"

# Analysen von der Corp-VM in die Ethos-MariaDB übernehmen (überschreibt die Ethos-DB!)
ethos-migrate-db:
	@$(ETHOS_LOAD); $(ETHOS_AUTH); \
	: "$${SSH_HOST:?SSH_HOST fehlt (.env.deploy)}"; \
	printf ">>> Ethos-DB in $$ETHOS_NAMESPACE wird mit dem Stand der Corp-VM überschrieben. Weiter? [y/N] "; read a; [ "$$a" = y ] || exit 1; \
	ssh $$SSH_OPTS "$$SSH_HOST" "cd $${REMOTE_DIR:-/opt/techstack-crawler} && set -a && . ./.env && set +a && docker exec \$${CONTAINER_PREFIX:-techstack-}mariadb mariadb-dump -u root -p\"\$$DB_ROOT_PASSWORD\" --single-transaction techstack_crawler" \
		| $$KC exec -i deploy/techstack-mariadb -- sh -c 'mariadb -u root -p"$$MARIADB_ROOT_PASSWORD" techstack_crawler' && \
	echo ">>> Migration OK: $$($$KC exec deploy/techstack-mariadb -- sh -c 'mariadb -N -u root -p"$$MARIADB_ROOT_PASSWORD" -e "SELECT COUNT(*) FROM techstack_crawler.analyses"') Analysen"

ethos-status:
	@$(ETHOS_LOAD); $(ETHOS_AUTH); $$KC get pods,svc,pvc,httpproxy,networkpolicy -o wide; curl -s -m 10 "https://$$ETHOS_CORP_HOST/api/health"; echo

ethos-logs:
	@$(ETHOS_LOAD); $(ETHOS_AUTH); $$KC logs deploy/$${SERVICE:-techstack} --tail=$${LINES:-100}
