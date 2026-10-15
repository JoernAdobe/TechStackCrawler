# Plan: ObservePoint als zweite Prüfinstanz → Multi-Source-Evidence-Matrix

Stand: 2026-10-15 · Status: Phase 0 (Verifikation) und Phase 1 (MVP inkl. Evidence Matrix) implementiert; frischer Scan noch nicht live getestet

## 1. Ziel

Jede erkannte Technologie wird nicht mehr nur von **unserer** Erkennung (Scrapling + Detector + DNS + Multi-Page-Crawl) belegt, sondern von **mehreren unabhängigen Quellen**. Daraus entsteht eine **Evidence-Matrix** (Technologie × Quelle) mit einem **Konsens-Score**:

| Technologie | TechStack (eigen) | ObservePoint | DNS | … weitere | Konsens |
|---|---|---|---|---|---|
| Adobe Analytics | ✅ 0.95 (AppMeasurement, `/b/ss/`) | ✅ (Tag „Adobe Analytics“, Account-ID) | – | | **Bestätigt** |
| Tealium iQ | ✅ 0.70 (weak) | ❌ | – | | **Nur eigene Quelle** |
| Google Ads | ❌ | ✅ (pre-consent) | – | | **Nur ObservePoint** → Detector-Lücke |

ObservePoint ist dabei **kein Ersatz**, sondern eine zweite Sicht. Übereinstimmung = höhere Konfidenz; Abweichung = Prüfauftrag (und Trainingsmaterial für `customDetectors.ts`).

## 2. Ausgangslage im Code (Andockpunkte)

- `server/src/services/analyzer.ts` – Pipeline Scrape → Detect → Multi-Page → AI.
- `DetectedTechnology` (`types/analysis.ts`) – `confidence`, `weak`, `evidence[]`.
- **Enrichment-Muster** (`routes/enrichments.ts` + `db/enrichments.ts`): On-Demand, Ergebnis wird in `result_json.enrichments.<key>` gemergt → ObservePoint passt exakt hier rein (wie Lighthouse/Traffic).
- `SolutionMappingMatrix` / `KeyFinding` (`types/parity.ts`) – Account-Matrix mit 44 Building Blocks; wird um eine Quellen-Dimension erweitert.
- `consentAudit.ts` – Pre-Consent-Erkennung; ObservePoint liefert dazu eine starke Zweitmeinung.

## 3. ObservePoint-API (live verifiziert)

- Base-URL `https://api.observepoint.com`, Auth-Header `Authorization: api_key <OBSERVEPOINT_API_KEY>` (User-Level-Key).
- Der Key gehört zum geteilten Account „Adobe Digital Strategies and Solutions“ (≈ 11.000 Audits). Der EAA-Ordner „WebAudits“ (Folder-ID 100718) enthält je URL ein 1-Seiten-Audit – genau das, was wir wiederverwenden.
- Audits sind **asynchron** (Minuten) und verbrauchen **Page-Scan-Kontingent**.

**Lesend live verifiziert:**

| Methode | Endpoint | Zweck |
|---|---|---|
| `GET` | `/v3/web-audits` | Alle Audits (Name, ID, Domain-ID) für den Domain-Abgleich |
| `GET` | `/v2/domains` | Domain-Objekte zur Zuordnung Audit ↔ Domain |
| `GET` | `/v2/web-audits/{id}` | Vollständige Audit-Konfiguration (Basis für den PUT) |
| `GET` | `/v2/web-audits/{id}/runs` | Runs eines Audits (Status, Abschlusszeit, gescannte Seiten) |
| `GET` | `/v2/tags` | Tag-Bibliothek (1.511 Tags, 24 Kategorien) → Abdeckungsprüfung |
| `POST` | `/v3/web-audits/{a}/runs/{r}/reports/tag-inventory/tags?page&size` | Tag-Inventar eines Runs (Body `{}`) |
| `POST` | `/v3/web-audits/{a}/runs/{r}/reports/tag-inventory/tags/{tagId}/accounts?page=0&size=100` | Tag-Accounts (Report-Suite, GA4-ID, Launch-Property …); `size` muss ≥ 100 sein |

**Schreibend (nur für frische Scans, dokumentiert, noch nicht live ausgeführt):**

