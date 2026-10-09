# Ethos-Deployment (für das CX Coworker Gateway)

**Warum:** Das CX Coworker Gateway läuft auf dem Ethos-Cluster `cxcoworker`/`cx-gateway`. Von dort erreicht es weder die Corp-VM `techstack.corp.adobe.com` noch Ethos-Corp-Cluster, weil zwischen diesen Netzen kein Peering besteht. Das Gateway-Team hat das am 2026-10-09 bestätigt. Der MCP-Upstream muss deshalb auf einem **Nicht-Corp-Ethos-Cluster** laufen, so wie die Beispiel-Card `statusmcp`: `https://statusmcp-staging.int.ethos105-stage-or2.ethos.adobe.net/mcp/`.

Die Corp-VM bleibt parallel als Web-App bestehen (`make deploy`). Ethos ist zusätzlich der Upstream für den Coworker-Marketplace.

## Geklärte Voraussetzungen (Stand 2026-10-09)

1. **Erreichbarkeit:** Laut Alex Trifan (Gateway-Team) sind `int`-Cluster vom Gateway aus erreichbar, `corp` und Ethos ATS nicht. Der Namespace muss deshalb auf einem `int`-Cluster liegen, z. B. `ethos105-stage-or2`, wo auch `statusmcp` läuft. Corp-Connected-Cluster wie `ethos53-*` mit dem Profil `it-corp` sind ungeeignet.
2. **Internet-Zugriff:**
   - Ethos-Namespaces sperren standardmäßig allen Traffic (Policy `np-eko--default`).
   - Pods mit dem Label `use-default-egress-policy: "true"` dürfen auf `0.0.0.0/0` über Port 80 und 443 hinaus, private Netze (RFC1918) ausgenommen. Das deckt das Crawlen öffentlicher Websites und Bedrock ab.
   - Websites auf anderen Ports bleiben gesperrt.
   - Quellen: devhome „deploy-doctor / Infrastructure & Config“, Jira EON-72421.
3. **Ingress:**
   - `int`-Cluster nutzen Contour mit `HTTPProxy` und der Ingress-Klasse `contour-internal`.
   - TLS-Secret für `*.int.<cluster>.ethos.adobe.net` ist `heptio-contour/cluster-ssl-int`.
   - Die FQDN kann frei gewählt werden, z. B. `techstack-mcp.int.<cluster>.ethos.adobe.net`.
   - Quelle: devhome „ethos-cluster-gateway / Cross-Cluster Connectivity“.
4. **Images:** Docker Hub über den Artifactory-Mirror `docker-hub-remote.dr-uw2.adobeitc.com/...` beziehen, falls der direkte Pull scheitert (`MARIADB_IMAGE`).

Fragen und Hilfe: `#ethos-flex-explorers`.

## Einmalig: Ethos-Grundlagen

Das Vorgehen entspricht den Schritten 1–7 in `~/.copilot/knowledge/references/ethos-deployment.md`.

1. ServiceNow: Unter **Service Registry → New Service** einen Service vom Typ „Hosted Solution – Web Application“ anlegen und die **Service ID** notieren.
2. Auf `iam.corp.adobe.com` eine LDAP-Gruppe anlegen und dich selbst als Admin eintragen. Danach 20–30 Minuten warten.
3. Tools installieren: `brew install kubectl Azure/kubelogin/kubelogin docker docker-buildx`. Ohne git.corp-Account (Repo `adobe-platform/k8s-kubeconfig`) reicht die Minimal-Kubeconfig im Repo: `project/ethos.kubeconfig.yaml`. `.env.ethos` exportiert `KUBECONFIG` darauf.
4. Unter `devhome.corp.adobe.com` → Self-Service → Namespaces einen Namespace anlegen, auf dem **vom Gateway abgestimmten Nicht-Corp-Cluster**. Profil `default` wählen und als Gruppe eine **Security-Gruppe** nehmen; bei einer reinen Mail-Gruppe kommt der Fehler `WrongGroupType`. Der Catalog-Eintrag kann bis zu 3 Stunden dauern.
5. Einen GitHub-PAT (classic) mit `write:packages`, `read:packages` und `repo` erstellen.
6. `cp .env.ethos.example .env.ethos` ausführen und Kontext, Namespace, Host und Image eintragen.
7. Okta: In der Okta-App zusätzlich die Redirect-URI `https://<ETHOS_CORP_HOST>/auth/callback` eintragen. Das ist nur für den Web-Login nötig; MCP nutzt IMS bzw. API-Tokens.

