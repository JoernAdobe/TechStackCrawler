# ObservePoint-Gap-Analyse: Welche Tags erkennen wir nicht?

Stand: Datenabzug aus dem ObservePoint-Account (nur lesende Calls). Ergänzende maschinenlesbare Vorschläge: [`02-rule-proposals.json`](02-rule-proposals.json).

## Kurzfassung

- Die **OP-Tag-Bibliothek** umfasst **1.511 Tags**. Davon ordnet unsere `canonicalNames`-Logik (`TechstackNameIndex.knows` inkl. Aliasse, Qualifier und Vendor-Only) **534** einer unserer 549 Regeln zu. **976** bleiben unbekannt (ohne „Data Layer“).
- Die **reale Verbreitung** stammt aus dem jeweils jüngsten Run aller Audits im Account: **466 Basis-Domains, 655 Audit-Runs, 4.146 Seiten**. Darin kommen **561 verschiedene Tags** vor. **316** davon kennen wir, **245** nicht.
- Auf Produkt-Ebene zusammengefasst ergeben die unbekannten Tags **68 Vorschläge**:
  - **48 neue Regeln** (inkl. HubSpot-Cookie-Banner)
  - **19 Aliasse bzw. Alias + Signal-Erweiterung** (11 reine Aliasse, 8 mit Signal-Erweiterung; die Technologie kennen wir, nur der Name oder das Signal passt nicht)
  - **1 Signal-Fix** (Nielsen)
  - dazu **7 Tags zum Ignorieren**
- Die **größten Lücken nach Häufigkeit**:
  1. Google Tag (gtag.js) auf 338 Domains (73 % des Samples)
  2. Google Fonts (212)
  3. The Trade Desk (88, Alias)
  4. X/Twitter-Conversion (49)
  5. BidSwitch (49)
  6. CloudFront (45, Alias)
  7. Yahoo DOT (41)
  8. Tapad (41)
  9. ZoomInfo (34)
  10. Snapchat (32, Alias)
- **B2B-Intent-Daten sind ein blinder Fleck:** ZoomInfo, 6sense, Demandbase, G2, Bombora, Madison Logic und D&B fehlen komplett. `buildingBlocks.ts` mappt Demandbase, Bombora, ZoomInfo und Tapad bereits auf Blöcke, nur die Regeln existieren nicht.
- **Rückrichtung:** **44 Regeln** stehen in der OP-Bibliothek, kommen im Sample aber auf **0 Domains** vor. Bei **179 Regeln** taucht das Host-Signal in keiner der 4.302 Flotten-Request-Domains auf. Dazu kommen **6 Regexe mit echten Fremdtreffern** (Lytics, Media.net, Convert, Signal, Cal.com, Framer).

## Methodik

| Schritt | Quelle (OP-API) | Ergebnis |
|---|---|---|
| Bibliothek | `GET /v2/tags` | 1.511 Tags mit Kategorie |
| Matching | Python-Port von `canonicalNames.ts` (Alias-, Qualifier- und VENDOR_ONLY-Tabellen werden direkt aus der TS-Datei geparst). Validiert u. a. mit Heap, Drupal und „Facebook Like“ → Facebook SDK | 534 bekannt / 976 unbekannt |
| Sample | `GET /v3/web-audits/latest-runs` (682 Audits, 439 Domains) plus Grid-API `POST /v3/reports/grid/tags` mit `IS_MOST_RECENT_RUN=1` und `IS_MOST_RECENT_PAGE_SCAN=1` | 466 Domains, 655 Runs, 4.146 Seiten, 561 Tags |
| Häufigkeit | Grid `tags`: `count_distinct` der Basis-Domain je Tag; bei Produkten mit mehreren OP-Tags die Vereinigungsmenge der Domains | „Domains“ in den Tabellen |
| Hosts und Muster | Grid `network-requests` (Host und Pfad je Tag) und Grid `cookies` (`INITIATORS_TAG_IDS`) | Signalvorschläge |
| Cross-Check | Unsere `scriptSrc`/`requests`/`html`-Regexe (inkl. `signalLayers.ts`) gegen die OP-Request-URLs der unbekannten Tags | trennt Alias-Fälle von echten Lücken |
| Rückrichtung | Je Regel: OP-Tag-Vorkommen plus Regex-Test gegen alle 4.302 Request-Domains der Flotte | tote/veraltete Signale |