| Methode | Endpoint | Zweck |
|---|---|---|
| `PUT` | `/v2/web-audits/{id}` | Scratch-Audit auf Ziel-URL, Include-Filter und Seitenlimit umkonfigurieren |
| `POST` | `/v2/web-audits/{id}/runs` | Run starten |

Quelle für den Schreibweg: ObservePoint Help Center, [API Recipe: Update Audit Starting URLs](https://help.observepoint.com/en/articles/9106393-api-recipe-update-audit-starting-urls). Audits **per API anzulegen** ist nicht dokumentiert und wird deshalb bewusst nicht genutzt.

## 3a. Umsetzungsstand (Phase 0/1)

**Dateien (Server):**

- `server/src/services/observepoint/client.ts` – HTTP-Client (Key nur aus `config.observepoint`, nie geloggt; Fehlermeldungen ohne Key), Caches für Audits/Domains/Tag-Bibliothek.
- `server/src/services/observepoint/index.ts` – `getObservePoint(url, mode)` mit den Modi `reuse` und `fresh`.
- `server/src/services/observepoint/canonicalNames.ts` – Namens-Normalisierung ObservePoint ↔ TechStack (Sub-Tag-Qualifier, Aliase, Kategorie → Building Block).
- `server/src/services/evidenceMatrix.ts` – Evidence Matrix + Konsens + kombinierte Konfidenz.
- `server/src/routes/enrichments.ts` – REST-Endpunkte (siehe 4.6).
- `server/src/mcp/parityTools.ts` – MCP-Tool `get_evidence_matrix` (read-only).
- Ergebnisse liegen wie alle Enrichments in `result_json.enrichments.observepoint` bzw. `.evidenceMatrix` (keine neue Tabelle).

**Reuse-first:** Standard ist `mode: "reuse"` – kostenlos, ohne Kontingentverbrauch. Für die Domain der Analyse werden passende Audits im geteilten Account gesucht (exakte Domain vor Subdomains, max. 5 Kandidaten), der jüngste abgeschlossene Run innerhalb von `OBSERVEPOINT_MAX_RUN_AGE_DAYS` gewählt und dessen Tag-Inventar inkl. Accounts gelesen. Status: `done`, `running` (Run läuft noch) oder `not_found`.

**Scratch-Audit für frische Scans:** Nur mit `OBSERVEPOINT_ALLOW_CREATE=1` und `OBSERVEPOINT_SCRATCH_AUDIT_ID`. Das eigene, in der ObservePoint-UI angelegte Audit wird per `GET` geladen, per `PUT` auf Start-URL, Include-Filter (Host + Subdomains) und `OBSERVEPOINT_MAX_PAGES` umgestellt (Name = URL, damit der spätere Reuse-Abruf es findet) und per `POST …/runs` gestartet. Ist das Audit gerade belegt, kommt `running` zurück. Das Ergebnis liest der nächste Reuse-Abruf; beim Scratch-Audit zählt dabei nur der jüngste Run.

**Automatik (`autoScan.ts`):** Nach jeder gespeicherten Einzelanalyse gleicht der Server im Hintergrund automatisch ab (reuse). Gibt es kein Audit und sind Fresh-Scans aktiv, landet die Domain in einer seriellen Queue (ein Scratch-Audit = ein Scan gleichzeitig, max. 25 Jobs, gleiche Domain wird zusammengelegt). Der Worker wartet, bis das Scratch-Audit frei ist, startet den Scan, pollt genau seinen Run (1 min, Timeout 90 min) und schreibt Ergebnis + Evidence Matrix in alle wartenden Analysen. Offene Jobs (`observepoint.auto=true`, `status=running`) werden beim Serverstart wieder aufgenommen. Das Panel lädt sich selbst nach. Bulk-Läufe lösen keine Fresh-Scans aus (Kontingent). Pro Instanz (V-Server, Ethos) ein eigenes Scratch-Audit verwenden.

**Namensabgleich & Konsens:**

- 215 von 548 TechStack-Detektorregeln lassen sich auf die ObservePoint-Tag-Bibliothek abbilden; der Rest (Frameworks, CMS, CDN …) ist für ObservePoint unsichtbar und wird als `not-comparable` geführt – fehlende Abdeckung zählt also nicht als Widerspruch.
- Status pro Technologie: `confirmed` (beide), `techstack-only`, `observepoint-only` (beide könnten, nur eine sieht sie), `not-comparable`.
- `agreementRate = confirmed / comparable` (in Prozent, `null`, wenn nichts vergleichbar ist); zusätzlich ein Verdict pro Building Block (`agree` / `partial` / `conflict` / `single`).
- Kombinierte Konfidenz per Noisy-OR: ObservePoint-Zuverlässigkeit 0,9, schwache TechStack-Erkennung 0,35, Dämpfung 0,7, wenn die andere Quelle die Technologie erkennen könnte, sie aber nicht sieht. Schwache eigene Funde, die ObservePoint bestätigt, werden als `upgradedFromWeak` markiert.

**Umgebungsvariablen** (alle optional, durchgereicht in `docker-compose.yml`; in Ethos über das Secret `techstack-env`):

| Variable | Default | Bedeutung |
|---|---|---|
| `OBSERVEPOINT_API_KEY` | leer | Ohne Key ist die Quelle deaktiviert (Route antwortet 503). |
| `OBSERVEPOINT_BASE_URL` | `https://api.observepoint.com` | API-Basis-URL |
| `OBSERVEPOINT_MAX_RUN_AGE_DAYS` | `365` | Ältere Runs werden nicht wiederverwendet. |
| `OBSERVEPOINT_ALLOW_CREATE` | aus | `1` erlaubt frische Scans (verbraucht Kontingent). |
| `OBSERVEPOINT_SCRATCH_AUDIT_ID` | `0` | ID des eigenen Scratch-Audits aus der OP-UI |
| `OBSERVEPOINT_MAX_PAGES` | `5` | Seitenlimit pro frischem Scan |

## 3b. Implementation Insights & Findings (Phase 2)

Im selben `reuse`-Abruf (gleicher Audit, gleicher Run) liest der Server zusätzlich Insights und hängt sie additiv als `ObservePointResult.insights` an: `{ versions, adobeFootprint, quality, privacy, findings, run, notes }`.

**Dateien:** `services/observepoint/insights.ts` (reine Builder + `fetchRunInsights`), `services/observepoint/findings.ts` (Findings + Use-Case-Verknüpfung), `services/observepoint/versionRules.ts` (datengetriebene Upgrade-Regeln), Wrapper in `client.ts`.

**Endpunkte** (alle lesend, nach `docs/observepoint-api-audit.md`, parallel abgerufen; 429/5xx-Retry über `withRetry` im Client):

| Block | Endpunkte |
|---|---|
| Versions | `POST /v3/reports/grid/tags` (TAG × TAG_VERSION, Seiten, Median-Dauer), Page-Tags der ersten Seite (`GET …/pages/{pageId}/tags?getInsights=true`) für Launch-Build und Turbine |
| Adobe-Footprint | Page-Tags (Tag-Variablen: IMS-Org, Report Suite, trackingServer, Target-Client, Launch-Property/Environment/Build, eVars/props) + Run-Tag-Inventar |
| Quality | `…/reports/tag-health/tags`, `…/reports/tag-duplicates-and-multiples/tags`, `…/reports/browser-logs` (+ `/messages`, Top N Errors/Warnings), `…/reports/page-summary` (+ `/pages`, Web Vitals LCP/FCP/TTFB/CLS, Ladezeit) |
| Privacy | `…/reports/cookie-inventory` (+ `/cookies`: Party, Laufzeit, Secure/SameSite, auslösender Tag über Run-Tags bzw. `/v2/tags`), `…/reports/request-privacy/compliance` (Länder, Top-Hosts außerhalb der EU), Consent-Tool + Version aus den Tags, Google Consent Mode (`gcs`/`gcd` aus Google-Requests), `GET …/info` (Consent-Aktionen, GPC) |

**Fehlertoleranz:** Jeder Call hat ein eigenes `try/catch` und schreibt bei Fehlern `"<label> unavailable: …"` in `notes`. Jeder Builder läuft in einem eigenen Safe-Wrapper: Scheitert ein Block, ist er `null` (mit Note), die anderen laufen weiter. Selbst wenn die Insights komplett scheitern, bleibt das Tag-Inventar und damit die Evidence Matrix erhalten. Im Client werden leere Blöcke ausgeblendet; Notes erscheinen als „Partial data“.

**Upgrade-Regeln (`versionRules.ts`):** AppMeasurement → Web SDK, at.js → Web SDK, aktives Universal Analytics → GA4/CJA, DTM → Tags, veraltetes jQuery, Visitor API (ECID-Service) → Web SDK, Launch-Build älter als 12 Monate. Jede Regel besteht aus Tag-Matcher, optionaler Versionsbedingung, Severity und Adobe-Argument. Neue Regeln lassen sich ohne Code-Änderung an der Logik ergänzen.

**Findings (`deriveFindings`, max. 15, sortiert nach Severity):** `{ id, type: 'technical'|'privacy'|'version', severity, title, evidence, adobeAngle }`. IDs: `op-version-<ruleId>`, `op-broken-tags`, `op-duplicate-tags`, `op-console-errors`, `op-slow-tags`, `op-web-vitals`, `op-non-eu-requests`, `op-third-party-cookies`, `op-long-lived-cookies`, `op-no-consent-tool`, `op-no-google-consent-mode`.

**Einbindung in die Use-Case-Erkennung:**

- `prompts/useCaseDiscoveryPrompt.ts` hängt, wenn die gespeicherte Analyse OP-Findings enthält, den Abschnitt „Measured Implementation Findings (Source: ObservePoint)“ an den Prompt an: kompakt, sanitisiert, max. 15 Findings. Das LLM darf pro Use Case `evidenceFindingIds` zurückgeben und keine IDs erfinden.
- `services/useCaseDiscovery.ts` → `applyFindingsToUseCases`: validiert die IDs. Fallback ist ein Keyword-Match über die Themen (Tag-Governance, Web-SDK-Migration, Event Forwarding/First-Party, Consent/Privacy, Performance/Edge). Ungedeckte High-Findings ersetzen den schwächsten Use Case ohne Evidenz durch einen regelbasierten Use Case mit „Source: ObservePoint“. Der `llmCall`-Retry bleibt unverändert; der Mock-Pfad nutzt dieselben Regeln.
- Client: Findings-Liste mit Severity-Badges in der OP-Karte (`ObservePointInsights.tsx`), Evidenz-Hinweis „Based on ObservePoint findings“ auf der Use-Case-Karte.
- MCP: `get_evidence_matrix` liefert `insights` mit.

**Consent-Hinweis:** ObservePoint-Audits laufen in der Regel mit akzeptiertem Consent-Banner (Consent-Aktionen im Run). Cookies und Requests zeigen deshalb das Verhalten *nach* Zustimmung. Das Non-EU-Finding zählt auch die eigene Domain des Kunden mit, wenn diese in den USA gehostet ist. Die UI zeigt immer „Data from OP run <date>, <n> pages, consent banner may have been accepted“.

## 4. Architektur

### 4.1 Source-Adapter-Abstraktion (Basis für die Matrix)

```ts
// server/src/services/sources/types.ts
export type EvidenceSourceId = 'techstack' | 'observepoint' | 'dns' | 'builtwith' | 'wappalyzer' | 'httparchive';

export interface SourceDetection {
  canonicalName: string;      // nach Normalisierung (siehe 4.3)
  rawName: string;            // Originalname der Quelle
  category?: string;
  confidence?: number;        // 0–1, quellenspezifisch kalibriert
  evidence?: string[];        // z. B. Request-URL, Account-ID, Seite
  accountIds?: string[];      // z. B. Report-Suite, GA4-ID, Launch-Property
  pagesSeen?: number;
  preConsent?: boolean;
}

export interface EvidenceSourceAdapter {
  id: EvidenceSourceId;
  mode: 'sync' | 'async';
  isEnabled(): boolean;                       // z. B. Key vorhanden
  run(url: string, opts: { maxPages?: number }): Promise<SourceRun>;
}
```

Unsere eigene Erkennung wird als Adapter `techstack` gewrappt (keine Logikänderung), ObservePoint als `observepoint`. Weitere Quellen kommen später nur als neuer Adapter dazu.

### 4.2 ObservePoint-Adapter (`services/sources/observepoint.ts`)

- Audit-Strategie: **ein wiederverwendbares Audit pro Domain** (Lookup per Name `techstack:<domain>`), sonst anlegen → spart Setup, ermöglicht Trends/History.
- Default **10–25 Seiten** (konfigurierbar `OBSERVEPOINT_MAX_PAGES`), um Kontingent zu schonen.
- Polling mit Backoff (z. B. 15 s → max. 2 min Intervall, Timeout 30 min); später optional Webhook-Endpoint `/api/webhooks/observepoint` (Secret-geschützt).
- Mapping: Tag-Inventar → `SourceDetection[]` inkl. Account-IDs und Seitenabdeckung (`pagesSeen / pagesScanned` ⇒ Konfidenz).
- Fehler/Timeouts brechen nie die Hauptanalyse (Muster wie Multi-Page-Crawl).
- Key nur über `config.ts` (`process.env.OBSERVEPOINT_API_KEY`), nie loggen; in `docker-compose.yml` und `ethos.k8s.yaml` als Secret durchreichen.

### 4.3 Normalisierung (kritisch für den Abgleich)

ObservePoint benennt Tags anders als unser Detector (z. B. „Adobe Analytics“ vs. „AppMeasurement“, „Google Analytics 4“ vs. „GA4“).

- Neue Datei `services/sources/canonicalNames.ts`: Alias-Tabelle `rawName → canonicalName` + Kategorie-Mapping auf die 44 Building Blocks.
- Unbekannte Namen landen in `unmappedNames` und werden im Admin-Dashboard gelistet → Alias-Tabelle wächst kontinuierlich.

### 4.4 Konsens-Engine (`services/consensus.ts`)

Pro kanonischer Technologie:

| Status | Regel |
|---|---|
| `confirmed` | ≥ 2 unabhängige Quellen (eigene + ObservePoint) |
| `single-source:<id>` | nur eine Quelle |
| `conflict` | gleiche Kategorie, verschiedene Lösungen (z. B. wir: Tealium, OP: Adobe Launch) |
| `version-mismatch` | Version/Account-ID weicht ab |

Konsens-Konfidenz: `1 − Π(1 − w_s · c_s)` (Noisy-OR) mit Quellengewichten `w_s` (Start: techstack 0.9, observepoint 0.95, dns 0.7). Gewichte später aus dem Feedback kalibrieren (5.3).

Wichtig: Eine **schwache** eigene Erkennung (`weak: true`), die ObservePoint bestätigt, wird automatisch **stark** → geht als verifizierte Detektion in den AI-Prompt.

### 4.5 Datenmodell

- `AnalysisEnrichments.observepoint?: ObservePointResult` (Rohdaten: auditId, runId, Seiten, Tags, Status `queued|running|done|failed`).
- `AnalysisEnrichments.evidenceMatrix?: EvidenceMatrix` (berechnet: Zeilen = Technologien, Spalten = Quellen, plus Konsensstatus und `agreementRate`).
- Neue Tabelle `source_runs` (analysis_id, source, external_run_id, status, started_at, finished_at, error) für asynchrone Jobs und Kosten-Tracking – SQLite **und** MariaDB (`schema.sql`, `parityTables.ts`).

### 4.6 API & MCP

**Umgesetzt:**

- `POST /api/analyses/:id/enrich/observepoint`, Body `{ "mode": "reuse" | "fresh" }` (Default `reuse`) → `{ observepoint, evidenceMatrix }`; beides wird in `enrichments` gespeichert.
- `GET /api/observepoint/status` → `{ configured, freshScans, maxPages, maxRunAgeDays }` (ohne Key-Wert).
- MCP-Tool `get_evidence_matrix(analysisId)` – liest nur die gespeicherte Matrix + ObservePoint-Zusammenfassung; ohne gespeicherte Matrix kommt ein Hinweis, die Enrichment-Route aufzurufen. Löst selbst keine ObservePoint-Calls aus.

**Später:** `GET /api/analyses/:id/sources` (Status aller Quellen), MCP-Tool `run_observepoint(analysisId)`.

### 4.7 Frontend

- Neuer Tab **„Evidence Matrix“** in der Analyse-Ansicht: Technologie × Quelle, Ampel pro Zelle, Konsens-Badge, Filter „nur Abweichungen“.
- Kopfzeile: **Agreement-Rate** (z. B. „87 % Übereinstimmung TechStack ↔ ObservePoint“) als Confidence-Kennzahl für Kunden-Gespräche.
- Badge pro Technologie in der bestehenden Liste („bestätigt durch 2 Quellen“).
- Account-Matrix: Zelle zeigt Quellen-Icons; Key Findings um „nur von ObservePoint gesehen“ ergänzen.
- Exporte (XLSX/MD/PPTX): zusätzliche Spalten/Folie „Source Validation“.

## 5. Sinnvolle Ergänzungen

1. **Detector-Lern-Loop:** Jede `single-source:observepoint`-Technologie wird als Kandidat für eine neue Regel in `customDetectors.ts` gesammelt (Admin-Liste mit Beispiel-Request-URLs). So schließt ObservePoint systematisch unsere Erkennungslücken.
2. **Consent-/Privacy-Gegenprüfung:** ObservePoint-Privacy-/Cookie-Daten gegen `consentAudit.ts` halten → „Pre-Consent-Tracking von 2 Quellen bestätigt“ ist ein starkes, belastbares Argument (AEP Consent / Adobe Web SDK Story).
3. **Tag-Health als Opportunity-Signal:** Duplikate/Mehrfach-Tags, fehlerhafte Tags, langsame Tags (Report `tag-duplicates-and-multiples`) → direkte Adobe-Opportunity (Web SDK / Tags-Konsolidierung) im AI-Prompt.
4. **Account-IDs abgleichen:** Report-Suite-IDs, Launch-Property, GA4-IDs aus beiden Quellen → erkennt Multi-Instanz-Setups über Properties hinweg.
5. **Kosten-/Kontingent-Guard:** Page-Scan-Zähler pro User/Tag, Admin-Freigabe ab Schwelle (wie `BATCH_APPROVAL_THRESHOLD`), Ergebnis-Cache 7 Tage pro Domain.
6. **Feedback-Kalibrierung:** In-App-Feedback „Technologie stimmt/stimmt nicht“ pro Matrixzelle → Quellengewichte `w_s` empirisch justieren; Dashboard „Precision pro Quelle“.
7. **Weitere Quellen (Matrix-Ausbau):** Wappalyzer-API, BuiltWith (Historie!), HTTP Archive/BigQuery (kostenlos, monatlich), Adobe-interne Quellen (Panorama/Dynamics: „Kunde hat Lizenz X“ vs. „wir sehen X live“ → **Shelfware-/Adoption-Signal**).

## 6. Umsetzungsphasen

| Phase | Inhalt | Aufwand |
|---|---|---|
| **0 – Verifikation** ✅ | Key live getestet, OpenAPI-Spec gezogen, Lese-Endpunkte verifiziert (siehe 3) | erledigt |
| **1 – MVP** ✅ | Reuse-first-Adapter + Scratch-Audit für frische Scans, Enrichment-Route, Normalisierung, Evidence Matrix + Agreement-Rate, MCP-Tool `get_evidence_matrix` | erledigt (frischer Scan noch nicht live getestet) |
| **2 – Matrix-UI** | Frontend-Tab + Agreement-Rate (in Arbeit), Weak→Strong-Upgrade in den AI-Prompt übernehmen | 1–2 Tage |
| **3 – Account/Exporte** | Batch-/Account-Integration, XLSX/PPTX/MD, MCP-Tools, Kosten-Guard | 2 Tage |
| **4 – Ausbau** | Lern-Loop, Consent-Gegenprüfung, Tag-Health, weitere Quellen-Adapter, Feedback-Kalibrierung | fortlaufend |

## 7. Offene Punkte / Risiken

- **Frischer Scan – Live-Test ausstehend:** Der Schreibweg (`PUT` + `POST …/runs` auf das Scratch-Audit) ist implementiert, aber erst nach ausdrücklicher Freigabe durch Jörn live auszuführen (Kontingent im geteilten Account).
- **Weitere Quellen:** Matrix ist auf `techstack` + `observepoint` ausgelegt; DNS, Wappalyzer, BuiltWith, HTTP Archive usw. folgen später (siehe 5.7).
- **Namensabdeckung:** 333 Detektorregeln ohne ObservePoint-Pendant bleiben `not-comparable`; Alias-Tabelle in `canonicalNames.ts` bei Bedarf erweitern.

- **Lizenz/Kontingent:** Wie viele Page-Scans hat der Account? Erlaubt die Lizenz Audits auf Fremd-/Prospect-Domains?
- **Laufzeit:** Audits dauern Minuten → bewusst asynchron, UI zeigt „läuft“-Status; Single-Analyse bleibt schnell.
- **Datenhaltung:** Audits liegen im ObservePoint-Account; Aufräum-Strategie (Audits nach X Tagen löschen) festlegen.
- **Secrets:** Key liegt lokal in `project/.env` (gitignored) und in der macOS-Keychain (`techstack-observepoint-api-key`); für Prod in Ethos-Secret bzw. Server-`.env` hinterlegen.