**kubelogin:** Versionen nach 0.1.9 speichern den Device-Code-Login nicht. Deshalb holen die `make ethos-*`-Targets **einmal pro Aufruf** ein Token und geben es per `--token` an alle kubectl-Aufrufe weiter. Pro make-Befehl kommt also genau ein Login-Code.

**Zwei Hosts:** `*.int.<cluster>.ethos.adobe.net` (`contour-internal`) ist nur aus Adobe-Rechenzentren erreichbar. Über diesen Host läuft das Coworker-Gateway. `*.corp.<cluster>.ethos.adobe.net` (`contour-corp`) ist über das VPN erreichbar und dient für Web-UI, Okta und Health-Check. `ETHOS_CORP_HOST` wird automatisch aus `ETHOS_HOST` abgeleitet (`.int.` → `.corp.`).

## Deploy

```bash
# einmalig: ghcr-PAT in den Schlüsselbund (make liest ihn automatisch)
security add-generic-password -a JoernAdobe -s ghcr-techstack -w "$(pbpaste)"
# kubelogin fragt per Device-Code → im eigenen Terminal ausführen
make ethos-image # Image linux/amd64 → ghcr.io (Tag = Git-Commit)
make ethos-secrets # Pull-Secret + App-Env (aus der .env der Corp-VM)
make ethos-deploy                           # MariaDB + App + HTTPProxy + NetworkPolicies, Rollout, Health-/Commit-Check
make ethos-migrate-db                       # optional: Analysen der Corp-VM übernehmen (überschreibt!)
```

Diagnose: `make ethos-status` und `make ethos-logs` (`SERVICE=techstack-mariadb make ethos-logs` für die Datenbank).

Smoke-Test gegen Ethos:

```bash
cd project && MCP_URL=https://<ETHOS_CORP_HOST>/mcp MCP_TOKEN="$(pbpaste | tr -d '[:space:]')" npm run test:mcp -- https://www.bmw.de
```

## Danach: Gateway umstellen

1. In `project/coworker-marketplace/gateway-stage-server-card.yaml` `url:` auf `https://<ETHOS_HOST>/mcp` setzen (`int`-Host).
2. `bash project/scripts/open-gateway-pr.sh` ausführen. Das Skript aktualisiert den Branch von PR #18968 (`Adobe-Experience-Platform/aif#18968`). Danach das Gateway-Team um Review und Merge bitten.

Stand 2026-10-09: Ethos läuft (`ethos105-stage-or2`, Image `4fd636b`), `/mcp` antwortet ohne Token mit 401, PR #18968 ist aktualisiert. Nach dem Merge in `.mcp.json` die `source` auf die Gateway-Collection-URL umstellen.

## Was die Manifeste mitbringen (`project/ethos.k8s.yaml`)

- **MariaDB 11:** eigener PVC mit 10 Gi und Update-Strategie `Recreate`. Falls Docker Hub im Cluster gesperrt ist, `MARIADB_IMAGE` auf einen Artifactory-Mirror setzen.
- **App:**
  - 1 Replica, Requests 1 CPU / 2 Gi, Limits 2 CPU / 4 Gi.
  - `/dev/shm` als Memory-`emptyDir` mit 1 Gi. Chromium crasht sonst mit dem Default von 64 MB.
  - Probes auf `/api/health`, Ausführung als nicht-root (`node`, UID 1000).
- **Contour-`HTTPProxy`** (`contour-internal`, TLS über `cluster-ssl-int`) für das Gateway, dazu ein zweiter Proxy `techstack-corp` (`contour-corp`, `cluster-ssl-corp`) für den Zugriff über VPN. Beide haben ein Response-Timeout von 300 s. `analyze-url` braucht bis zu 100 s, der Contour-Default liegt bei 15 s.
- **NetworkPolicies:** Erlaubt sind nur Ingress von `heptio-contour` auf Port 3001, DNS, App→MariaDB auf Port 3306 und der Internet-Egress über das EKO-Label (siehe oben, ohne interne Netze).
- **Troubleshooting:**
  - Timeouts beim Crawlen oder bei Bedrock: `$KC get networkpolicy` prüfen und kontrollieren, ob das Label `use-default-egress-policy` am Pod hängt.
  - Wenn `https://<host>` nicht antwortet: `$KC get httpproxy` ausführen; der Status muss `valid` sein.
- **Secrets:**
  - Liegen nur im k8s-Secret `techstack-env`, nie im Repo.
  - `make ethos-secrets` liest die `.env` der Corp-VM per SSH oder alternativ `ETHOS_ENV_FILE`.
  - Werte, die das Deployment selbst setzt (`DB_HOST` usw.), werden herausgefiltert.
  - `OKTA_REDIRECT_URI` wird auf den corp-Host gesetzt.
