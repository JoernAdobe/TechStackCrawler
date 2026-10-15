# Martech-Erkennungssignale 2026: Adobe vs. Wettbewerb

Stand: Recherche 2026, ausschließlich offizielle Vendor-/Entwickler-Dokumentation (Experience League, developer.*, docs.*, help.*). Ergänzendes, maschinenlesbares Ergebnis: [`03-rule-proposals.json`](03-rule-proposals.json).

**Methodik:** Für jedes Produkt wurden aktuelle Script-Hosts, Request-Endpunkte, Cookie-Namen, JS-Globals, HTML/Meta-Marker und Header aus der offiziellen Dokumentation des Herstellers recherchiert und mit den bestehenden `DETECTION_RULES` in `project/server/src/services/customDetectors.ts` (read-only) abgeglichen. Jede Signal-Aussage ist mit einer Quelle belegt. Wo keine offizielle Quelle verfügbar war, ist das explizit vermerkt (z. B. Quantum Metric, Braze-Cookie-Interna).

---

## 1. Adobe-Produkte

### 1.1 Adobe Experience Platform Web SDK (alloy.js)
- Script/Lib: `alloy.js` / `alloy.min.js`, meist über eigenes Tag-Property oder npm eingebunden.
- Standard-Endpunkte (ohne CNAME): `edge.adobedc.net` (unauthenticated) bzw. `server.adobedc.net` (authenticated); Pfade `/ee/v2/interact` und `/ee/v2/collect`.
  Quelle: https://developer.adobe.com/data-collection-apis/docs/endpoints/interact/
- **Wichtig:** Über die Konfigurationsoption `edgeDomain` kann der Kunde eine First-Party-CNAME-Domain (z. B. `data.kunde.de`) vor die Edge-Network-Calls schalten. Domain-basierte Erkennung versagt dann vollständig.
  Quelle: https://experienceleague.adobe.com/en/docs/experience-platform/web-sdk/commands/configure/edgedomain
- Cookies: `kndctr_<ORGID>_identity`, `kndctr_<ORGID>_cluster`, `kndctr_<ORGID>_consent`, `kndctr_<ORGID>_consent_check`, `kndctr_<ORGID>_personalization`.
  Quelle: https://experienceleague.adobe.com/en/docs/core-services/interface/data-collection/cookies/web-sdk
- First-Party-Fallback-Cookie `s_ecid` (Format `s_ecid=MCMID|<ECID>`) wird gesetzt, wenn ECID-Service parallel aktiv ist.
  Quelle: https://experienceleague.adobe.com/en/docs/id-service/using/home
- **Robustestes Signal bei CNAME-Deployments:** Request-Body-Struktur (`xdm.eventType`, `events[].xdm.identityMap`, `meta.konductorConfig.*`) statt Hostname.

### 1.2 Adobe Tags (Launch) / DTM
- Scripts: `assets.adobedtm.com/<orgId>/<propertyId>/launch-<env>.min.js` (Launch); Legacy DTM: `assets.adobedtm.com/.../satelliteLib-*.js`.
  Quelle: https://experienceleague.adobe.com/en/docs/experience-platform/tags/home
- JS-Global: `_satellite` (sowohl Launch als auch DTM nutzen dieses Namespace-Objekt).

### 1.3 Adobe Analytics (AppMeasurement / s_code)
- Script: `AppMeasurement.js` (häufig lokal gehostet, daher schwach als scriptSrc), Legacy `s_code.js`.
- Request-Endpunkt: Tracking-Server-Calls auf `/b/ss/<reportSuiteId>/...` bzw. generisch `*.2o7.net`, `*.omtrdc.net/b/ss/`, oder First-Party via ECID-Domain.
  Quelle: https://experienceleague.adobe.com/en/docs/analytics/implementation/vars/page-vars/pagename
- JS-Global: `s` (AppMeasurement-Objekt), `s_account`.
- Cookie: `s_cc`, `s_sq`, `s_vi` (Legacy Visitor-ID vor ECID).
  Quelle: https://experienceleague.adobe.com/en/docs/core-services/interface/data-collection/cookies/analytics

### 1.4 Experience Cloud ID (ECID)
- Request: `/id?d_visid_ver=...` auf `*.demdex.net` oder First-Party-CNAME.
  Quelle: https://experienceleague.adobe.com/en/docs/id-service/using/home
