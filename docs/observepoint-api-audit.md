# ObservePoint-API-Audit: Welche zusätzlichen Daten lohnen sich für den TechStack Analyzer?

Stand: Oktober 2026 · Methode: ausschließlich lesende Calls (GET sowie Report-/Grid-POSTs, die nur Abfragen sind) gegen den geteilten Corporate-Account. Es wurde nichts angelegt, geändert, gestartet oder exportiert.

## 0. Ausgangslage, Quellen und Testbasis

**Heute genutzt** (siehe `project/server/src/services/observepoint/client.ts` und `docs/observepoint-integration-plan.md`):

- `GET /v3/web-audits`, `GET /v2/domains`, `GET /v2/tags`, `GET /v2/web-audits/{id}` und `/runs`
- `POST …/reports/tag-inventory/tags` und `…/tags/{tagId}/accounts`

Damit fließt heute nur „welches Tag, welcher Account“ in die Evidence Matrix ein. Opt-in-Schreibzugriffe (`PUT` Audit, `POST` Run) bleiben davon unberührt.

**Offizielle Doku:**

- Die REST-API-Doku ist heute ein Redocly-Portal: <https://api-docs.observepoint.com/>
- Vollständige OpenAPI-Spec (v3, 235 Pfade): <https://api-docs.observepoint.com/_bundle/openapi/combined.openapi.json?download>
- Grid Reporting API (offiziell empfohlener Weg für Ergebnisdaten): <https://api-docs.observepoint.com/_bundle/openapi/GRID-API.openapi.json?download>, Gruppierung: <https://api-docs.observepoint.com/sections/grid-api-grouping>
- Help Center mit den API-Rezepten (Network Requests, Tags, Console Logs, Resource Initiators, Cookies, Webhooks, Rate Limiting) und dem offiziellen ObservePoint-MCP-Server: <https://help.observepoint.com/en/>

**Testbasis:**

| Audit | Run | Seiten | Zweck |
|---|---|---|---|
| lazardassetmanagement.com (2206959) | 10450181 | 1 | Einzelseite mit vollem Adobe-Stack (AA, Target, Launch, AEM, ACDL) |
| hollister.com (2000947) | 8289442 | 100 | Multi-Page-Reports (Duplicates, Tag-Health, Browser-Logs, Coverage) |

Rohdaten liegen im Session-Ordner unter `files/api-audit/raw/` und sind nicht im Repo.

Legende:

- **verified?** ✅ = live mit 200 und plausiblen Daten getestet · 🟡 = 200, aber leer bzw. abhängig von der Audit-Konfiguration · 📄 = nur laut Doku
- **Aufwand:** S < 1 Tag · M 1–3 Tage · L > 3 Tage
- **Priorität:** P1 = sofort, P2 = nächste Iteration, P3 = später/optional

## 1. Übersicht