**Einschränkungen:**
- Das Sample ist Enterprise- und US-lastig (der Account gehört einem Adobe-Team, die Audits zielen auf Prospects). Japanische und DACH-Sites sind vertreten, SMB-Shops kaum.
- Auf 0 Vorkommen zu kommen heißt deshalb nicht, dass eine Regel tot ist.
- OP scannt mit Consent-Default. Tags hinter einer Einwilligung sind darum unterrepräsentiert.

## Top 50 nicht erkannte Tags (nach Verbreitung)

Spalte „Typ“:
- **neue Regel:** Es gibt keine Regel.
- **Alias:** Die Regel existiert und ihre Signale greifen; nur der OP-Name matcht nicht. Fix in `ALIAS_SOURCE`.
- **Alias + Signal:** Die Regel existiert, sie verpasst aber zusätzlich Hosts.
- **Signal-Fix:** Das Signal landet in der falschen Regel.

Regex-Vorschläge, Cookies und JS-Globals je Eintrag stehen in der JSON-Datei.

| # | Produkt (Vorschlag) | OP-Tags (ID) | OP-Kategorie | Domains | Typ | typische Hosts / Muster (OP) | Building Block |
|---:|---|---|---|---:|---|---|---|
| 1 | Google Tag (gtag.js) | Google Tag (655) | Tag Management | 338 | neue Regel | `www.googletagmanager.com`, `www.google.com` | Tag Management |
| 2 | Google Fonts | Google Fonts (1167) | Content & Asset Management | 212 | neue Regel | `fonts.gstatic.com`, `fonts.googleapis.com` | – |
| 3 | The Trade Desk | TradeDesk (158); Trade Desk Universal (668) | Advertising & Paid Media | 88 | Alias | `insight.adsrvr.org`, `match.adsrvr.org`, `js.adsrvr.org` | Advertising |
| 4 | Twitter / X Pixel | X Analytics Conversion (551); X Analytics Loader (1688); X Conversion Tracker (542) | Advertising & Paid Media, Social Media | 49 | Alias + Signal | `analytics.twitter.com`, `t.co`, `static.ads-twitter.com` | Advertising |
| 5 | BidSwitch | BidSwitch (424) | Advertising & Paid Media | 49 | neue Regel | `x.bidswitch.net` | Advertising |
| 6 | AWS CloudFront | Amazon CloudFront CDN (596) | Site Infrastructure & Security | 45 | Alias | `d22xmn10vbouk4.cloudfront.net`, `d35vb5cccm4xzp.cloudfront.net` | – |
| 7 | Yahoo Advertising (Yahoo DSP / DOT) → bestehend: *Yahoo Advertising* | Yahoo Rapid (987); Yahoo Analytics (292); Yahoo Tracker Loader (438) | Advertising & Paid Media, Web Analytics | 41 | Alias + Signal | `s.yimg.com`, `sp.analytics.yahoo.com`, `ups.analytics.yahoo.com` | Advertising |
| 8 | Tapad (Experian) | TapAd Pixel (416) | Data Management (DMP) | 41 | neue Regel | `pixel.tapad.com`, `tag.tapad.com` | Profile Resolution |
| 9 | ZoomInfo (WebSights) | ZoomInfo Analytics (1242); Zoominfo Loader (1334) | Digital Measurement & Attribution | 34 | neue Regel | `ws.zoominfo.com`, `js.zi-scripts.com` | 3rd Party Data |
| 10 | Snapchat Pixel | Snapchat Event Loader JS (1201) | Advertising & Paid Media | 32 | Alias | `sc-static.net` | Advertising |
| 11 | Adobe Dynamic Media | AEM Dynamic Media (1262) | Content & Asset Management | 28 | Alias + Signal | `s7d9.scene7.com`, `kao-h.assetsadobe3.com` | DAM |
| 12 | 6sense | 6sense Loader (334) | Digital Measurement & Attribution | 28 | neue Regel | `j.6sc.co` | 3rd Party Data |
| 13 | jQuery | Google APIs jQuery (1582) | Content & Asset Management | 26 | Alias | `ajax.googleapis.com` | – |
| 14 | StackAdapt | StackAdapt (1013) | Advertising & Paid Media | 25 | neue Regel | `tags.srv.stackadapt.com` | Advertising |
| 15 | TripleLift | Triple Lift (426) | Advertising & Paid Media | 22 | Alias + Signal | `eb2.3lift.com` | Advertising |
| 16 | Demandbase | Demandbase Script (360) | Advertising & Paid Media | 21 | neue Regel | `tag.demandbase.com`, `scripts.demandbase.com` | 3rd Party Data |
| 17 | HubSpot Marketing | HubSpot Script Loader (1351); HubSpot Analytics Loader (1352); HubSpot Analytics (236); HubSpot Form Counter (1614); HubSpot Form (1613); HubSpot Forms Loader (1612); HubSpot Chat (1667) | Customer Support & Chat, Digital Measurement & Attribution, Marketing Automation & Email, Web Analytics | 20 | Alias + Signal | `js.hs-scripts.com`, `js-na2.hs-scripts.com`, `js.hs-analytics.net` | Campaign Orchestration |
| 18 | Font Awesome | Font Awesome (1395) | Content & Asset Management | 19 | neue Regel | `use.fontawesome.com`, `maxcdn.bootstrapcdn.com` | – |
| 19 | LiveIntent | LiveIntent (1408); LiveIntent Loader (935) | Marketing Automation & Email | 17 | neue Regel | `i.liadm.com`, `b-code.liadm.com` | Advertising |
| 20 | Google Maps JavaScript API | Google Maps (1675) | Content & Asset Management | 15 | neue Regel | `maps.googleapis.com` | – |
| 21 | Claritas (Barometric / ArtsAI) | Claritas Analytics (1197); Claritas ArtsAI (1311) | Digital Measurement & Attribution, Personalization | 15 | neue Regel | `trkn.us`, `arttrk.com` | Advertising |
| 22 | Moment.js | Moment JS (1265) | JavaScript Libraries | 13 | neue Regel | `media.ruthschris.com`, `www.jdirving.com` | – |
| 23 | HubSpot Cookie Banner | HubSpot CMP Banner (1353) | Privacy & Consent | 13 | neue Regel | `js.hs-banner.com`, `js-na2.hs-banner.com` | Consent Management |
| 24 | VWO | Visual Website Optimizer (14); Visual Website Optimizer - Sampling (997) | A/B Testing & Optimization | 12 | Alias | `dev.visualwebsiteoptimizer.com`, `r2.visualwebsiteoptimizer.com` | Personalization & Optimization |
| 25 | G2 Buyer Intent | G2 Attribution Tracking (910) | Digital Measurement & Attribution | 12 | neue Regel | `tracking.g2crowd.com`, `tracking-api.g2.com` | 3rd Party Data |
| 26 | Simpli.fi | Simpli.fi (614) | Advertising & Paid Media | 12 | neue Regel | `tag.simpli.fi`, `i.simpli.fi` | Advertising |
| 27 | Spotify Ad Analytics (Podsights) | Spotify Ad Analytics Loader (1108); Spotify Ad Analytics (1343) | Digital Measurement & Attribution | 12 | neue Regel | `pixel.byspotify.com`, `cdn.pdst.fm`, `pixels.spotify.com` | Advertising |
| 28 | Yahoo! JAPAN Ads | Yahoo Remarketing Japan (518) | Retargeting | 12 | neue Regel | `b99.yahoo.co.jp`, `b0.yahoo.co.jp` | Advertising |
| 29 | Siteimprove Analytics | Siteimprove Analytics (1056) | Web Analytics | 12 | neue Regel | `siteimproveanalytics.com`, `6016578.global.siteimproveanalytics.io` | Analytics |
| 30 | Basis (Centro / SiteScout) | Basis DSP Pixel Sync (1168); Basis DSP (435) | Advertising & Paid Media | 11 | neue Regel | `pixel-sync.sitescout.com`, `pixel.sitescout.com` | Advertising |
| 31 | Twitter / X Widgets | X Widget (322) | Social Media | 10 | Alias | `platform.twitter.com` | – |
| 32 | Nielsen Digital Measurement (DCR/DAR) → bestehend: *Nielsen DMP* | NielsenOnline - Standard (31); Nielsen DCR Loader (477) | Audience Research & Feedback | 10 | Signal-Fix | `secure-gl.imrworldwide.com`, `secure-dcr.imrworldwide.com` | Analytics |
| 33 | Dstillery | Dstillery (145) | Advertising & Paid Media | 10 | neue Regel | `idpix.media6degrees.com`, `action.media6degrees.com` | Advertising |
| 34 | RTB House | RTBHouse (594) | Retargeting | 10 | neue Regel | `tags.creativecdn.com` | Advertising |
| 35 | LINE Tag | Line Loader (831); Line Pixel (1244) | Advertising & Paid Media | 10 | neue Regel | `d.line-scdn.net`, `tr.line.me` | Advertising |
| 36 | Rakuten Advertising | Rakuten Marketing (213) | Affiliate & Partner | 9 | Alias + Signal | `tag.rmp.rakuten.com`, `intljs.rmtag.com` | Advertising |
| 37 | Adara | Adara Media (138) | Advertising & Paid Media | 9 | neue Regel | `tag.yieldoptimizer.com` | Advertising |
| 38 | MNTN (Mountain) | Mountain Insights (1504) | Advertising & Paid Media | 9 | neue Regel | `dx.mountain.com` | Advertising |
| 39 | Consentmanager.net | consentmanager CMP (1549); consentmanager CMP Loader (1550) | Privacy & Consent | 8 | Alias | `d.delivery.consentmanager.net`, `a.delivery.consentmanager.net`, `cdn.consentmanager.net` | Consent Management |
| 40 | TVSquared (Innovid) | TVSquared Loader (963); TVSquared Tracker (962) | Digital Measurement & Attribution | 8 | neue Regel | `collector-48530.us.tvsquared.com`, `collector-15930.us.tvsquared.com`, `collector-43043.us.tvsquared.com` | Analytics |
| 41 | Sojern | Sojern Pixel (267); Sojern Beacon (272) | Advertising & Paid Media, Retargeting | 8 | neue Regel | `pixel.sojern.com`, `beacon.sojern.com` | Advertising |
| 42 | Bombora | Bombora (1686) | Data Management (DMP) | 7 | neue Regel | `ml314.com` | 3rd Party Data |
| 43 | Viant Adelphic | Adelphic Universal Pixel (1212); Adelphic Universal Pixel Loader (1211) | Advertising & Paid Media | 7 | neue Regel | `ad.ipredictive.com`, `js.ipredictive.com` | Advertising |
| 44 | Branch | Branch (289); Branch Web SDK (1627) | Digital Measurement & Attribution | 7 | neue Regel | `api2.branch.io`, `protected-api.branch.io`, `cdn.branch.io` | Analytics |
| 45 | Securiti Consent | securiti CMP (1126) | Privacy & Consent | 7 | neue Regel | `cdn-prod.securiti.ai`, `cdn-prod.eu.securiti.ai` | Consent Management |
| 46 | Salesforce Commerce Cloud | CQuotient JS (862) | Ecommerce | 6 | Alias + Signal | `cdn.cquotient.com` | E-Commerce |
| 47 | Madison Logic | Madison Logic (613) | Digital Measurement & Attribution | 6 | neue Regel | `s.ml-attr.com` | 3rd Party Data |
| 48 | Dun & Bradstreet Audience | Dunn & Bradstreet (836) | Digital Measurement & Attribution | 6 | neue Regel | `ecf.d41.co`, `api5137.d41.co` | 3rd Party Data |
| 49 | iSpot.tv | iSpot (533) | Digital Measurement & Attribution | 6 | neue Regel | `pt.ispot.tv` | Analytics |
| 50 | Nextdoor Pixel | Nextdoor Pixel Loader (1283); Nextdoor Pixel (1284) | Advertising & Paid Media, Social Media | 6 | neue Regel | `ads.nextdoor.com`, `flask.nextdoor.com` | Advertising |