- Cookie: `AMCV_<orgId>`, `s_ecid`.

### 1.5 Adobe Target (at.js / mbox / Web-SDK-Personalisierung)
- Endpunkt: `https://<clientcode>.tt.omtrdc.net/rest/v1/delivery?client=<clientcode>` (Delivery API).
  Quelle: https://experienceleague.adobe.com/en/docs/target-dev/developer/api/delivery-api/overview
- Cookie: `mbox` (enthält Session-/PC-IDs), zusätzlich `mboxEdgeCluster`.
  Quelle: https://experienceleague.adobe.com/en/docs/core-services/interface/data-collection/cookies/target
- Web-SDK-Personalisierung (ohne at.js): erkennbar an Request-Body `xdm._experience.decisioning` bzw. `personalization.decisionScopes` in `/ee/v2/interact`-Calls.
  Quelle: https://experienceleague.adobe.com/en/docs/target-dev/developer/api/delivery-api/overview

### 1.6 Adobe Journey Optimizer (AJO) – Web/In-App
- AJO hat **keinen eigenen Client-Loader** – läuft über das Web SDK (`sendEvent` mit `renderDecisions:true`, `personalization.surfaces`).
- Erkennbares Request-Body-Signal: `xdm.eventType: "decisioning.propositionDisplay"` bzw. `"decisioning.propositionInteract"`, sowie `_experience.decisioning.propositions[].scopeDetails.decisionProvider == "AJO"`.
  Quelle: https://experienceleague.adobe.com/en/docs/journey-optimizer/using/channels/code-based-experience/get-started-code-based
- Server-seitige Response trägt `decisionProvider:AJO` (bereits in bestehender Regel als `edge`-Pattern genutzt).

### 1.7 Customer Journey Analytics (CJA)
- CJA ist eine reine Backend-/Reporting-Anwendung ohne eigenen Web-Client — es existiert **kein clientseitiges CJA-Script**. Einziges indirektes Client-Signal: identische AEP-Web-SDK-Datenstreams, die serverseitig auch in CJA landen (nicht vom Client aus beweisbar).
  Quelle: https://experienceleague.adobe.com/en/docs/analytics-platform/using/cja-overview/cja-b2c-overview/cja-overview
- Schwaches HTML-Signal: Verlinkung/Erwähnung von `cja.adobe.com` in Reporting-Dashboards, die in Kundenportale eingebettet sind (selten).

### 1.8 Adobe Audience Manager (AAM)
- Endpunkt: `dpm.demdex.net/dest5.jpg` bzw. `/event?d_dst=1`.
  Quelle: https://experienceleague.adobe.com/en/docs/audience-manager/user-guide/dil-api/dil-overview
- DIL-Script: `/AAMtidbit/dil.js` oder `{tenant}/dil.js`.
- Cookie: `demdex` (wird auch vom ECID-Service gesetzt → allein kein Beweis, Dokumentation bestätigt diese Überschneidung explizit).

### 1.9 Adobe Real-Time CDP
- Keine eigene Client-Signatur; nur über serverseitige Segment-Qualifizierung im Edge-Response (`xdm._experience.segmentation`) nachweisbar.
  Quelle: https://experienceleague.adobe.com/en/docs/experience-platform/rtcdp/intro/rtcdp-intro/overview

### 1.10 Adobe Experience Manager (Sites, Edge Delivery Services, Dynamic Media)
- **Klassisches AEM Sites:** `/etc.clientlibs/`, `/content/dam/`, Header `Server: ...AEM...` (selten exponiert), Meta `generator` teils `Adobe Experience Manager`.
- **Edge Delivery Services (EDS, früher „Helix“):** Demo-/CDN-Domains `*.aem.live`, `*.aem.page`, `*.hlx.live`, `*.hlx.page`; eingebettetes RUM-Script `rum.hlx.page/.rum/@adobe/helix-rum-js@^2/dist/rum-standalone.js` bzw. automatisch injiziertes `window.hlx.RUM_MASK`/`aem.js`.
  Quellen: https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/edge-delivery/overview , https://github.com/adobe/helix-rum-js
