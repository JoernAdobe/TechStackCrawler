---
name: coworker-plugin
description: Playbook für den Bau eines Plugins für den CX Enterprise Coworker (Adobe) inklusive eigenem MCP-Server – Marketplace-Struktur, .mcp.json mit IMS-Passthrough, Gateway-Onboarding (Server-Card + Manifest im Repo Adobe-Experience-Platform/aif), Hosting des MCP-Upstreams auf Ethos (Namespace, Kubeconfig, kubelogin, int/corp-Ingress, Egress) und End-to-End-Test. Trigger bei "Coworker Plugin", "Coworker Marketplace", "Plugin für Coworker", "MCP-Server in Coworker", "CX Coworker Gateway", "Server-Card", "manifest_id", "Ethos deployen für MCP".
---

# Coworker-Plugin bauen – Playbook

Gelernt am TechStackCrawler (Repo `JoernAdobe/TechStackCrawler`, Okt 2026). Referenz-Implementierung dort:
`project/coworker-marketplace/`, `project/server/src/mcp/{auth,imsAuth}.ts`, `project/ethos.k8s.yaml`,
`project/ethos.kubeconfig.yaml`, `Makefile` (Targets `ethos-*`), `project/scripts/open-gateway-pr.sh`, `docs/ethos-deployment.md`.
**Erst dort abschauen, dann bauen.**

## 0. Architektur (so funktioniert es)

```
Coworker (Plugin: SKILL.md + .mcp.json)
   │  IMS-User-Token (passthrough)
   ▼
CX Coworker Gateway  (cx-coworker-gateway[-stage].adobe.io)
   │  Server-Card (url = Upstream) + Manifest, beide im Repo Adobe-Experience-Platform/aif
   ▼
Eigener MCP-Server auf Ethos  (*.int.<cluster>.ethos.adobe.net, contour-internal)
```

Harte Fakten:
- Coworker **erreicht keine** Corp-VMs, `*.corp.adobe.com` oder 10.x-Hosts direkt und hat **keinen** lokalen/stdio-Modus. Der MCP-Server muss über das **Gateway** laufen.
- Das Gateway erreicht den **int-Ingress** auf Nicht-Corp-Ethos-Clustern. Präzedenzfall: `statusmcp` auf `*.int.ethos105-stage-or2.ethos.adobe.net`.
- `*.int.…` ist nur aus Adobe-Rechenzentren erreichbar, **nicht vom Laptop über VPN**. Für eigene Tests deshalb zusätzlich einen `*.corp.…`-Ingress anlegen (`contour-corp`, TLS `heptio-contour/cluster-ssl-corp`).

## 1. Marketplace + Plugin (Coworker-Format, NICHT Claude-Code-Format)

Struktur (Ordner im **öffentlichen** GitHub-Repo; private Repos kann Coworker ohne Token nicht lesen):
```
<marketplace-dir>/
  .claude-plugin/marketplace.json
  plugins/<plugin>/.claude-plugin/plugin.json
  plugins/<plugin>/.mcp.json
  plugins/<plugin>/skills/<skill>/SKILL.md
```
- `marketplace.json` braucht `name`, `owner.name`, `description`, `metadata{description,version}` und `plugins[]` mit `name`, `source` (`./plugins/<plugin>`), `version`, `description`, `author.name`. **Fehlt etwas, zeigt Coworker „0 plugins“.**
- Die `version` in `plugin.json` muss mit dem Marketplace-Eintrag übereinstimmen. Bei jeder Änderung hochzählen, sonst lädt Coworker nichts neu.
- `.mcp.json` (Coworker-Schema):
  ```json
  {"auth_providers":[{"name":"<x>-ims","provider":{"type":"passthrough","headers":{"authorization":"authorization"}}}],
   "mcp_servers":{"servers":[{"name":"<plugin>","source":"https://cx-coworker-gateway-stage.adobe.io/mcp/collection/<manifest_id>?manifest_id=<manifest_id>","transport":"streamable_http","auth":"<x>-ims","tool_timeout_seconds":180}]}}
  ```
  Niemals statische Tokens ins Plugin legen. `.gitignore` braucht eine Ausnahme für `.mcp.json`, falls es dort ignoriert wird.
- SKILL.md: wann welches Tool genutzt wird (Coworker benennt Tools als `mcp__<server>__<tool>`), dass nie nach Tokens gefragt wird und dass bei Fehlern nichts erfunden wird.
- In Coworker einbinden: Repo, Branch und Subdirectory angeben. Vorbilder: `OneAdobe/cxota-extensions`, `Adobe-Experience-Platform/adlc-extensions`.
- Einen Test schreiben, der Struktur, Versionen und `.mcp.json` prüft (Vorlage: `project/server/tests/coworker-marketplace.test.ts`).

## 2. MCP-Server: Auth

- Transport: Streamable HTTP auf `/mcp`.
- Den `Authorization: Bearer <IMS-Token>` per IMS-Userinfo validieren und nur `@adobe.com` zulassen. Das Ergebnis cachen (Vorlage `imsAuth.ts`). Über das Gateway kommt ein OBO-Token mit `client_id` `gpt_power_client`, deshalb **keine** Client-Allowlist setzen.
- Optional für Skripte und Tests: zusätzlich app-eigene API-Tokens zulassen (Präfix `tsa_`).
- Ohne Token muss der Server `401` liefern. Das ist der erste Erreichbarkeits-Check.
- Lange Tools (Crawler + LLM): in der Card `timeout.read` (z. B. 180 s) setzen, im Contour-`HTTPProxy` `timeoutPolicy.response` auf 300 s (Default 15 s).