| # | Information | Endpoint (Basis `/v3/web-audits/{a}/runs/{r}`) | verified? | Nutzen für Projekt | Aufwand | Priorität |
|---|---|---|---|---|---|---|
| 1 | Tag-Versionen (AppMeasurement, at.js, OneTrust, Marketo …) | Grid `POST /v3/reports/grid/tags` (`TAG_VERSION`) bzw. `POST reports/variable-inventory/tag-account-variable-values` | ✅ | AA `JS-2.27.0` ohne Web SDK und at.js 2.x führen direkt zur Opportunity „Migration auf Web SDK / Edge Network“ | S | **P1** |
| 2 | Launch-/Tags-Build-Infos (`_satellite`: Property, Build-Datum, Turbine-Version, Environment) | `GET pages/{pageId}/tags?getInsights=true` (`tagInstanceVariables`) | ✅ | Reifegrad des Tag-Managements; ein altes Build-Datum signalisiert vernachlässigte Implementierung | S | **P1** |
| 3 | Adobe-Analytics-Details (Report Suite, trackingServer, mcorgid, genutzte eVars/props) | `POST reports/variable-inventory`, `…/tags`, `…/tag-account-variables`, Page-`tags` | ✅ | Harte Evidenz für den bestehenden Adobe-Footprint (IMS-Org, RS); belegt CJA-Potenzial über die Zahl der eVars | M | **P1** |
| 4 | Cookie-Inventar mit Herkunft (Pre-Audit-Action/Page-Load), Initiator-Tag, 1st/3rd-Party, Laufzeit, Secure/SameSite | `POST reports/cookie-inventory[/cookies]`, `GET pages/{id}/cookies`, Grid `cookies` | ✅ | GDPR-Risiko-Karte: 3rd-Party-Cookies und langlebige Cookies führen zum AEP-Consent-/Data-Governance-Story | M | **P1** |
| 5 | Consent-Signale (OneTrust-Gruppen, Google Consent Mode `gcs/gcd/npa/dma`, CMP-Version) | Page-`tags` (`tagInstanceVariables` von `dataLayer`, Google Ads, OneTrust) | ✅ | Zeigt, ob und wie Consent technisch umgesetzt ist, und ist Grundlage für die Consent-Story | S | **P1** |
| 6 | Privacy-Compliance (Cookie/Tag/Request approved vs. unapproved, Request-Geolocation) | `POST reports/privacy-cookies`, `privacy-tags`, `privacy-requests[/compliance\|/locations]` | 🟡 (Geo ✅, Compliance braucht Consent-Kategorien) | Datenabfluss außerhalb der EU (z. B. US 87 Requests) als Argument für Data Governance | M | P2 |
| 7 | Web Vitals und Ladezeiten pro Seite (LCP, FCP, TTFB, CLS, Load Time, Größe, Redirects) | `POST reports/page-summary[/pages]`, `GET pages/{id}/info` | ✅ | Performance-Story (Edge Network, Event Forwarding statt clientseitiger Tags, AEM/EDS) | S | **P1** |
| 8 | Tag-Health (Ladezeit pro Tag, langsame/defekte Tags, Statuscodes) | `POST reports/tag-health[/tags\|/pages]`, Grid `TAG_DURATION` | ✅ | „Tags kosten X ms“ als Performance- und Qualitätsargument | S | P2 |
| 9 | Duplicate und Multiple Tags | `POST reports/tag-duplicates-and-multiples[/tags\|/pages]` | ✅ | Datenqualität (Doppelzählungen, z. B. 92 Duplikate Google Tag) und Implementierungsqualität | S | P2 |
| 10 | Browser-/Console-Logs (Errors, Warnings, mit verknüpftem Tag) | `POST reports/browser-logs[/messages\|/pages]`, `POST pages/{id}/console-log` | ✅ | Implementierungsfehler, z. B. ACDL doppelt geladen oder Meta-Pixel-Fehler, öffnen eine Beratungs- bzw. Implementierungs-Story | S | P2 |
| 11 | Netzwerk-Requests und Third-Party-Domains (inkl. Server-IP, Geo, Größe, Timing) | `GET request-domains`, `GET pages/{id}/request-log`, Grid `network-requests` | ✅ | Vollständige Third-Party-Landkarte; erkennt auch Tools ohne OP-Tag-Signatur | M | P2 |
| 12 | Resource-Initiators (welches Tag lädt welches Tag/Cookie) | `POST pages/{id}/initiators`, Grid `TAG_INITIATORS_*` | ✅ | Belegt Piggybacking und Tag-Chains; Argument für serverseitiges Tagging | M | P3 |
| 13 | JavaScript-Variablen / Data Layer (`dataLayer`, `adobeDataLayer`, Storage) | `GET javascript-variables` | ✅ | ACDL-/EDDL-Reifegrad; AEM-Komponenten im ACDL belegen AEM Sites | M | P2 |
| 14 | Primary-Tag-Abdeckung (Tag fehlt auf X Seiten) | `POST reports/audit-summary/primary-tags`, `…/tags` (`pageNotPresentCount`) | ✅ | Coverage-Lücken; zeigt z. B. GA-UA noch auf 93–97 % der Seiten, also eine GA4-Sunset-Story | S | P2 |
| 15 | Audit-Scores (Gesamt, Tag Presence/Performance, Page Performance, Cookies) | `GET reports/audit-summary/scores` | ✅ | Kompakter „Health-Score“-Teaser für das UI | S | P2 |
| 16 | Accessibility (WCAG-Scores, Issues) | `GET pages/{id}/info` (`accessibilityChecksSummary`), Grid `accessibility-issues` | ✅ | AEM-Sites-/EDS-Story (WCAG 2.2 AA, European Accessibility Act) | S | P3 |
| 17 | Broken Links und Statuscodes | `POST reports/page-summary` (Status-Buckets), `GET pages/{id}/links/from_this_page`, Grid `links` | ✅ | Content-Qualität als Nebenargument für AEM | S | P3 |
| 18 | JS-Datei-Änderungen zwischen Runs | `POST reports/file-changes[/files]` | ✅ | Erkennt Re-Implementierungen (Monitoring über Zeit) | M | P3 |
| 19 | Run-Konfiguration (GPC, Consent-Actions, 3rd-Party-Cookie-Block, Location, Browser) | `GET info`, `GET /v2/web-audits/{id}` (`options.adobeAuditor`, `gpcEnabled` …) | ✅ | Pflicht-Kontext für die Interpretation der Consent-Daten (Pre- oder Post-Consent?) | S | **P1 (als Begleitinfo)** |
| 20 | Rules und Alerts | `POST reports/rule-summary`, `GET reports/alert-summary/overview` | 🟡 (keine Rules konfiguriert) | Nur sinnvoll, wenn wir eigene Rules anlegen (Schreibzugriff), daher derzeit kein Nutzen | – | P3 |
| 21 | Grid Reporting API (domänenübergreifend, gruppiert) | `POST /v3/reports/grid/{entity}` | ✅ | Ein Call statt vieler pro Run; Flotten-Analysen über alle Audits im Account | M | **P1 (Infrastruktur)** |
| 22 | Latest Runs pro Audit | `GET /v3/web-audits/latest-runs` | ✅ | Ersetzt N `/runs`-Lookups durch einen Call | S | P2 |
| 23 | Usage und Kosten (Seiten-Kontingent, Overage-Preis) | `GET /v3/usage/overview` | ✅ | Cost Guard vor jedem Opt-in-Audit-Run | S | P2 |
| 24 | Webhooks (Run fertig) | Feld `webHookUrl` im Audit-PUT/POST | 📄 (Schreibzugriff) | Ersetzt Polling; braucht aber einen Audit-Write und einen öffentlichen Endpoint | M | P3 |
| 25 | Web Journeys (Cookies/Requests/Logs pro Aktion) | `/v3/web-journeys/{id}/runs/{r}/actions/…` | 📄 | Login-/Checkout-Flows: Consent-Verhalten nach Klick | L | P3 |