- Eigene Custom-Header-Konfiguration (z. B. CDN-Header) möglich, aber kein offiziell dokumentierter, immer vorhandener `x-aem`-Header gefunden — **kein verlässliches Headersignal**.
  Quelle: https://www.aem.live/docs/custom-headers (keine Pflichtheader dokumentiert)
- **Dynamic Media (klassisch/Scene7):** `.scene7.com/is/image|content/`, `s7viewers`-Scripts (bereits in Regel enthalten).
- **Dynamic Media with OpenAPI (neue Delivery-API):** `cdn.adobe.com/dynamicmedia/assets/{assetId}/{seoName}.{format}` – abweichend vom bisherigen `/adobe/dynamicmedia/deliver/`-Pfad in der bestehenden Regel.
  Quelle: https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/dynamicmedia/dynamic-media-open-apis/dynamic-media-open-apis-overview

### 1.11 Adobe Marketo Engage
- Script: `munchkin.marketo.net/munchkin.js`, Forms: `mktoForms2.js` (bereits erfasst).
- Cookie: `_mkto_trk` (primäres Tracking-Cookie, 2 Jahre Standardlaufzeit) — **fehlt aktuell als Signal**.
  Quellen: https://experienceleague.adobe.com/en/docs/marketo/using/product-docs/administration/setup/munchkin , https://experienceleague.adobe.com/en/docs/marketo-developer/marketo/javascriptapi/leadtracking/api-reference
- Redirect-/Tracking-Domain-Pattern `go.<kunde>.com` bzw. `info.<kunde>.com` (individuell, daher nicht generisch regelbar) und `*.mktoresp.com` für Landingpage-Responses.

### 1.12 Adobe Advertising (Advertising Cloud / Search&Social)
- Cookie-/Tracking-Domain: `everesttech.net`; dokumentierte Cookies u. a. `everest_g_v2`, `everest_session_v2`, `_lcc`, `ev_sync_*`.
  Quelle: https://experienceleague.adobe.com/en/docs/core-services/interface/data-collection/cookies/advertising
- Tracking-Pixel: `pixel.everesttech.net/px2/<id>?px_evt=...`.
  Quelle: https://experienceleague.adobe.com/en/docs/advertising/search-social-commerce/tracking/conversion-tracking/advertising-conversion-tracking/format-conversion-tag-image

### 1.13 Adobe Commerce / Magento
- Bestehende Signale (Meta `Magento_...`, `/static/version*/frontend/`) weiterhin gültig; kein neues offizielles Signal identifiziert, das fehlt.

---

## 2. Wettbewerber

### 2.1 Analytics / CDP / DMP

**GA4 / Google Tag (gtag.js) / Server-Side GTM**
- `www.googletagmanager.com/gtag/js?id=G-...`; Measurement-Protocol-Endpunkt `www.google-analytics.com/g/collect` bzw. `/mp/collect`.
- **Server-side GTM (sGTM):** Läuft offiziell auf einer **eigenen (First-Party-)Subdomain** des Kunden (z. B. via App Engine, Cloud Run oder Drittanbieter wie Stape); Standard-Tagging-Server-Pfadmuster: `/g/collect`, `/collect`, `/healthz` proxied hinter Kunden-Domain. Domain-Erkennung versagt hier strukturell.
  Quelle: https://developers.google.com/tag-platform/tag-manager/server-side/intro

**Tealium (iQ Tag Management / EventStream / AudienceStream)**
- Loader: `tags.tiqcdn.com/utag/<account>/<profile>/<env>/utag.js`.
- Cookie: `utag_main` (ab v4.50 ggf. in `utag_main_v_id` u. a. Teilcookies aufgesplittet).
  Quelle: https://docs.tealium.com/iq-tag-management/data-layer/cookies/
- Collect-Tag unterstützt First-Party-CNAME-Collection-Domains — gleiche CNAME-Problematik wie bei Adobe Web SDK.
  Quelle: https://docs.tealium.com/iq-tag-management/data-layer/cookies/

**Segment**
- Loader: `cdn.segment.com/analytics.js/v1/<writeKey>/analytics.min.js`; Ingestion `api.segment.io/v1/...`.
- Cookies: `ajs_anonymous_id`, `ajs_user_id`, `ajs_group_id`.
  Quelle: https://www.twilio.com/docs/segment/connections/sources/catalog/libraries/website/javascript