**Weitere Vorschläge außerhalb der Top 50** (Domains im Sample):
- Monsido/Acquia Optimize (6)
- User Insight JP (6)
- Ensighten → CHEQ (5, Alias)
- Skai/Kenshoo (5)
- PulsePoint (5)
- Zeta Global (5)
- LivePerson → LiveEngage (4, Alias)
- AppsFlyer (4)
- Transcend (4)
- Invoca (4)
- Glassbox (4)
- PriceSpider (4)
- Awin → Affiliate Window (3, Alias + Signal `dwin1.com`)
- Datadog RUM (3, Alias)
- Ketch (3)
- Usabilla (3)
- SAP CDC/Gigya (2)
- ActionIQ (1, Alias)

## Alias-Vorschläge für `canonicalNames.ts` (`ALIAS_SOURCE`)

In diesen Fällen kennen wir die Technologie bereits. Der OP-Name matcht nur nicht.

| Unsere Regel | OP-Namen (als Alias aufnehmen) | Domains | Signale greifen schon? |
|---|---|---:|---|
| The Trade Desk | TradeDesk, Trade Desk Universal | 88 | ja (`adsrvr.org`) |
| Twitter / X Pixel | X Analytics Conversion, X Analytics Loader, X Conversion Tracker (alternativ: `x` als Vendor-Präfix auf Twitter mappen) | 49 | nur teilweise: der Loader ja, der Beacon `analytics.twitter.com/i/adsct` und `t.co/i/adsct` nicht |
| AWS CloudFront | Amazon CloudFront CDN | 45 | über Header ja; OP zählt aber jedes Drittanbieter-Asset auf `*.cloudfront.net` |
| Yahoo Advertising | Yahoo Rapid, Yahoo Analytics, Yahoo Tracker | 41 | **nein**: Regel prüft `ads.yahoo.com`/`verizonmedia.com`, real sind `s.yimg.com/wi/ytc.js` und `sp.analytics.yahoo.com` |
| Snapchat Pixel | Snapchat Event Loader JS (oder `event loader js` als Qualifier) | 32 | ja (`sc-static.net`) |
| Adobe Dynamic Media | AEM Dynamic Media | 28 | teilweise: `*.scene7.com` ja, CNAME-Hosts (`images.<kunde>.com/is/image/…`, `*.assetsadobe3.com`) nein |
| jQuery | Google APIs jQuery | 26 | teilweise (`ajax.googleapis.com/ajax/libs/jquery/` fehlt) |
| TripleLift | Triple Lift | 22 | **nein**: Regel kennt nur `triplelift.com`, real ist `*.3lift.com` |
| HubSpot Marketing | HubSpot Script Loader, HubSpot Analytics, HubSpot Analytics Loader, HubSpot Form, HubSpot Forms Loader, HubSpot Form Counter, HubSpot Chat | 20 | teilweise: `js-na1/eu1.hs-scripts.com` und `hs-analytics.net` fehlen |
| VWO | Visual Website Optimizer (+ „- Sampling“) | 12 | ja |
| Twitter / X Widgets | X Widget | 10 | ja |
| Rakuten Advertising | Rakuten Marketing | 9 | **nein**: `tag.rmp.rakuten.com`, `js.rmtag.com` fehlen |
| Consentmanager.net | consentmanager CMP (+ Loader) | 8 | ja |
| Salesforce Commerce Cloud | CQuotient JS | 6 | **nein** (`cdn.cquotient.com` ist ein starker SFCC-Beleg) |
| Ensighten | CHEQ Manage, CHEQ Manage Rules/Error, CHEQ Enforce | 5 | ja (`nexus.ensighten.com`). Empfehlung: Regel in „Ensighten (CHEQ)“ umbenennen |
| LivePerson | LiveEngage (+ Configuration/Assets) | 4 | ja (`lpsnmedia.net` über Requests) |
| Awin | Affiliate Window | 3 | **nein**: `dwin1.com` fehlt |
| Datadog RUM | Datadog Session Recording, Datadog Browser Logs | 3 | ja |
| ActionIQ | Action IQ | 1 | ja |
| *(neu)* HubSpot Cookie Banner | HubSpot CMP Banner | 13 | – (neue Consent-Regel `js*.hs-banner.com`) |