## 2. Details

Alle Beispiele sind gekürzt. API-Key, ECID/MID-Werte und personenbezogene Daten wurden weggelassen.

### 2.1 Tag-Versionen (Nr. 1): stärkster neuer Upgrade-Indikator

**Grid-Abfrage pro Audit:**

```json
POST /v3/reports/grid/tags
{"columns":[{"columnId":"TAG_NAME"},{"columnId":"TAG_ACCOUNT"},{"columnId":"TAG_VERSION"},{"columnId":"TAG_DURATION"}],
 "filters":{"conditionMatchMode":"all","conditions":[
   {"operator":"integer_in","args":[2206959],"negated":false,"filteredColumn":{"columnId":"AUDIT_ID"}},
   {"operator":"integer_in","args":[1],"negated":false,"filteredColumn":{"columnId":"IS_MOST_RECENT_RUN"}},
   {"operator":"integer_in","args":[1],"negated":false,"filteredColumn":{"columnId":"IS_MOST_RECENT_PAGE_SCAN"}}]},
 "sortBy":[],"page":0,"size":100}
```

```json
"rows":[["Adobe Analytics","lazard-asset-management-prod","JS-2.27.0-LGU4",84],
        ["Adobe Launch Loader","None","",3],
        ["Google Ads Conversion Tracking","17270501652","",24], …]
```

**Gruppiert nach Domain** (wie SQL `GROUP BY`):