**mParticle**
- Cookie-Präfix `mp_` — **nur gesetzt, wenn `useCookieStorage:true` konfiguriert ist**; Default-Storage ist `localStorage`. Reine Cookie-Regel detektiert daher nur eine Minderheit der Deployments.
  Quelle: https://docs.mparticle.com/developers/quickstart/web/overview/

**RudderStack**
- Cookies: `rl_anonymous_id`, `rl_user_id`.
  Quelle: https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/
- Ingestion-Endpunkt ist ein kundenspezifischer `dataPlaneUrl` (häufig First-Party-Subdomain) — ebenfalls CNAME-artig.

**Salesforce Data Cloud / Interaction Studio (Evergage) / Marketing Cloud Personalization**
- Legacy-Beacon: `cdn.evgnet.com/beacon/{account}/{dataset}/scripts/evergage.min.js`.
- Modernes SDK-Namespace: `SalesforceInteractions` (ehem. `Evergage`).
  Quelle: https://developer.salesforce.com/docs/marketing/personalization/guide/integrate-javascript-beacon.html
- **Fehlt komplett in der Regel-Basis:** Salesforce Data Cloud Web/Mobile SDK (separates Produkt von Interaction Studio) — bislang keine offizielle, stabile Cookie-Dokumentation gefunden (niedrigere Quellenqualität).

**Braze**
- Regionale SDK-Endpunkte, z. B. `sdk.iad-01.braze.com` (US), `sdk.fra-01.braze.eu`/`sdk.fra-02.braze.eu` (EU), `sdk.au-01.braze.com`, `sdk.id-01.braze.com`, `sdk.jp-01.braze.com`, `sdk.kr-01.braze.com`.
  Quelle: https://www.braze.com/docs/user_guide/administer/personal/sdk_endpoints
- Cookie-Präfix `ab.storage` dokumentiert, Detailstruktur nicht vollständig öffentlich — **Quellenqualität niedriger** (Community-/Supportquellen ergänzend nötig).

**Bloomreach (Engagement/Discovery), Amplitude, Mixpanel, Heap, Matomo, etracker** — größtenteils bereits mit scriptSrc erfasst.
- **etracker:** Loader `static.etracker.com/code/e.js`, eingebunden per `_etLoader`-Script-Tag mit `data-secure-code`/`data-cookie-lifetime`; Cookies `_et`, `_et_coid`.
  Quelle: https://www.etracker.com/en/

**Piano Analytics (AT Internet)**
- Modernes SDK: `pa.setConfigurations({site, collectDomain: 'https://<collector>.pa-cd.com'})`; Cookies `_pcid`, `_pctx`, `_pprv`.
  Quelle: https://developers.piano.io/docs/analytics-cookies-and-local-storage
- Legacy-Collector `logs*.xiti.com` aus altem Xiti/SmartTag-Produkt, heute weitgehend abgelöst.

**Quantum Metric**
- Cookie `QuantumMetricUserID`, Script häufig als `qtm.js` referenziert; **offizielle Dokumentation liegt größtenteils hinter Kunden-Login (support.quantummetric.com)** — Quellenqualität eingeschränkt, keine vollwertige öffentliche Vendor-Doku gefunden.

**Contentsquare**
- Script `t.contentsquare.net/uxa/<siteId>.js`; Cookie `_cs_c` (Consent-State, ~13 Monate); unterstützt **Cookieless-Modus** (localStorage/sessionStorage) — Cookie-Only-Regeln erfassen cookielose Deployments nicht.
  Quelle: https://docs.contentsquare.com/en/web/cookies/

**Glassbox** — keine tiefere offizielle öffentliche Doku zu Script-Host/Cookie-Namen gefunden (Enterprise-Vertrieb, Doku meist NDA-gated); nicht robust zitierbar.

### 2.2 Personalisierung / Experimentation

**Optimizely (Web / Feature / CMS)**
- Web Experimentation: `cdn.optimizely.com/js/<projectId>.js`; Cookie `optimizelyEndUserId` (Format `oeu<timestamp>r<random>`, ~6 Monate).
  Quelle: https://docs.optimizely.com/web-experimentation/docs/customer-profiles