Bei **Everest.js (#633)** zeigen die Cookies Adobe Advertising an (`adcloud`). Ein Alias auf Adobe Advertising Cloud ist zu prüfen, bevor er übernommen wird.

## Signal-Lücken und Fehlzuordnungen bei bestehenden Regeln

1. **TripleLift:** Die Regel sucht nur nach `triplelift.com`, der Anbieter läuft aber über `eb2.3lift.com`/`tlx.3lift.com`. Im Sample hat die Regel 0 Treffer, OP findet TripleLift auf 22 Domains.
2. **Twitter / X Pixel:** Der Conversion-Beacon `analytics.twitter.com/i/adsct` bzw. `t.co/i/adsct` fehlt in `requests`.
3. **Yahoo Advertising:** Beide Signale (`ads.yahoo.com`, `verizonmedia.com`) kommen in 4.302 Request-Domains nicht vor. Neu nötig sind `s.yimg.com/wi/ytc.js` und `sp.analytics.yahoo.com/sp.pl`. **Yahoo! JAPAN** (`s.yimg.jp/…/ytag.js`, `b99.yahoo.co.jp`) ist ein eigenes Unternehmen und braucht eine eigene Regel.
4. **Nielsen:** `imrworldwide.com` ist die Nielsen-Reichweitenmessung (DCR/DAR, OP: „NielsenOnline“). Unsere Regel ordnet das Signal aber „Nielsen DMP“ zu und schiebt die Sites damit fälschlich in den DMP-Block. Vorschlag: eine eigene Analytics-Regel „Nielsen Digital Measurement“. Die Nielsen-DMP-Regel behält nur DMP-Signale (eXelate: `exelator.com`, `nielsen.com`).
5. **Adobe Dynamic Media:** Die Auslieferung über Kunden-CNAMEs wird nicht erkannt. Ein schwaches Signal `/is/image/<company>/` würde helfen und ist für Adobe-Pitches relevant.
6. **Awin, Rakuten, SFCC (CQuotient), HubSpot (regionale Hosts):** Zu ergänzen sind die Hosts aus der Alias-Tabelle.

## Präzisionsrisiken: unverankerte Regexe mit Fremdtreffern

Diese Regexe wurden gegen die 4.302 Flotten-Request-Domains getestet. Die folgenden matchen fremde Anbieter:

| Regel | Regex | trifft fälschlich | Sites | Fix |
|---|---|---|---:|---|
| Lytics | `/lytics\.io/` | `*.global.siteimproveanalytics.io`, `ktxlytics.io` | 12 | `/(^\|[/.])lytics\.io\//` bzw. `/c\.lytics\.io\//` |
| Media.net | `/media\.net/` | `lpcdn.lpsnmedia.net` (LivePerson) | 8 | `/(^\|[/.])media\.net\//` |
| Convert | `/convert\.com/` | `cdn.omniconvert.com` | 2 | `/cdn-\d+\.convertexperiments\.com/`, `/(^\|[/.])convert\.com\//` |
| Signal (BrightTag) | `/signal\.co/` | `cdn.onesignal.com` | 2 | `/s\.btstatic\.com/` beibehalten, `signal.co` verankern: `/\/\/[a-z.]*\bsignal\.co\//` |
| Cal.com | `/cal\.com/` | `www.economical.com`, `compass-clinical.com` | 2 | `/(app\.)?cal\.com\/embed/`, verankert |
| Framer | `/framer\.com/` | `cdn.feedframer.com` | 1 | `/(^\|[/.])framer\.com\//` |

Nicht kritisch (gleicher Anbieter, nur andere Subdomain): Google Ads ↔ `pagead2.googlesyndication.com`, Cookiebot, Klaviyo, Pardot, CookieYes (`cdn-cookieyes.com`), Datadog (`browser-intake-datadoghq.com`), Salesforce (`*.my.salesforce.com`), AppDynamics, ID5, Braze, BuySellAds und Freshchat.

**Generelle Empfehlung:** Host-Regexe mit `(^|[/.])` bzw. `\/\/([a-z0-9-]+\.)*` verankern. Sonst greift jeder Host, der auf den Domainnamen endet oder ihn enthält.

## Rückrichtung: Regeln ohne Beleg im OP-Sample

### A) Von OP gekannt, aber auf 0 Domains gesehen (44 Regeln, kein Host-Treffer)

Joomla, DatoCMS, Salesforce DMP (Krux), Weborama, mParticle, Simple Analytics, GoatCounter, Kissmetrics, Woopra, Clicky, etracker, Econda, INFOnline / IVW, StatCounter, Algonomy (RichRelevance), Qubit, Certona, Split.io, Statsig, Conductrics, SiteSpect, Pipedrive, Iterable, Responsys, MoEngage, Commanders Act (TagCommander), Sourcepoint, Quantcast Choice, Complianz, Termly, MOAT (Oracle), Yahoo Advertising, Nativo, GumGum, Awin, ShareASale, Refersion, Crisp, Akamai, StackPath / MaxCDN, hCaptcha, Kaltura, HubSpot Meetings, Catchpoint.

Nach Ursache eingeordnet:
- **Produkt eingestellt oder umbenannt, Signal vermutlich tot:**
  - **Salesforce DMP (Krux)**: EOL 2023
  - **MOAT (Oracle)**: Oracle Advertising wurde 2024 eingestellt
  - **Qubit** → Coveo (bei uns zusätzlich als „Qubit (now Coveo)“ doppelt)
  - **Certona** → Kibo
  - **StackPath / MaxCDN**: CDN-Geschäft 2024 eingestellt
  - **Yahoo Advertising**: Signale veraltet, siehe oben
  - Kandidaten zum Entfernen oder Zusammenlegen
- **Signal fehlt, nicht das Produkt:**
  - **Awin** (`dwin1.com`)
  - **Yahoo Advertising**
  - **Akamai**: Header-basiert erkennbar, die Host-Signale greifen nicht; OP führt Akamai nur als mPulse/Boomerang
- **Regional (DACH/FR) und im US-lastigen Sample nicht vertreten, behalten:** etracker, Econda, INFOnline/IVW, Commanders Act, Weborama.
- **SMB/Indie, im Enterprise-Sample selten, behalten:** Simple Analytics, GoatCounter, Clicky, StatCounter, Woopra, Kissmetrics, Crisp, Termly, Complianz, Refersion, ShareASale u. a.

### B) Host-Signal in keiner der 4.302 Flotten-Request-Domains (179 Regeln)

Verteilung nach Kategorie:
- ESP/Marketing Automation: 24
- Analytics: 21
- Advertising: 17
- Customer Support: 17
- Personalization & Optimization: 12
- Forms: 10
- Social: 9
- Payments: 9
- CDP: 7
- Search: 7
- Push: 5
- CRO: 5
- Rest: ≤ 4 je Kategorie

Auffällig:
- **CDPs ohne Client-Tag:** Amperity, Simon Data, Hightouch, Census, Twilio Engage und ActionIQ arbeiten fast ausschließlich serverseitig oder als Reverse-ETL. Ein `scriptSrc`-Signal auf den Herstellerhost ist deshalb strukturell selten. Diese Regeln eher über DNS/CNAME, Cookie oder Karriere-/Stellenanzeigen-Signale belegen oder als „low recall“ markieren.
- **JS-Frameworks (React, Vue.js, Angular, Backbone):** Die CDN-Signale greifen nicht, weil die Frameworks gebündelt ausgeliefert werden. Erkennbar sind sie über `html`/`js` (z. B. `data-reactroot`, `__VUE__`, `ng-version`), und diese Signale sind vorhanden.
- **Adobe Sign und AEM Assets:** Kein Host-Treffer. Für Adobe-Pitches ist ein Signal-Review sinnvoll (AEM Assets über `/content/dam/` bzw. Dynamic Media).
- **Verizon Media / Oath, Qubit (now Coveo), Lotame Panorama ID, Unified ID 2.0 und SpotX / Magnite Video:** Die Produkte sind umbenannt oder in andere Produkte aufgegangen. Konsolidieren.
- Die vollständige Liste steht in `lib-research/raw/reverse_rules.json` (Feld `requestDomainHits` leer).

Weitere **132 Regeln** prüfen nur `html`/`meta`/`headers`/`cookies` und sind mit OP-Request-Daten nicht prüfbar, etwa Sitecore oder Contentful.

## Nicht übernehmen bzw. in `IGNORED_OP_TAGS` aufnehmen

| OP-Tag | Grund |
|---|---|
| Google Media (#1404, `yt3.ggpht.com`) | YouTube-Bilder, kein eigenes Produkt |
| Google APIs (#1581, `jnn-pa.googleapis.com`) | Google-Infrastruktur (Attestation/RPC) |
| Google Security Scripts (#1706) | BotGuard, Infrastruktur |
| ipify API (#1415) | IP-Lookup, kein Martech |
| PebblePost (#646) | OP-Signatur unzuverlässig (Requests an `vector.co`, `intellimize.co`, `optable.co` …) |
| Tag Inspector Realtime (#1020) | Monitoring-Tool einer Agentur, kein Kunden-Stack |
| Everest.js (#633) | wahrscheinlich Adobe Advertising (`adcloud`-Cookie), Alias prüfen statt eigener Regel |

**Google Tag (#655):** Entweder bekommt es eine eigene schwache Regel „Google Tag (gtag.js)“ oder es kommt ebenfalls in `IGNORED_OP_TAGS`. GA4 und Google Ads werten `gtag/js?id=G-|AW-` bereits aus. Ohne eine der beiden Maßnahmen bleibt das häufigste OP-Tag eine Dauer-Lücke in der OP-Bestätigung.

## Empfohlene Reihenfolge

1. **Alias-Block in `canonicalNames.ts`:** wenig Aufwand, beseitigt 19 Produkt-Lücken bzw. 412 Domain-Vorkommen in der OP-Bestätigung.
2. **Signal-Fixes:**
   - TripleLift (`3lift.com`), X (`adsct`), Yahoo DOT, Nielsen DCR, Awin (`dwin1.com`)
   - die sechs Präzisions-Fixes (Lytics, Media.net, Convert, Signal, Cal.com, Framer)
3. **B2B-Intent-Paket:** ZoomInfo, 6sense, Demandbase, Bombora, G2, Madison Logic, D&B. Die Building Blocks sind teils schon gemappt, die Relevanz für RT-CDP B2B ist hoch.
4. **Ad-Tech-Paket:**
   - StackAdapt, LiveIntent, Simpli.fi, Spotify, RTB House, Dstillery, Basis, Adelphic, MNTN, Claritas
   - BidSwitch und Tapad nur als schwache Sync-Signale
5. **Consent-Paket:** HubSpot Cookie Banner, Securiti, Transcend, Ketch.
6. **Regional:** LINE Tag, Yahoo! JAPAN, User Insight.

## Reproduzierbarkeit

Skripte und Rohdaten liegen außerhalb des Repos im Session-Ordner `…/files/lib-research/`:
- `op.py`: lesender OP-Client; der Key wird aus `project/.env` geladen und nie ausgegeben
- `canon.py`: Python-Port von `canonicalNames.ts`
- `s1_library.py` … `s9_precision.py`: Datenabzug und Auswertung
- `s10_build.py`: Produktgruppierung, Top 50 und JSON
- Rohdaten in `raw/`: `v2_tags.json`, `fleet_tags.json`, `unknown_summary.json`, `unk_tag_domains.json`, `tag_cookies.json`, `reverse_rules.json`, `precision_suspects.json`, `proposals_full.json`

Felder in `02-rule-proposals.json`:
- Pflichtfelder laut Vorgabe: `name`, `category`, `buildingBlock?`, `signals{scriptSrc?,requests?,html?,cookies?,jsGlobals?}`, `evidence`, `frequency`, `opTagIds`
- Zusätzlich: `proposalType` (neu/alias/alias+signal/signal-fix), `existingRule`, `canonicalAliases`, `note`
- Regexe stehen als JS-Literal-Strings (`"/…/"`) darin. Sie sind Vorschläge und **noch nicht gegen Live-Sites getestet**.