- Spalten mit `"groupBy":true` gruppieren; die übrigen brauchen `aggregateFunction`.
- `string_contains` erwartet `"arg"` (Singular), nicht `"args"`. Sonst kommt HTTP 400.

```json
{"columns":[{"columnId":"INITIAL_PAGE_URL_BASE_DOMAIN","groupBy":true},{"columnId":"TAG","groupBy":true},
            {"columnId":"TAG_ACCOUNT","groupBy":true},{"columnId":"TAG_VERSION","groupBy":true},
            {"aggregateFunction":"count_distinct","aggregatedColumn":{"columnId":"FINAL_PAGE_URL"}},
            {"aggregateFunction":"median","aggregatedColumn":{"columnId":"TAG_DURATION"}}],
 "filters":{"conditionMatchMode":"all","conditions":[
   {"operator":"string_contains","arg":"hollister.com","negated":false,"filteredColumn":{"columnId":"INITIAL_PAGE_URL_BASE_DOMAIN"}}, …]}}
```

```json
["hollister.com",["Google Analytics 4",940],"G-SMBG190JJ7","2",96,54]
["hollister.com",["Google Universal Analytics",119],"UA-67908405-1","1",93,25]
["hollister.com.br",["Google Universal Analytics",119],"UA-67908405-1","1",99,63]
```

Die Spalten sind Domain, Tag, Account, Version, Seitenzahl und Median-Ladezeit in ms.

**Alternative über den Run-Report** (`POST reports/variable-inventory/tag-account-variable-values`, Body `{tagId, tagAccount, variableName}`):

- AA `"tag version"` → `JS-2.27.0-LGU4`
- Target (tagId 24) `"version"` → `2.11.4`, also at.js 2.x

**Mapping auf Opportunities:**

| Befund | Opportunity |
|---|---|
| AppMeasurement (`JS-2.x`) ohne Web SDK (alloy) | Migration auf Web SDK und Edge Network, Basis für RTCDP/AJO/CJA |
| at.js 2.x | Target über Web SDK; Edge-Personalisierung (Same-Page/Next-Page) |
| GA-UA weiterhin aktiv (`TAG_VERSION` „1“) | Sunset-Story: tote Daten, Konsolidierung auf eine Analytics-Plattform (CJA) |
| Version uneinheitlich über Seiten (`tagVersionCount` > 1 in `audit-summary/primary-tags`) | Governance-Problem im Tag-Management |

**Hinweis:** Bei Tags ohne Versionssignal liefert `TAG_VERSION` einen Leerstring.

### 2.2 Launch-Build-Infos und Adobe-Footprint (Nr. 2 und 3)

`GET pages/{pageId}/tags?getInsights=true` liefert pro Tag-Instanz `tagInstanceVariables`. Gekürzte Auszüge von lazard:

```json
{"tagName":"Data Layer (_satellite)","variables":{
   "property.name":"…","buildInfo.buildDate":"2025-…","buildInfo.turbineVersion":"29.1.0",
   "environment.stage":"production","company.orgId":"1BA53F5C636ADA560A495FD5@AdobeOrg"}}
{"tagName":"Adobe Analytics","account":"lazard-asset-management-prod","variables":{
   "trackingServer":"lazardassetmanagement.sc.omtrdc.net","mcorgid":"1BA5…@AdobeOrg",
   "tag version":"JS-2.27.0-LGU4","eVar2":"…","prop1":"…","pageName":"…"}}
{"tagName":"Adobe Launch Loader","variables":{"customer_ID":"…","organization_ID":"…","property_ID":"…"}}
{"tagName":"Adobe Extensions","variables":{"type":"AppMeasurement"}}
```

Accountweit liefert `POST reports/variable-inventory` 421 eindeutige Variablen. `…/tag-account-variables` zeigt pro Tag/Account alle Variablen mit Friendly Name (z. B. `"Evar 02"`).

**Nutzen:**

- Die IMS-Org-ID macht einen bestehenden Adobe-Kunden eindeutig. Abgleich mit CRM/Dynamics ist möglich, ohne Namen zu raten.
- Report Suite und Anzahl genutzter eVars/props zeigen die Analytics-Reife und begründen den CJA-Upsell bzw. die Migrationskomplexität.
- `buildDate` sagt, wie aktiv die Property gepflegt wird.
- `environment.stage` deckt Staging-Bibliotheken auf Produktion als Fehler auf.