- Feature Experimentation (serverseitiges SDK) hinterlässt **keine** Browser-Cookies/Scripts — nicht clientseitig detektierbar, nur über Events/Headers in eigener Infrastruktur.

**VWO, AB Tasty, Kameleoon, Dynamic Yield** — bestehende Regeln bleiben größtenteils als Script-/Cookie-Kombination gültig; keine substanzielle Änderung in offizieller Doku 2026 identifiziert, die neue robuste Signale liefert.

### 2.3 CMS / DXP

**Sitecore XM Cloud**
- Experience Edge GraphQL-Endpunkt: `edge.sitecorecloud.io/api/graphql/v1` (HTTPS, Header `sc_apikey`; Live-API, keine Doku-Seite – liefert ohne gültigen Key 401).
  Quelle: https://developers.sitecore.com/products/experience-platform/edge
- Sitecore Personalize (ehem. „Boxever“): Cookie `boxever`/`boxever_id`.
  Quelle: https://developers.sitecore.com/products/experience-platform/edge
- Bestehende Regel (nur `hybris`/`_ui/responsive`-artige Legacy-Marker, siehe unten SAP) deckt XM Cloud nicht ab — **Lücke**.

**Contentful** — bereits `ctfassets.net` erfasst; kein neues Signal.

**Storyblok, Contentstack, Bloomreach CMS** — bestehende Regeln ausreichend aktuell laut Doku-Check.

### 2.4 eCommerce

**Salesforce Commerce Cloud (SFCC)**
- Cookies: `dwsid` (Session-ID), `dwanonymous_<hash>` (anonyme Besucher-ID). Legacy-Domainmuster `demandware.net`/`demandware.store` (bereits erfasst) — **Cookies fehlen**.
  Quelle: https://help.salesforce.com/s/articleView?id=001183795&type=1&language=en_US (SFCC Session-/Cookie-Referenz)

