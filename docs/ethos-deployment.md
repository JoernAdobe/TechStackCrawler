# Ethos-Deployment (für das CX Coworker Gateway)

**Warum:** Das CX Coworker Gateway läuft auf dem Ethos-Cluster `cxcoworker`/`cx-gateway`. Von dort erreicht es weder die Corp-VM `techstack.corp.adobe.com` noch Ethos-Corp-Cluster, weil zwischen diesen Netzen kein Peering besteht. Das Gateway-Team hat das am 2026-10-09 bestätigt. Der MCP-Upstream muss deshalb auf einem **Nicht-Corp-Ethos-Cluster** laufen, so wie die Beispiel-Card `statusmcp`: `https://statusmcp-staging.int.ethos105-stage-or2.ethos.adobe.net/mcp/`.

Die Corp-VM bleibt parallel als Web-App bestehen (`make deploy`). Ethos ist zusätzlich der Upstream für den Coworker-Marketplace.

## Vor dem Start mit dem Gateway-Team klären

Kanal: `#coworker-gateway`.

1. Welcher Cluster bzw. welche Namespace-Art ist vom Gateway aus erreichbar? Ist es dieselbe wie bei `statusmcp` (`ethos105-stage-or2`, Host `*.int.…`)?
2. Ist aus diesem Namespace **ausgehender Internet-Zugriff** möglich? Das ist Pflicht, denn der Crawler lädt öffentliche Websites und ruft AWS Bedrock auf.
3. Hostname-Konvention für die IngressRoute: Braucht `*.int.<cluster>.ethos.adobe.net` ein Ticket?

## Einmalig: Ethos-Grundlagen

Das Vorgehen entspricht den Schritten 1–7 in `~/.copilot/knowledge/references/ethos-deployment.md`.

1. ServiceNow: Unter **Service Registry → New Service** einen Service vom Typ „Hosted Solution – Web Application“ anlegen und die **Service ID** notieren.
2. Auf `iam.corp.adobe.com` eine LDAP-Gruppe anlegen und dich selbst als Admin eintragen. Danach 20–30 Minuten warten.
3. Tools installieren: `brew install kubectl azure/kubelogin/kubelogin docker docker-buildx`. Die Kubeconfig aus dem Ethos-Portal laden und `KUBECONFIG` setzen.
4. Unter `devhome.corp.adobe.com` → Self-Service → Namespaces einen Namespace anlegen, auf dem **vom Gateway abgestimmten Nicht-Corp-Cluster**. Der Catalog-Eintrag kann bis zu 3 Stunden dauern.
5. Einen GitHub-PAT (classic) mit `write:packages`, `read:packages` und `repo` erstellen.
6. `cp .env.ethos.example .env.ethos` ausführen und Kontext, Namespace, Host und Image eintragen.
7. Okta: In der Okta-App zusätzlich die Redirect-URI `https://<ETHOS_HOST>/auth/callback` eintragen. Das ist nur für den Web-Login nötig; MCP nutzt IMS bzw. API-Tokens.

## Deploy

```bash
# kubelogin fragt per Device-Code → im eigenen Terminal ausführen
GHCR_TOKEN=$(pbpaste) make ethos-image      # Image linux/amd64 → ghcr.io (Tag = Git-Commit)
GHCR_TOKEN=$(pbpaste) make ethos-secrets    # Pull-Secret + App-Env (aus der .env der Corp-VM)
make ethos-deploy                           # MariaDB + App + IngressRoute, Rollout, Health-/Commit-Check
make ethos-migrate-db                       # optional: Analysen der Corp-VM übernehmen (überschreibt!)
```

Diagnose: `make ethos-status` und `make ethos-logs` (`SERVICE=techstack-mariadb make ethos-logs` für die Datenbank).

Smoke-Test gegen Ethos:

```bash
cd project && MCP_URL=https://<ETHOS_HOST>/mcp MCP_TOKEN="$(pbpaste | tr -d '[:space:]')" npm run test:mcp -- https://www.bmw.de
```

## Danach: Gateway umstellen

1. In `project/coworker-marketplace/gateway-stage-server-card.yaml` `url:` auf `https://<ETHOS_HOST>/mcp` setzen.
2. Die Änderung in den Branch von PR #18968 übernehmen (`Adobe-Experience-Platform/aif#18968`) und das Gateway-Team um den Reachability-Check bitten.

## Was die Manifeste mitbringen (`project/ethos.k8s.yaml`)

- **MariaDB 11:** eigener PVC mit 10 Gi und Update-Strategie `Recreate`. Falls Docker Hub im Cluster gesperrt ist, `MARIADB_IMAGE` auf einen Artifactory-Mirror setzen.
- **App:**
  - 1 Replica, Requests 1 CPU / 2 Gi, Limits 2 CPU / 4 Gi.
  - `/dev/shm` als Memory-`emptyDir` mit 1 Gi. Chromium crasht sonst mit dem Default von 64 MB.
  - Probes auf `/api/health`, Ausführung als nicht-root (`node`, UID 1000).
- **Traefik-IngressRoute** auf `websecure` mit TLS über den Cluster-Default.
- **Secrets:**
  - Liegen nur im k8s-Secret `techstack-env`, nie im Repo.
  - `make ethos-secrets` liest die `.env` der Corp-VM per SSH oder alternativ `ETHOS_ENV_FILE`.
  - Werte, die das Deployment selbst setzt (`DB_HOST` usw.), werden herausgefiltert.
  - `OKTA_REDIRECT_URI` wird auf den Ethos-Host gesetzt.