**Evidence Matrix:** neue Evidenzart `op-variable` mit Konfidenz „hoch“ (Wert aus echtem Beacon).

### 2.3 Cookies inkl. Herkunft und Initiator (Nr. 4)

Grid `POST /v3/reports/grid/cookies` (Audit lazard). Spalten: Name, Domain, Party (1 = 1st, 2 = 3rd), Laufzeit in ms, Secure, SameSite (Enum), geändert während Pre-Audit-Action, nur Pre-Audit-Action, Initiator-Tag-IDs, Compliance-Status.

```json
["demdex","demdex.net",2,15552000000,1,1,1,1,[181,407],1]
["AMCV_1BA5…%40AdobeOrg","lazardassetmanagement.com",1,34560000000,0,null,1,1,[556],1]
["_evga_81ac","www.lazardassetmanagement.com",1,34560000000,1,null,1,0,[1111],1]
["OptanonConsent","lazardassetmanagement.com",1,31536000000,0,2,1,0,[1206],1]
["AWSALBTGCORS","…us-5.evergage.com",2,604800000,1,1,1,0,[1113],1]
["IDE","doubleclick.net",2,34560000000,1,1,0, …]
```

Page-Ebene (`GET pages/{id}/cookies`) liefert zusätzlich:

- `origin.originType`: `PRE_AUDIT_ACTION`, `PAGE_LOAD` oder `ON_PAGE_ACTION`
- `origin.action`: `ADD`, `UPDATE`, `DELETE` oder `REPEAT_SET`
- Initiatoren (HTTP/APP)

Summen liefert `POST reports/cookie-inventory`: 1st/3rd-Party, nonSecure, sameSiteEmpty, Domains.

**Nutzen:**

- 3rd-Party-Cookies (doubleclick, demdex) und Laufzeiten von bis zu 400 Tagen (`34560000000` ms) sind Argumente für die Cookie-Deprecation, First-Party-Data und die AEP-Identity-Story.
- Initiator-Tag-IDs ordnen Cookies Wettbewerbern zu, z. B. Salesforce Interaction Studio/Evergage (Tag 1111/1113). Das ist Displacement-Evidenz.

**Wichtige Einschränkung:**

- Die vorhandenen EAA-Audits laufen mit Consent-Pre-Audit-Actions (`privacyConsentActions:true` in `GET info`; Cookie `OptanonAlertBoxClosed` gesetzt).
- Die Daten zeigen also in der Regel den Zustand **nach** Consent-Klick. Aussagen wie „Cookies vor Consent“ sind nur belastbar, wenn der Run ohne Consent-Action lief.
- Deshalb immer `GET info` (Nr. 19) mitlesen.
- `COOKIE_IS_PRE_AUDIT_ACTION_ONLY` und der Filter `exclude_pre_audit_action_only_cookies` helfen beim Trennen.

### 2.4 Consent-Signale (Nr. 5)

Aus Page-`tags` (`tagInstanceVariables`) von lazard, gekürzt:

```json
{"tagName":"Data Layer (dataLayer)","variables":{"event":"OneTrustGroupsUpdated","OptanonActiveGroups":",C0001,C0002,C0003,C0004,"}}
{"tagName":"Google Ads Conversion Tracking","variables":{"gcs":"G1--","gcd":"…","npa":"…","dma":"…"}}
{"tagName":"OneTrust Banner","variables":{"tag version":"202601.1.0"}}
```

**Nutzen:**

- Erkennt die CMP (OneTrust) inkl. Version und die akzeptierten Gruppen.
- Prüft, ob Google Consent Mode v2 aktiv ist: `gcs` codiert Ads/Analytics-Storage.
- Daraus entstehen Gesprächsaufhänger für die AEP-Consent-Verarbeitung (Consent-Feldgruppe, Data-Usage-Labels, Web SDK `setConsent`).
- Aufwand gering, weil die Daten im selben Call wie Nr. 2 und 3 kommen.

### 2.5 Privacy-Reports und Request-Geolocation (Nr. 6)