## 3. Upstream auf Ethos hosten (Details: `docs/ethos-deployment.md` im TechStackCrawler-Repo)

Einmalig (Klickarbeit für Jörn, laienverständlich anleiten):
1. ServiceNow → Service Registry → Service anlegen → **Service ID**. Als Cost Center die eigene Kostenstelle eintragen.
2. `iam.corp.adobe.com`: LDAP-Gruppe anlegen und den Schalter **„Security Group“ einschalten**. Sonst kommt in DevHome `WrongGroupType … securityEnabled`.
3. DevHome → Self-Service → Namespace anlegen: Cluster **ethos105-stage-or2** (Nicht-Corp), Profil **`default`**, Gruppe aus Schritt 2. RBAC braucht bis zu 3 h.
4. ghcr: Einen **Classic-PAT** (`write:packages`, `read:packages`, `repo`) im Schlüsselbund ablegen. Der Cluster bekommt ein `ghcr-secret`.
5. Tools: `brew install kubectl Azure/kubelogin/kubelogin` und Docker mit buildx (Image **linux/amd64**).

Kubeconfig ohne git.corp-Account:
- Die Minimal-Kubeconfig aus `project/ethos.kubeconfig.yaml` kopieren (EKS-Server `https://apiserver.corp.<cluster>.ethos.adobe.net`, kubelogin-`exec` mit `--login devicecode --legacy`).
- **kubelogin > 0.1.9 speichert den Login nicht.** Jeder kubectl-Aufruf will dann einen neuen Device-Code. Lösung im Makefile: einmal `kubelogin get-token` aufrufen und dann `kubectl --user ethos-token --token $TOKEN` nutzen. Dafür braucht die Kubeconfig einen leeren User `ethos-token`. Tokens nie ausgeben.

Manifeste (Vorlage `project/ethos.k8s.yaml`):
- Deployment(s) + Service, bei Bedarf MariaDB mit PVC (`Recreate`).
- **Zwei HTTPProxies**: `contour-internal` + `cluster-ssl-int` für das Gateway, `contour-corp` + `cluster-ssl-corp` für VPN-Tests (`.int.` → `.corp.`).
- NetworkPolicies (default-deny): Ingress aus `heptio-contour`, DNS, App→DB. **Internet-Egress nur über das Pod-Label `use-default-egress-policy: "true"`** (80/443, ohne RFC1918). **Keine** eigene `0.0.0.0/0`-Policy, weil die interne Netze öffnet (SSRF-Risiko).
- `kubectl apply` löscht keine Objekte, die aus dem Manifest entfernt wurden. Die muss man mit `kubectl delete` von Hand löschen.
- Chromium: `/dev/shm` als Memory-`emptyDir`, nicht als root laufen lassen.
- Secrets per `kubectl create secret … --dry-run=client -o yaml | kubectl apply -f -`, nie im Repo.

Ablauf: `make ethos-image` → `make ethos-secrets` → `IMAGE=… make ethos-deploy`. Pro make-Befehl kommt **ein** Device-Login (https://login.microsoft.com/device). Danach den Health-Check über den corp-Host prüfen und `curl -X POST https://<corp-host>/mcp` aufrufen; erwartet ist `401`.

## 4. Gateway-Onboarding (Stage)

- Repo `Adobe-Experience-Platform/aif`, **nur Fork-PRs**, mit GHEC-Account `daudert_adobe` (`GH_TOKEN="$(gh auth token -u daudert_adobe)"`; niemals `gh auth login` ohne `--hostname`, das stellt den aktiven Account um).
- Dateien: `config/cxo-ai-gateway/environments/stage/mcp_servers/<id>_mcp.yaml` (Server-Card) und `…/stage/manifests/<id>.yaml` (eigenes Manifest).
- Server-Card: `server_id`, `name`, `description`, `url` (int-Host `/mcp`), `authentication.ref: authentication/ims_passthrough`, `include_tools`, `required_segments: [internal-orgs]`, `timeout {connect, read}`. Vorlagen: `use_case_advisor`, `statusmcp`, `aa-mcp-bundle`.
- Stage auf einem eigenen Manifest geht **ohne ARB**, Prod braucht Architektur-Review (Wiki „Onboarding an MCP Server to the CX Coworker Gateway Checklist“, wiki.corp.adobe.com/spaces/ACA/pages/4028241525).
- Skript-Vorlage: `project/scripts/open-gateway-pr.sh` legt den PR an oder aktualisiert einen bestehenden.
- Kanäle: **#coworker-gateway** (C0ASGEU1BT9); Engineering **#aif-contribute** (C08U50NRA01), `@cx-coworker-gateway-dev`.

## 5. Test-Reihenfolge

1. Plugin-Tests grün.
2. Smoke-Test des MCP-Servers mit API-Token: Tools listen + ein Tool aufrufen.
3. Ohne Token liefert `/mcp` den Wert `401`.
4. **Erst nach Merge + Rollout des Gateway-PRs** in Coworker testen: Plugin-Version hochzählen, den Marketplace synchronisieren, einen Prompt mit Tool-Aufruf schicken und in den Server-Logs nach `ims ok` suchen.

## Arbeitsweise mit Jörn

- Jörn ist kein Engineer: Er führt Terminal-Befehle selbst aus (docker, kubectl, kubelogin, brew und der Schlüsselbund sind in der Agent-Session blockiert). Immer **vollständige, einzeln kopierbare** Befehle geben, ohne „…“.
- Kosten Ethos: Showback, grob 30–60 $/Monat für 1 App-Pod plus kleine DB.