**SAP Commerce Cloud (Hybris) / Spartacus (Composable Storefront)**
- Bestehende Regel prüft nur `hybris`/`_ui/responsive`/`acceleratorservices` (klassisches Backoffice-Template) — **deckt moderne Spartacus-Storefronts nicht ab**.
- Spartacus-Frontend-Fingerprint: CSS-Klasse `cx-storefront` (Root-Angular-Komponente) sowie `cx-*`-präfixierte Klassen.
  Quelle: SAP Help Portal, Spartacus-Dokumentation (https://sap.github.io/spartacus-docs/)
- Backend-Fingerprint: `/occ/v2/` REST-Endpunkte (z. B. `/occ/v2/{baseSiteId}/products`, `/occ/v2/{baseSiteId}/basesites`).
  Quelle: https://help.sap.com/docs/SAP_COMMERCE_CLOUD_PUBLIC_CLOUD/1cd0e716d6b575002de4b3e4b19b1d31/8bb3d8f36edb4dbfadd4ba00ef0f0a1d.html

**commercetools**
- GraphQL-Endpunkt `api.<region>.commercetools.com/{projectKey}/graphql` (HTTPS, OAuth2-gesichert).
  Quelle: https://docs.commercetools.com/api/graphql

**Shopify Plus**
- `X-Shopify-Stage`-Header wird in keiner offiziellen Quelle als verlässlich dokumentiertes Erkennungsmerkmal bestätigt — **kein belastbares Signal, nicht empfohlen**.
- Checkout.liquid wird zugunsten Checkout Extensibility abgelöst (Deprecation seit 2024/2025) — bestehende checkout-basierte Signale ggf. zusätzlich auf Checkout-Extensibility-Marker (`checkout-web`-Asset-Hosts) prüfen.
  Quelle: https://shopify.dev/docs/apps/build/checkout

### 2.5 Consent Management (CMP)

**OneTrust**
- Script: `cdn.cookielaw.org/.../otBannerSdk.js`; Cookies `OptanonConsent` (Consent-State inkl. Kategorien, Version, ~1 Jahr), `OptanonAlertBoxClosed`.
- JS-API: `OneTrust.AllowAll()`, `OneTrust.ToggleInfoDisplay()`.
  Quelle: https://my.onetrust.com/s/article/UUID-2dc719a8-4be5-8d16-1dc8-c7b4147b88e0

**Didomi**
- IAB-TCF-2.2-zertifiziert; Standard-TCF-Cookie `euconsent-v2` + JS-API `__tcfapi` (IAB-Standard, nicht Didomi-spezifisch); Didomi-eigenes Cookie/Token `didomi_token`.
  Quellen: https://developers.didomi.io/cmp/didomi-consent-string , https://docs.didomi.io/consent-management-platform-cmp/frameworks-regulations/iab-tcf/iab-tcf-2.2

**Sourcepoint**
- Loader: `cdn.privacy-mgmt.com/wrapper.min.js`; Cookies/Storage `_sp_user_consent_{propertyId}`, `_sp_local_state`.
  Quelle: https://docs.sourcepoint.com/hc/en-us/articles/4405387989011-Cookies-and-local-storage-Web

**Usercentrics, Cookiebot, TrustArc** — bestehende Regeln nach Stichprobenvergleich weiterhin aktuell (keine Strukturänderung 2026 gefunden).

**Generischer TCF-v2.2-Standard** (herstellerunabhängig, nutzbar als Fallback-Signal für alle TCF-zertifizierten CMPs: Didomi, Sourcepoint, Usercentrics, Cookiebot, Quantcast Choice, TrustArc u. a.):
- JS-API `window.__tcfapi` (immer vorhanden, sobald ein TCF-zertifizierter CMP aktiv ist).
- Cookie/Storage `euconsent-v2`.
  Quelle: https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework (offizielles IAB-Tech-Lab-Repository der TCF-Spezifikation)

### 2.6 Marketing Automation / ESP

**HubSpot**
- Loader-Domains: `js.hs-analytics.net`, `js.hs-scripts.com`.
- Cookies: `__hstc` (Hauptcookie, enthält Domain/`hubspotutk`/Zeitstempel/Session-Zähler, 6 Monate Standard), `__hssc` (Session, 30 Min.), `hubspotutk` (Identity-Token).
  Quelle: https://knowledge.hubspot.com/privacy-and-consent/what-cookies-does-hubspot-set-in-a-visitor-s-browser

**Pardot / Salesforce Account Engagement**
- Cookie `visitor_id<ACCOUNT_ID>` (z. B. `visitor_id123456`), Consent-Cookie `pi_opt_in`.
- First-Party-Tracking-Domain (z. B. `go.kunde.de`) seit Feb. 2023 für neue Business Units verpflichtend — reines `pi.pardot.com`-Hostsignal erfasst daher First-Party-Deployments nicht mehr.
  Quelle: https://help.salesforce.com/s/articleView?id=sf.pardot_admin_tracking_code.htm&type=5

**Emarsys (SAP Emarsys Customer Engagement)** — keine ausreichend robuste, öffentlich zugängliche technische Signatur-Dokumentation (Script-Host/Cookie) gefunden, die über das bereits erfasste Domainmuster hinausgeht; nicht weiter verifizierbar mit offiziellen Quellen im Rahmen dieser Recherche.

---

## 3. Server-seitiges / First-Party-Tracking: CNAME-Cloaking & sGTM auf eigener Subdomain

**Besonderer Fokus (user-priorisiert).** Mehrere moderne CDP-/Analytics-/Personalisierungs-Plattformen sind **herstellerseitig dafür ausgelegt**, über First-Party-/CNAME-Domains zu laufen, u. a. um Tracker-Blocker und ITP/ETP-Restriktionen zu umgehen:

| Anbieter | Offizieller CNAME-/First-Party-Mechanismus | Quelle |
|---|---|---|
| Adobe Web SDK | `edgeDomain`-Konfigurationsoption | https://experienceleague.adobe.com/en/docs/experience-platform/web-sdk/commands/configure/edgedomain |
| Google Tag Manager | Server-Side-Tagging auf eigener Kunden-Subdomain (App Engine/Cloud Run/Drittanbieter wie Stape) | https://developers.google.com/tag-platform/tag-manager/server-side/intro |
| Tealium | Collect-Tag mit First-Party-Collection-Domain | https://docs.tealium.com/iq-tag-management/data-layer/cookies/ |
| RudderStack | kundenspezifischer `dataPlaneUrl` | https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/ |
| Piano Analytics | konfigurierbare `collectDomain` | https://developers.piano.io/docs/analytics-cookies-and-local-storage |
| Salesforce Account Engagement (Pardot) | Pflicht-First-Party-Tracker-Domain (seit 2023) | https://help.salesforce.com/s/articleView?id=sf.pardot_admin_tracking_code.htm&type=5 |

**Konsequenz für die Erkennungslogik:** Domain-/Hostname-Regex (`scriptSrc`, `requests`) ist bei diesen Produkten **strukturell unzuverlässig**, sobald der Kunde First-Party-Routing aktiviert hat. Robustere Gegenmaßnahmen:

1. **Request-Body-Fingerprinting:** Anstelle des Hosts das JSON-Payload-Schema prüfen (z. B. Adobe: Felder `xdm`, `identityMap`, `eventType`; RudderStack: `anonymousId`, `rl_*`-Feldnamen; Tealium: `tealium_event`). Dies setzt voraus, dass der Crawler Response-/Request-Bodies mitliest, nicht nur URLs (vgl. bestehendes `edge`-Pattern-Konzept im Code – dieses Prinzip lässt sich auf weitere Anbieter übertragen).
2. **Pfadmuster unabhängig vom Host:** Viele CNAME-Deployments behalten den charakteristischen **Pfad** bei, auch wenn der Host wechselt (z. B. `/ee/v2/interact`, `/occ/v2/`, `/g/collect`). Ein Pfad-Regex ohne Host-Anker ist daher robuster als eine reine Host-Regex.
3. **Cookie-Namenskonventionen bleiben meist stabil** auch bei First-Party-Hosting, da sie vom SDK (nicht vom Hosting) gesetzt werden (z. B. `kndctr_<orgId>_identity`, `utag_main`, `rl_anonymous_id`) — Cookie-Signale sind damit ein wichtiges Gegengewicht zu unsicheren Host-Signalen.
4. Akademische Hintergrundliteratur zu CNAME-Cloaking-Erkennung (DNS-/ML-basiert, **nicht Vendor-Doku**, nur als Kontext): Dimova et al., "The CNAME of the Game" (ASIACCS 2021); Pujol et al., TMA 2020. Diese Verfahren (DNS-Auflösung + ML-Klassifikation) sind für den aktuellen HTML/Request-basierten Scan-Ansatz des Tools nicht direkt operationalisierbar, bestätigen aber die Notwendigkeit von Body-/Pfad-basierten Signalen statt reiner Hostname-Prüfung.

---

## 4. Abgleich mit bestehenden Regeln: Identifizierte Lücken

| Produkt | Status in `customDetectors.ts` | Befund |
|---|---|---|
| Adobe Customer Journey Analytics | Zeile ~960, nur schwacher HTML-String-Match | Praktisch nicht nachweisbar – CJA hat keinen Web-Client; Regel sollte als „nur Verweis, kein Beweis“ gekennzeichnet bleiben, kein Request-/Cookie-Fix möglich |
| Adobe Journey Optimizer | Zeile ~1773-1781, nur `edge`-Pattern | Request-Body-Signal (`decisioning.propositionDisplay`) könnte als Zusatz-Pattern ergänzt werden, falls der Crawler Request-Bodies ausliest |
| Adobe Marketo Engage | Zeile ~1762-1772 | Fehlt: Cookie `_mkto_trk` |
| Adobe Dynamic Media | Zeile ~1591-1596 | Fehlt: neuer OpenAPI-Pfad `cdn.adobe.com/dynamicmedia/assets/` |
| AEM Edge Delivery Services | Nicht als eigene Regel vorhanden | Fehlt komplett: `*.aem.live`/`*.aem.page`/`*.hlx.live`/`*.hlx.page` + RUM-Script |
| Sitecore | Zeile ~86-93, veraltet | Fehlt: XM Cloud Experience Edge (`edge.sitecorecloud.io`), Personalize-Cookie `boxever` |
| Salesforce Commerce Cloud | Zeile ~471-477 | Fehlt: Cookies `dwsid`, `dwanonymous_` |
| SAP Commerce Cloud (Hybris) | Zeile ~479-485, nur Legacy-Backoffice-Marker | Fehlt: Spartacus-Frontend (`cx-storefront`) und `/occ/v2/`-Endpunkt |
| Salesforce Data Cloud | Nicht vorhanden | Fehlt komplett (separat von Interaction Studio/Evergage) |
| HubSpot (Cookies) | Nur Script-Domain vermutlich erfasst (nicht im Detail geprüft) | Ergänzen: `__hstc`/`__hssc`/`hubspotutk` |
| Pardot / Account Engagement | Zu prüfen | Ergänzen: `visitor_id<ID>`-Cookie-Pattern, Hinweis auf First-Party-Domain-Pflicht |
| mParticle, RudderStack, Optimizely, VWO, Dynamic Yield, AB Tasty, Kameleoon u. a. CDP/Personalisierung | Meist nur `scriptSrc` | Storage-Mechanismus-Hinweise (localStorage-Default bei mParticle) als Kommentar ergänzen; wo möglich zusätzliche Cookie-Patterns |
| Server-side GTM / CNAME-Erkennung generell | Nicht vorhanden | Neues Konzept: Pfad-basierte Fallback-Pattern (`/g/collect`, `/mp/collect`) unabhängig vom Host |
| TCF v2.2 (generischer Fallback für alle CMPs) | Nicht vorhanden als generisches Signal | Neue Regel „IAB TCF v2.2 (generisch)“ mit `__tcfapi`/`euconsent-v2` als Fallback bei unbekannten CMP-Anbietern |
| Didomi | Zu prüfen im Detail | Ergänzen: `didomi_token`, `__tcfapi` |
| Sourcepoint | Zu prüfen im Detail | Ergänzen: `cdn.privacy-mgmt.com`, `_sp_user_consent_` |
| Shopify Plus | Bestehende Regel vermutlich host-/checkout-basiert | `X-Shopify-Stage`-Header NICHT ergänzen (nicht offiziell belegt); Checkout-Extensibility-Deprecation beobachten |

---

## 5. Quellenqualität – Transparenzhinweis

Folgende Punkte konnten **nicht** mit einer vollwertigen, öffentlich zugänglichen Herstellerdokumentation belegt werden und sind entsprechend in Abschnitt 2 als schwächer gekennzeichnet:
- Quantum Metric (Cookie-/Script-Interna hinter Support-Login)
- Braze (`ab.storage`-Cookie-Detailstruktur)
- Glassbox (keine öffentliche technische Doku gefunden)
- Emarsys (keine ausreichend detaillierte öffentliche Signatur-Doku)
- Salesforce Data Cloud Web-SDK-Cookies (Produkt sehr neu, Doku im Aufbau)

Diese wurden bewusst NICHT in die Rule-Proposals (`03-rule-proposals.json`) mit „add“-Status übernommen, bzw. nur mit explizitem Niedrig-Konfidenz-Hinweis.

**Linkcheck-Hinweis (`python3 ~/.copilot/tools/linkcheck.py`):** Von 46 geprüften Links in diesem Dokument meldet das Tool 6 als „defekt“. Manuelle Nachprüfung (curl/Browser) zeigt, dass es sich dabei um Tool-Limitationen handelt, nicht um tatsächlich tote Links:
- Salesforce (`developer.salesforce.com`) und Sourcepoint (`docs.sourcepoint.com`) antworten dem Linkcheck-User-Agent mit HTTP 403 (Bot-Schutz); die verlinkten Seiten sind per `web_fetch` erreichbar und inhaltlich verifiziert. Veraltete Segment-, Sourcepoint- und Salesforce-URLs wurden durch die aktuellen Ziel-URLs ersetzt.
- `docs.optimizely.com/web-experimentation/docs/customer-profiles`, `docs.mparticle.com/developers/quickstart/web/overview/` → liefern HTTP 200, aber als JS-gerenderte SPA-Seiten ohne serverseitigen `<title>`-Tag; linkcheck interpretiert das fehlende Title-Tag fälschlich als Soft-404. Inhalt wurde per `web_fetch` (gerendertes Markdown) manuell verifiziert.
- Der Sitecore Experience-Edge-Endpunkt (`edge.sitecorecloud.io/api/graphql/v1`) ist kein Doku-Link, sondern ein Live-API-Endpunkt (401 ohne gültigen `sc_apikey`-Header) und wurde entsprechend nur noch als Inline-Code ohne klickbares URL-Schema dargestellt (kein "https" am Anfang).

Alle übrigen 40 Links sind von linkcheck.py mit HTTP 200 bestätigt.