Folgende Reports liefern alle 200:

- `POST reports/privacy-cookies`, `privacy-tags`, `privacy-requests` (jeweils plus `/compliance`)
- `privacy-requests/locations`

Die Antworten enthalten aber durchgehend `"runHasNoConsentCategoriesAssigned": true`. Approved/unapproved funktioniert also erst, wenn im Account Consent-Kategorien gepflegt und dem Audit zugewiesen sind. Das ist ein Schreibzugriff. Die Library enthält aktuell nur eine Kategorie „Approved Consent“.

Ohne Konfiguration sofort nutzbar ist die Request-Geolocation:

```json
POST reports/privacy-requests/locations  →
{"locations":[{"requestGeo":{"countryCode":"NL","countryName":"Netherlands"},"requestCount":2},
              {"requestGeo":{"countryCode":"US","countryName":"United States"},"requestCount":87}]}
```

**Nutzen:** Der Anteil der Requests an Server außerhalb der EU ist ein Schrems-II-/Data-Governance-Argument.

### 2.6 Performance: Web Vitals, Tag-Health, Duplikate (Nr. 7–9, 14, 15)

`POST reports/page-summary` liefert unter anderem:

- `avgPageLoadTime`
- Load-Time- und Statuscode-Buckets
- `pagesWithBrokenLinks`
- `webVitals` mit Median und p75 für LCP, FCP, TTFB und CLS

`…/pages` liefert die Werte pro Seite (loadTime, size, redirectCount).

`GET pages/{id}/info` → `webVitalsSummary` enthält pro Metrik den Wert und die Schwellen pass/warn/fail.

**Achtung:** Das `pass`-Flag wirkte inkonsistent (z. B. `pass:false` bei TTFB 148 ms und CLS 0,089). Deshalb lieber selbst gegen die Google-Schwellen bewerten.

`POST reports/tag-health` (hollister):

```json
{"filteredTagLoadTimeAverage":50,"filteredSlowTagCount":0,"filteredBrokenTagCount":3,"filteredTagInstanceCount":3606,
 "tagLoadTimeDistribution":{"below500":3599,"500to1000":7,"1000to2000":0,"above2000":0},
 "tagStatusCodeDistribution":{"good":3385,"redirect":218,"broken":3}}
// …/tags: defekt = "Google reCAPTCHA Loader (DEPRECATED)" (3 Instanzen)
```

`POST reports/tag-duplicates-and-multiples` (hollister):

```json
{"filteredUniqueTagCount":29,"totalTagInstanceCount":3606,"filteredTagDuplicateCount":274,"filteredTagMultipleCount":854}
// …/tags: "Google Tag (gtag)" 92 Duplikate auf 23 Seiten
```

`POST reports/audit-summary/primary-tags` und `…/tags` liefern `pageCount` und `pageNotPresentCount`. Bei lazard ist Google UA als Primary Tag konfiguriert, kommt aber auf 0 Seiten vor. Bei hollister läuft UA noch auf 97/100 Seiten.

`GET reports/audit-summary/scores`:

```json
// hollister
{"total":{"score":53.6,"max":100},"tagPresence":{"score":14.6,"max":30},"tagPerformance":{"score":20.0,"max":20},
 "rules":{"score":0.0,"max":30},"pagePerformance":{"score":10.0,"max":10},"cookies":{"score":9.1,"max":10}}
```

**Nutzen:**

- Performance-Story: clientseitige Tag-Last reduzieren, z. B. über Web SDK und Event Forwarding.
- AEM/EDS-Story für LCP.
- Duplikate signalisieren schlechte Datenqualität, was ein CJA-/Data-Governance-Argument ist.

### 2.7 Browser-/Console-Logs (Nr. 10)

`POST reports/browser-logs/messages` liefert message, level, logCount, pageCount und relatedTag. Beispiele:

```json
lazard:    {"level":"warn","message":"Adobe Client Data Layer v2.0.2 has already been imported/initialized on this page. You may be erroneously loading it a second time.","pageCount":1}
hollister: {"level":"error","message":"[Meta Pixel] - Invalid email address for 'em' …","pageCount":98,"relatedTag":"Facebook Pixel"}
hollister: 64 Errors, 174 Warnings gesamt (u. a. Mixed Content, VIDEOJS)
```

Pro Seite gibt es `POST pages/{id}/console-log` mit Body `{"includedLevels":["error","warn"],"search":""}` sowie `…/console-log-summary`.

**Nutzen:** Konkrete, zitierfähige Implementierungsfehler sind ein Türöffner für Adobe Consulting bzw. Partner, z. B. „ACDL doppelt geladen“.

### 2.8 Netzwerk-Requests, Third-Party-Domains, Initiators (Nr. 11 und 12)

- `GET request-domains` liefert alle Request-Domains eines Runs.
- `GET pages/{id}/request-log?page=0&size=100` liefert bei lazard 95 Requests mit resourceType, method, `serverIPAddress`, statusCode, loadTime, `geoLocationInfo`, mimeType, size und `startedAtRelativeToPageNavigation`.
- `POST pages/{id}/initiators` liefert den Initiator-Baum über `harEntryIndex`.
- Im Grid stehen `TAG_INITIATORS_BY_DOMAIN` und `REQUEST_STARTED_AT_RELATIVE_TO_LOAD_EVENT` (z. B. AA −210 ms vor dem Load-Event, AEM −1144 ms).

**Nutzen:**

- Unsere eigene Fingerprint-Erkennung kann Domains abgleichen, die OP keinem Tag zuordnet. Das hilft, Lücken in der Signatur-DB zu finden.
- Tag-Chains (Launch lädt Tag X lädt Pixel Y) sind ein Argument für serverseitiges Tagging.

### 2.9 JavaScript-Variablen und Data Layer (Nr. 13)

`GET javascript-variables` (Cursor-Pagination über `lastPageId`, size 50) liefert:

- `dataLayer`, `adobeDataLayer`, `localStorage` und `sessionStorage` als vollständige Objekte.
- Bei lazard enthält `adobeDataLayer` AEM-Komponenten-Events, was AEM Sites plus ACDL belegt.

**Achtung bei Storage-Inhalten:** Sie können personenbezogene Daten enthalten. Nur Schlüssel bzw. Strukturen auswerten, keine Werte persistieren.

### 2.10 Accessibility, Links, Datei-Änderungen (Nr. 16–18)

- **Accessibility:** `GET pages/{id}/info` → `accessibilityChecksSummary` liefert für lazard wcag2a 100, wcag2aa 98,3, wcag21aa 98,4 und wcag22aa 98,5, plus Issues mit impact und successCriteria. Das Grid `accessibility-issues` ergab 11 Issues (Hinweis: `size` muss ≥ 10 sein).
- **Links:** `GET pages/{id}/links/from_this_page` (Enum `to_this_page|from_this_page`) liefert Links inkl. `outer_html`.
- **Datei-Änderungen:** `POST reports/file-changes[/files]` zeigt neue bzw. geänderte JS-Dateien mit Tag-Bezug.

### 2.11 Infrastruktur: Grid, latest-runs, Usage, Run-Kontext (Nr. 19, 21–23)

**Grid Reporting API:**

- Entities: `web-audit-runs`, `web-journey-runs`, `pages`, `cookies`, `tags`, `tag-variables` (190 Spalten), `network-requests`, `browser-logs`, `accessibility-issues`, `links`.
- Das Schema gibt es pro Entity unter `GET /v3/reports/grid/{entity}/schema`.
- `size` muss zwischen 10 und 10.000 liegen.
- Rows kommen als Arrays; manche Spalten sind numerische Enums (Party, SameSite, Compliance).
- Die Abfrage läuft über alle Audits im Account, also auch domänenbasiert ohne Audit-ID.

**`GET /v3/web-audits/latest-runs`:** liefert in einem Call das Mapping Audit → letzte Run-ID, completedAt und Domain-Info.

**`GET /v3/usage/overview`:**

```json
{"auditUsage":{"usageCount":182,"usageLimit":100000,"usagePercentage":0.18,"overLimitPrice":{"amount":0.08,"currency":"USD"},
  "currentContractTerm":{"startDateInclusive":"2026-04-15","endDateInclusive":"2027-04-14"}},"allowOverages":true}
```

Das ist die Grundlage für einen Cost Guard vor Opt-in-Runs.

**Run-Kontext:**

- `GET info` liefert Browser, `gpcEnabled`, `privacyConsentActions`, `blockThirdPartyCookies`, `urlsScanned`, `runDuration` und `locationId`.
- `GET /v2/web-audits/{id}` liefert `options.adobeAuditor`. Bei allen geprüften Audits ist der Wert `false`; eine separate Adobe-Auditor-Ausgabe gibt es in der API nicht.

**Rate Limits:** 100–600 Requests pro Minute pro Key (einige Endpoints 1.000). Bei 429 erneut versuchen; Retries werden nicht berechnet.

### 2.12 Nicht verifiziert bzw. bewusst nicht genutzt (Nr. 20, 24, 25)

- **Rules/Alerts:** Die Endpoints liefern 200, sind aber leer. Nutzen hätten sie nur mit eigenen Rules, die Schreibzugriffe erfordern.
- **Webhooks:** Payload `{itemId, itemType:"audit"|"web-journey", runId}`. Die Konfiguration erfordert einen Audit-Write; das ist erst mit Bestätigung sinnvoll.
- **Web Journeys:** Laut Spec gibt es Cookies, Requests und Logs pro Aktion sowie eine „Cookie Origin Story“. Das wurde nicht getestet, weil keine passende Journey im Account geprüft wurde.
- **Offizieller ObservePoint-MCP-Server:** im Help Center dokumentiert. Er ist eine Option für Ad-hoc-Analysen im Chat, aber kein Ersatz für die Backend-Integration.

## 3. Empfohlene nächste Schritte (Top 5)

1. **Versions- und Build-Signale in die Evidence Matrix.**
   - Pro Domain eine gruppierte Grid-Abfrage (`TAG`, `TAG_ACCOUNT`, `TAG_VERSION`; Filter `INITIAL_PAGE_URL_BASE_DOMAIN` plus `IS_MOST_RECENT_*`) und für Launch-Infos zusätzlich Page-`tags?getInsights=true`.
   - Daraus Insights wie „AppMeasurement JS-2.27 / at.js 2.11 → Web-SDK-Migration“ und „GA-UA noch aktiv → Konsolidierung“.
   - Aufwand S–M.
2. **Adobe-Footprint-Evidenz.** IMS-Org-ID, Report Suite, trackingServer, Launch-Property und eVar-Anzahl als neue Evidenzart `op-variable` mit hoher Konfidenz. Damit wird ein Bestandskunde eindeutig erkannt und Upsell-Logik (CJA, RTCDP) möglich. Aufwand M.
3. **Privacy-/Consent-Karte.**
   - Inhalte: Cookies mit Party, Laufzeit, Initiator-Tag und Origin; CMP und Version; Google-Consent-Mode-Werte; Request-Geos außerhalb der EU.
   - Immer zusammen mit dem Run-Kontext aus `GET info`, damit wir nicht fälschlich „vor Consent“ behaupten.
   - Ergibt die Story „AEP Consent und Data Governance“. Aufwand M.
4. **Performance- und Qualitäts-Insights.**
   - Daten: Web Vitals (p75), Tag-Health (langsame/defekte Tags), Duplicates/Multiples und die Top-Console-Errors mit Tag-Bezug.
   - Das sind fertig aggregierte Run-Reports, also wenige Calls.
   - Ergibt die Stories Edge Network/Event Forwarding, AEM/EDS und Implementierungsqualität. Aufwand S.
5. **Client-Infrastruktur.**
   - `latest-runs` statt Run-Lookups pro Audit.
   - Grid-API-Wrapper (Paging, Enum-Mapping, `arg` vs. `args`).
   - `usage/overview` als Cost Guard vor Opt-in-Runs.
   - 429-Retry gemäß Rate-Limit-Doku.
   - Webhooks erst später und mit Freigabe, da Audit-Write.
   - Aufwand S–M.

Ergänzt `docs/observepoint-integration-plan.md`, Abschnitt 5 („Sinnvolle Ergänzungen“).
