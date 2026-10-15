# 04 – Regelqualität der Erkennungs-Engine

Stand: Analyse der 549 Regeln in `project/server/src/services/customDetectors.ts` (`DETECTION_RULES`, 1 038 Patterns) inkl. `signalLayers.ts`, `detector.ts`, `tagEvidence.ts`, `dnsSignals.ts` und `observepoint/canonicalNames.ts`.
Konkrete Korrekturen mit Regex und Testfall: `04-rule-fixes.json` (45 Einträge; jeder `testCase.pattern` wurde gegen seine `shouldMatch`/`shouldNotMatch`-Beispiele selbst getestet, 0 Fehler).

## 1. Methodik

| Baustein | Umfang | Hinweis |
|---|---|---|
| Statische Heuristiken (Skript `analyze.ts`, importiert `DETECTION_RULES` direkt) | 549 Regeln, 1 038 Patterns, 1 208 Befunde | Klassen: fehlender Host-Anker, nacktes Wort, `.*`, generische Cookies/Header, html-only, Einzel-Signal, Duplikate, Kategorien, Versionsfähigkeit, Namenskollisionen |
| Kollisions-Matrix | 190 kuratierte Vendor-URLs mit Soll-Ergebnis, 44 adversariale Fremd-URLs, alle Script-URLs aus 22 Live-Snapshots, 2 853 reale Hostnamen aus dem ObservePoint-Kundenbestand | Ergebnis `collision-matrix.csv` (Pattern × URL) |
| Empirik Korpus | 22 Startseiten (u. a. Allianz, Spiegel, Otto, Telekom, ERGO, Deutsche Bank, Nike, SAP, Salesforce, HubSpot, Stripe, Vercel, IKEA, Guardian, Bild, Chip) per `curl` als statisches HTML + Header | Kein JS, keine Requests/Cookies aus dem Browser → JS-/Request-/Cookie-Regeln werden hier unterschätzt |
| Empirik DB | `project/server/data/techstack.db` read-only, 9 Analysen = 5 verschiedene Sites | Rohdaten (scriptSrc, Requests) werden nicht gespeichert, nur `rawDetections` |
| ObservePoint-Abgleich | 1 511 OP-Tags gegen `TechstackNameIndex` | 534 auflösbar (35 %) |

Skripte und Rohdaten liegen außerhalb des Repos im Session-Ordner (`files/lib-research/`: `analyze.ts`, `vendor-urls.ts`, `build-fixes.mjs`, `results.json`, `collision-matrix.csv`, `corpus/`).

**Einschränkung:** Die DB ist mit 5 Sites zu klein für belastbare Häufigkeits-Aussagen. Die Empirik ist daher vor allem ein Beleg-Fundus für konkrete Fehltreffer, keine Statistik.

## 2. Gesamtbild

- Die zuletzt gemeldeten Fehler (GA4 auf AW-/DC-IDs, GAM auf `googletagmanager`, Evergage `evgnet.com`) sind behoben und im Korpus nicht mehr auffällig.
- Die Fehlerquelle Nr. 1 sind **HTML-Heuristiken auf generischen Wörtern bzw. Klassen**. Im Korpus waren von 61 HTML-only-Treffern (weak) nach manueller Sichtung der Snippets rund 37 falsch – etwa 60 %. Ohne die zuverlässigen ID-Patterns (GTM-ID, `utag.js`, GAM, EDS) liegt die Fehlerquote der restlichen Wort- und Klassen-Heuristiken bei über 80 %.
- Fehlerquelle Nr. 2 sind **scriptSrc-Patterns ohne Host- bzw. Dateigrenze** (`/ember/`, `/turbo/`, `/media\.net/`, `/signal\.co/`, `/cal\.com/`). Sie sind gefährlicher, weil scriptSrc mit 78 % Konfidenz **nicht** als weak gilt.
- Fehlerquelle Nr. 3 sind **falsch zugeordnete oder geteilte Cookies und Header** (Snapchat-Cookies bei Segment, IIS bei Azure CDN). Diese Signale zählen mit 84–88 % Konfidenz.
- **Doppelregeln** wie Qubit/Qubit (now Coveo), Insider/Insider CDP oder die HubSpot-Trias erzeugen aus einem Signal mehrere Produkte. Das bläht die Building Blocks (CDP, CRM) auf.
- **Abdeckungslücken:** 24 von 190 kuratierten Vendor-URLs werden nicht erkannt, darunter LogRocket, Sentry, Datadog, Pinterest, Reddit, PerimeterX und Klarna-CDN.

## 3. Statische Befunde

### 3.1 Befundzahlen (Heuristik, vor manueller Bewertung)

| Klasse | Anzahl | Bewertung |
|---|---:|---|
| `no-host-anchor` (Domain-Regex ohne linken Anker) | 689 | Großteil harmlos (eindeutige Hostnamen); 102 als „medium“ markiert, ~20 nachweislich kollidierend (s. 3.2) |
| `bare-word` (nacktes Produktwort, oft `/i`) | 182 (49 high) | Hauptursache für HTML-Fehltreffer |
| `single-signal` (Regel hat nur 1 Pattern) | 165 | Kein Fehler, aber keine Bestätigung möglich |
| `html-only` (Regel feuert immer nur weak/64 %) | 61 | u. a. Tridion, CoreMedia, FirstSpirit, Hybris, Oxid, Dynamics 365, SugarCRM, Siebel, CJA |
| `generic-cookie-prefix` / `-name` | 54 | ~15 echt kritisch (s. 3.4) |
| `generic-header` | 16 | 3 echt kritisch (Azure, Fastly, Google Cloud CDN) |
| `cross-rule-duplicate-pattern` | 10 | alle relevant (s. 3.5) |
| `dot-star` (`.*` über ganzes Dokument) | 15 | Fehltreffer + Backtracking |
| `cookie-prefix-not-applied` | 3 | Signal feuert nie (Engine-Bug) |
| `canonical-variant-collision` | 6 | Namensvarianten mappen auf 2 Regeln |
| Duplikate durch `signalLayers` | 1 | Evergage |

### 3.2 Substring- und Anker-Kollisionen (belegt)

| Regel | Pattern | Trifft fälschlich | Beleg |
|---|---|---|---|
| Angular | html `/ng-app/` | „rating-app“, „dating-apps“ | Korpus 3/3 falsch (Allianz, Bild, TechCrunch) |
| Angular | scriptSrc `/angular/` | „rectangular-slider.js“ | adversarial |
| Ember.js | scriptSrc `/ember/` | member, remember, november, december | 4 OP-Kundenhosts `members.*` |
| Econda | scriptSrc `/econda/` | „secondary-navigation.js“ | adversarial |
| Turbo (Hotwire) | scriptSrc `/turbo/` | Vercel „turbopack“-Chunks, „turbotax“ | Korpus Vercel |
| Media.net | scriptSrc `/media\.net/` | LivePerson `lpcdn.lpsnmedia.net` | kuratiert |
| Signal (BrightTag) | scriptSrc `/signal\.co/` | `cdn.onesignal.com`, `signal.com` | kuratiert |
| Cal.com | scriptSrc `/cal\.com/` | local.com, medical.com, economical.com | 3 OP-Kundenhosts |
| Microsoft Dynamics 365 | html `/dynamics\.com/` | bostondynamics.com, Footer-Links | adversarial |
| Salesforce | `/force\.com/` | workforce.com; Live-Agent-Skript landet bei „Salesforce“ statt „Live Agent“ | kuratiert |
| Shape Security | `/shape\.com/` | onshape.com | OP-Kundenhost |
| Impact / Convert / Checkout.com / Shop Pay / Oath | Domain ohne Anker | socialimpact.com, unitconvert.com, `checkout.com-bridge.js`, `shop.app.example.com` | adversarial |
| Snowplow | `/(^\|\/)sp(\.min)?\.js/` | SharePoint `/_layouts/15/sp.js` | adversarial |
| Treasure Data | `/(^\|\/)td(\.min)?\.js/` | beliebiges `td.js` | adversarial |
| Bootstrap | scriptSrc `/bootstrap\.min\.js/` | Trustpilot `tp.widget.bootstrap.min.js` | kuratiert |
| Alpine.js | scriptSrc `/alpine/` | „alpine-skiing.js“, Host `alpine.*` | OP-Kundenhost |
| Prebid, mPulse, Countly, Klaro, Borlabs, Typesense, Metrika, Gatsby, Svelte | nacktes Wort in scriptSrc | „prebidding-calculator.js“, „mpulse-heart-rate.js“ … | adversarial |

Kontrollfälle, die korrekt *nicht* als Fehler zählen: `lit-html-polyfill.js`→Lit, `preact-signals.js`→Preact, `angular-material-theme.css`→Angular, `optanon-wrapper`→OneTrust, `elastic-apm-rum.js`→Elastic APM. Das sind echte Bibliotheken.

### 3.3 Generische HTML-Wörter (`/i` auf dem gesamten Dokument)

49 Regeln basieren auf einem nackten Produktnamen, z. B. `sitecore`, `contentful`, `strapi`, `kentico`, `umbraco`, `episerver`, `tridion`, `coremedia`, `firstspirit`, `hybris`, `woocommerce`, `shopware`, `oxid`, `magnolia`, `hubspot`, `marketo`, `munchkin`, `eloqua`, `pardot`, `neolane`, `exacttarget`, `omniture`, `tealium`, `algolia`, `elasticsearch`, `klarna`, `adyen` und `mollie`. Jede Erwähnung in Fließtext, Links, Stellenanzeigen, Partnerlisten oder JSON-Konfigurationen erzeugt damit einen Treffer.

Belege aus dem Korpus:

| Seite | Regel | Snippet |
|---|---|---|
| Spiegel | Contentful | `POLYGON_DOM_LARGEST_CONTENTFUL_PAINT_READY` (Web-Vitals-Konstante) |
| Otto | Contentful | `class="… contentFullWidth"` |
| Salesforce | Contentful | Footer-Link auf contentful.com |
| SAP | SAP Commerce (Hybris) | Domainliste „…, hybris.com, …“ |
| TechCrunch | WooCommerce | `"isWooCommerceBlocksEnabled":false` |
| TechCrunch | HubSpot CRM | `"hubspotPortalId"` |
| Guardian | Adobe Analytics | `"omnitureAmpAccount"` |
| Vercel | Nuxt.js | Link `/frameworks/full-stack/nuxt` |
| IKEA, Stripe | Klarna | Zahlungslogo-Label bzw. Übersetzungsstring |
| IKEA, Allbirds | Apple Pay / Google Pay | `apple-pay.svg`, `apple-pay-shop-capabilities` |

Hinzu kommen semantische Fallen: `oxid` trifft „Titandioxid“, `magnolia` ist ein Blumenname.

Die Adobe-Erwähnungsregeln `journey-optimizer`, `cja.adobe.com`, `adobe.com/sign`, `workfront.com` und `genstudio` sind ebenfalls nur Links. Sie sind besonders heikel, weil Adobe-Produkte im Report hervorgehoben werden.

### 3.4 Strukturelle CSS-/Attribut-Heuristiken

| Regel | Treffer im Korpus | Ursache |
|---|---|---|
| Bootstrap | **11/22 Seiten (52 %)**, davon ~9 falsch (nur SAP/Chip mit echtem `col-md-N`-Grid plausibel) | `class="…container…" … class="…row…"` und `col-xx-N` treffen Nike `ncss-container`/`ncss-col-lg-12`, Otto `…navigation-container` |
| Stimulus (Hotwire) | 3/3 falsch | `data-action-special`, `data-action-hashkeys`, `data-action="search"` |
| Tailwind CSS | 3, davon TechCrunch falsch | `d-flex-inline align-items-center` (Bootstrap) |
| Bulma | 1 falsch | WordPress `hero-ad-container … is-layout-flow` |
| Alpine.js | 2, Allbirds falsch | `@click` ist auch Vue-Kurzsyntax |
| AEM Assets | 3/3 Korpus, 4/5 DB | identisches Pattern `/content/dam/` wie AEM Sites |

Laufzeit: Die Bootstrap-Regex mit `.*` braucht auf einzeiligem HTML bis zu 32 ms (Allianz). Das ist der teuerste Einzel-Regex neben `decapcms` (35 ms). Weitere Kandidaten für einen Laufzeit-Lint sind `uploads\/.*_strapi`, `oracle\.com.*commerce`, `wix\.com.*stores`, `graph\.facebook\.com.*events` und `sap\.com.*crm`.

### 3.5 Cookies und Header

- **Falsch zugeordnete Cookies:** `_scid`/`_sctr` (Snapchat) stehen bei Segment. Jede Seite mit Snap Pixel meldet dadurch Segment als CDP mit 84 %.
- **Geteilte Präfixe:** `_lr_` (LiveRamp ↔ LogRocket), `_sp_` (Snowplow ↔ Sourcepoint), `mp_` (Mixpanel ↔ Mixpanel CDP), `ins_` (Insider ↔ Insider CDP).
- **Zu generisch:** Zwei-Buchstaben-Präfixe `et_`, `tc_`, `uc_`, `dm_`, `ld_`, `ph_`, `mf_`, `wt_`, `km_`, `uv_`, `TD_` und Namen wie `_ab`, `_mc`, `_td`, `TPC`, `GCM`, `is_returning`, `Bootstrapper`.
- **Engine-Bug:** Nur ein abschließendes `_` gilt als Präfix. Die Signale `PrestaShop-`, `intercom-` und `scarab.` werden exakt verglichen und **feuern nie**.
- **Google Ads:** `_gcl_au` setzt auch der GA4-Conversion-Linker. `pagead2.googlesyndication` ist AdSense, nicht Google Ads.
- **Header:**
  - Azure CDN `server=/Microsoft/` trifft jeden IIS (on-premise).
  - Fastly `via=/varnish/` trifft selbst gehostetes Varnish.
  - Google Cloud CDN `via=/google/` ist der Google Front End bzw. Load Balancer (Spiegel), also kein Beleg für ein CDN.

### 3.6 Überlappungen und Duplikate

| Paar | Gemeinsames Signal |
|---|---|
| AEM ↔ AEM Assets | html `/content/dam/` |
| HubSpot CMS ↔ CRM ↔ Marketing | `js.hubspot.com`, `js.hs-scripts.com` (Korpus HubSpot: alle drei) |
| Qubit ↔ Qubit (now Coveo); Coveo ↔ Coveo Search | `qubit.com`, `coveo.com` |
| Emarsys ↔ Emarsys Personalization | `emarsys.com` |
| Insider ↔ Insider CDP; Mixpanel ↔ Mixpanel CDP | Host + Cookie |
| Oracle Data Cloud ↔ AddThis | `addthis.com` (AddThis 2023 eingestellt) |
| React ↔ Next.js | html `__NEXT_DATA__` |
| Tealium iQ ↔ Tealium AudienceStream | `tiqcdn.com`/`tealium` (AudienceStream = CDP!) |
| Facebook / Meta Pixel ↔ Facebook SDK | `connect.facebook.net` inkl. `sdk.js` |
| Evergage (Regel ↔ signalLayers) | Requests `evergage.com`/`evgnet.com` doppelt |

Kanonische Namensvarianten mit zwei Zielregeln: `adobe experience manager`, `shopify`, `qubit`, `twitter`, `akamai`, `hotwire`.

### 3.7 Versionen, Kategorien, Namen

- **Versionen** liefern nur 13 Regeln (AA, ECID, AAM, Segment, Next.js, Vue, jQuery, Web SDK, Target, Tealium, Angular, WordPress, AEP Tags). Der Extractor `Nginx` ist toter Code ohne Regel.
  - Leicht ergänzbar aus Dateinamen: Bootstrap, jQuery, Svelte (Otto: `svelte/5.57.1/`), Prebid.
  - Aus `meta generator`: Drupal, Joomla, TYPO3, Shopware.
  - Außerdem Launch-`turbineVersion` und die OneTrust-Version.
- **Kategorien:**
  - „Social“ mischt Social-Pixel und Review-Widgets.
  - Typeform, SurveyMonkey, Qualtrics und Medallia stehen unter „Analytics“.
  - Adobe Fonts, Sign, Workfront und GenStudio stehen unter „Other“.
  - Forms, Social, CDN, JS-/CSS-Framework, Video und Security haben keinen Building Block.
- **DB-Altnamen:** Gespeicherte Analysen enthalten „Google Analytics“, „Adobe Experience Platform Launch“ und „Tealium“, für die keine Regel mehr existiert. Historien-Vergleiche zeigen dadurch Phantom-Wechsel, deshalb sollten diese Namen als Aliase in `canonicalNames` aufgenommen werden.
- **canonicalNames:** Alle `ALIAS_SOURCE`-Ziele existieren, alle `dnsTech`-Ziele ebenso.

## 4. Kollisions-Matrix – Ergebnis

| Korpus | URLs | Ergebnis |
|---|---:|---|
| Kuratierte Vendor-URLs | 190 | **24 nicht erkannt**, **12 mit falscher Zusatzregel** |
| Adversariale Fremd-URLs | 44 | **41 erzeugen Treffer**, davon ~35 eindeutig falsch (Rest: echte Libs, s. 3.2) |
| Reale Script-URLs (Korpus + DB-Evidenz) | ~310 | 2 Mehrfachtreffer (HubSpot ×3, Vercel Next.js + Turbo) |
| OP-Kundenhosts | 2 853 | 29 Pattern-Treffer. Die meisten sind die Vendor-Domain selbst (salesforce.com, zendesk.com, paypal.com …) und damit korrekt. Echte Fehltreffer: Ember (4), Cal.com (3), Shape (1), Turbo (1), Alpine (1) |

**Nicht erkannte Vendor-URLs (Lücken):**

- Monitoring: LogRocket `cdn.lr-ingest.io`, Sentry `js.sentry-cdn.com`, Datadog RUM.
- Testing: Kameleoon `*.kameleoon.eu`, Convert `convertexperiments.com`.
- Personalisierung und Consent: Emarsys `scarabresearch.com`, Sourcepoint `privacy-mgmt.com`.
- Advertising und Affiliate: Pinterest `s.pinimg.com/ct/core.js`, Reddit-Pixel, Awin `dwin1.com`, GMP-gtag mit `DC-`.
- MarTech: Eloqua `en25.com`, SFMC `exacttargetapis.com`, Cordial, Salesforce Live Agent.
- Contact Center und Payment: Genesys `mypurecloud.de`, Klarna `klarnacdn.net`.
- Media und CMS-Assets: YouTube `iframe_api`, Brightcove Player sowie Asset-Hosts von Contentful, Sanity, DatoCMS und Imgix, die nur in `html` und nicht in `scriptSrc` stehen.
- Security: PerimeterX `px-cloud.net`.

## 5. Empirik

| Frage | Ergebnis | Aussagekraft |
|---|---|---|
| Regeln, die auf > 80 % der Seiten feuern | **keine** | Spitzenreiter Bootstrap 52 % (Korpus, nur weak), AEM 30 %, Cloudflare 30 % |
| Regeln, die nie feuern | 462 von 549 im Mini-Sample | Bei 27 Seiten ohne JS nicht aussagekräftig; für echte Stale-Erkennung braucht es den Monitor aus 6.5 |
| Nur über schwache HTML-Signale | Bootstrap, Contentful, Stimulus, Angular, Tailwind, AEM Assets, Tealium iQ (3×, nur `utag.js` im Inline-Script) | Nach Snippet-Sichtung bei Bootstrap, Contentful, Angular und Stimulus fast vollständig falsch |
| DB | 5 Sites; Bootstrap auf 3/5 Sites (2× weak), AEM Assets 4/5 (3× weak) | bestätigt Korpus |
| ObservePoint-Abdeckung | 534/1 511 OP-Tags (35 %) auf eine Regel abbildbar | Größte Lücken: Advertising (220), Measurement & Attribution (182), Audience Research (57: Nielsen, ForeSee, iPerceptions), Consent (47: Ketch, Transcend, Securiti, Cookie Control) |

Weak-Treffer werden in der UI und im Export als „(unverified)“ bzw. „(?)“ angezeigt und aus Key Findings und Consent-Audit herausgefiltert. Sie fließen aber in Building-Block-Zählungen und in die Merge-Logik ein: `detector.ts` setzt `weak=false`, sobald eine zweite Quelle zustimmt. Ein falscher HTML-Treffer wird dadurch aufgewertet, wenn z. B. auch Wappalyzer auf demselben Wort anschlägt.

## 6. Wartungsprozess – Design

### 6.1 Regel-Metadaten

Das bestehende `DetectionRule`-Interface sollte um ein optionales Feld `meta` erweitert werden. Optional, damit die Migration schrittweise erfolgen kann:

```ts
interface RuleMeta {
  id: string;                  // stabil, kebab-case: 'adobe-analytics'
  owner: string;               // 'joern' | 'team-martech' …
  docsUrl?: string;            // offizielle Implementierungsdoku des Vendors
  source: 'vendor-docs' | 'wappalyzer' | 'observepoint' | 'manual';
  lastVerified: string;        // ISO-Datum, gesetzt durch Golden-Corpus-Lauf oder manuell
  status: 'active' | 'deprecated' | 'sunset';
  sunsetDate?: string;         // z. B. AddThis 2023-05-31
  weights?: Partial<Record<SignalType, number>>; // überschreibt SIGNAL_STRENGTH pro Regel
  requireTwoSignals?: boolean; // html-only/generische Regeln erst ab 2 Signaltypen melden
  tests: { positive: string[]; negative: string[] }; // Pflicht: ≥1 positiver + ≥1 negativer Fall
  implies?: string[];          // 'Next.js' implies 'React' statt Pattern-Duplikat
}
```

Konfidenz-Modell:

- `weights` erlaubt es, generische Header (Azure, Google Cloud CDN) auf ≤ 60 zu senken.
- `requireTwoSignals` erzwingt für Regeln wie Bootstrap, Tailwind oder generische CMS-Wörter einen Zweitbeleg.

### 6.2 Golden Corpus (Regressionstests)

```
project/server/tests/
  fixtures/golden/
    manifest.json                 # [{ id, url, capturedAt, notes }]
    allianz-de.scraped.json       # vollständiges ScrapedData (html, scriptSrc, requests, cookies, headers, js)
    allianz-de.expected.json      # { mustDetect: [...], mustNotDetect: [...], allowExtra: false }
    … (~20 Sites: Adobe-Kunden mit AEM/Launch/Target, Tealium-, GTM-, Shopify-, WordPress-, Next.js-, Salesforce-Commerce-Sites, 2 Publisher mit GAM/Prebid, 1 SharePoint, 1 IIS)
  fixtures/collision/
    vendor-urls.json              # 190+ Vendor-URLs mit expect[]
    adversarial-urls.json         # Fremd-URLs mit expect: []
  golden.test.ts                  # customDetect(snapshot) == expected (exakte Menge, Konfidenz-Toleranz ±5)
  collision.test.ts               # jede Vendor-URL → genau die erwarteten Regeln; adversarial → keine
  rules.lint.test.ts              # statischer Regel-Lint (s. 6.3)
scripts/
  capture-golden.ts               # nutzt den echten Scraper, schreibt *.scraped.json (manuell, nicht in CI)
  rule-report.ts                  # erzeugt Markdown-Report wie dieses Dokument
```

- Die Snapshots werden **eingefroren** und nur bewusst per `npm run golden:capture -- allianz-de` aktualisiert. Der Diff wird im PR reviewt.
- `expected.json` enthält `mustNotDetect` für alle bekannten Fehltreffer aus `04-rule-fixes.json`, damit sie nicht zurückkehren.
- Die 22 Korpus-Seiten dieser Analyse sind ein guter Startpunkt (statisch). Für JS, Requests und Cookies werden sie einmalig mit dem Playwright-Scraper neu erfasst.

### 6.3 Regel-Lint (läuft als Test)

`rules.lint.test.ts` bricht ab, wenn

1. ein Domain-Pattern keinen linken Anker hat (`/(^|\/\/|\.)host\.tld/`) und das erste Label kürzer als 6 Zeichen ist,
2. ein html-Pattern nur aus einem Wort besteht (`/^[a-z-]+$/i`) und die Regel nicht `requireTwoSignals` setzt,
3. `.*` ohne Begrenzung vorkommt (stattdessen `[^"]{0,200}`),
4. ein Cookie-Präfix ≤ 2 Zeichen ohne Unterstrich-Kontext hat oder in zwei Regeln vorkommt,
5. dasselbe Pattern in zwei Regeln steht (außer bei expliziter `implies`-Beziehung),
6. `meta.tests` fehlt oder ein positiver bzw. negativer Testfall nicht wie erwartet matcht,
7. eine Kategorie nicht in `CATEGORY_TO_BLOCK` steht und nicht explizit als „kein Block“ markiert ist,
8. ein Regex auf einem 2-MB-Fixture länger als 20 ms läuft.

Existierende Verstöße kommen in eine Baseline-Datei (`tests/fixtures/rules-lint-baseline.json`), damit der Check sofort grün starten kann und nur neue Verstöße blockiert.

### 6.4 CI und Dependabot

```
.github/
  workflows/
    rules.yml          # on: pull_request (paths: project/server/src/services/**, tests/**)
                       # jobs: npm ci → tsc --noEmit → npm test (inkl. golden, collision, lint)
                       #       → Artefakt rule-report.md als PR-Kommentar (Diff der Detections pro Golden-Site)
    stale-rules.yml    # on: schedule (wöchentlich Mo 06:00) + workflow_dispatch → scripts/stale-rule-monitor.ts
  dependabot.yml       # ecosystems: npm (/project/server, /project/client), pip (/project/server/python),
                       # github-actions (/); interval weekly; groups: playwright, typescript-eslint
```

Dependabot ist hier doppelt relevant. Zum einen hält es die Abhängigkeiten aktuell. Zum anderen verändern Upgrades von Playwright bzw. Scrapling das gesammelte `ScrapedData`. Der Golden-Test zeigt solche Verschiebungen sofort.

### 6.5 Stale-Rule-Monitor

`scripts/stale-rule-monitor.ts` läuft wöchentlich, öffnet die DB read-only und gibt `docs/rule-health.md` sowie optional ein GitHub-Issue aus. Er meldet:

| Signal | Schwelle | Aktion |
|---|---|---|
| `meta.lastVerified` älter als 180 Tage | – | Issue „Regel X verifizieren“ an `owner` |
| Regel hat in den letzten 90 Tagen / N ≥ 200 Analysen nie gefeuert | 0 Treffer | Prüfen: Vendor-Host geändert? (wie Evergage → evgnet) |
| Regel feuert auf > 60 % aller Analysen | Anteil | Verdacht auf Fehltreffer (Bootstrap-Muster) |
| Regel feuert > 80 % nur weak | Anteil | `requireTwoSignals` setzen oder Pattern schärfen |
| OP-Abgleich: OP sieht Tag, Engine nicht (für Sites mit OP-Audit) | Delta | Lücke → neue Regel aus OP-Tag-Namen vorschlagen |
| Vendor-Doku-URL (`meta.docsUrl`) liefert 404 / Redirect | HTTP | Doku-Link aktualisieren, Regel prüfen |
| `status: 'sunset'` und `sunsetDate` < heute − 365 Tage | Datum | Regel entfernen |

**Voraussetzung:** Die Analyse sollte pro Detection die gematchten Pattern-IDs und die `scriptSrc`-Hosts speichern, nicht nur Namen. Nur dann lassen sich „nie feuernde Patterns“ innerhalb einer Regel finden. Der Speicheraufwand ist gering, denn ein Host-Set pro Analyse reicht.

### 6.6 Ablauf für neue oder geänderte Regeln

1. Vendor-Doku lesen und `docsUrl` setzen.
2. Mindestens ein starkes Signal festlegen (Host mit Anker, Request oder Cookie) und HTML nur als Zusatz verwenden.
3. Je einen positiven und einen negativen `meta.tests`-Fall anlegen; der negative Fall ist ein typischer Substring-Nachbar.
4. Die URL in `collision/vendor-urls.json` aufnehmen.
5. Lokal `npm test` ausführen. Lint, Golden- und Kollisionstests müssen grün sein.
6. `lastVerified` auf das aktuelle Datum setzen.

## 7. Priorisierte Maßnahmen

1. **Sofort** (Fehltreffer mit hoher Konfidenz): Segment-Cookies, Azure-Header, `/signal\.co/`, `/media\.net/`, `/ember/`, `/econda/`, `/cal\.com/`, `/turbo/`, Angular `ng-app`, Contentful-Wort, Bootstrap-Heuristik, Cookie-Präfix-Engine.
2. **Kurzfristig:** Doppelregeln zusammenführen (HubSpot, Qubit, Insider, Mixpanel, Emarsys, Coveo, Tealium AudienceStream, AEM Assets), AdSense von Google Ads trennen, Meta SDK von Meta Pixel trennen, die 24 Vendor-Lücken schließen.
3. **Mittelfristig:** Die 49 Wort-Regeln auf technische Artefakte umstellen oder mit `requireTwoSignals` absichern, Versions-Extraktion pro Regel einführen, Regel-Lint, Golden Corpus und Stale-Monitor aufbauen.

Alle Einzelmaßnahmen mit Ersatz-Regex und Testfall stehen in `04-rule-fixes.json`.

## 8. Umsetzungsstand und Folgeaufgaben

**Umgesetzt:**
- Fixes aus `04-rule-fixes.json` in `customDetectors.ts`; Regressionstests stehen in `project/server/tests/ruleQuality.test.ts`.
- Strikte Cookie-Präfixe in der Engine (`cookieMatches`) und Deckel pro Regel über `maxConfidence`.
- Regel-Lint (6.3, Minimalfassung) in `project/server/tests/rules.lint.test.ts`. Er prüft:
  - eindeutige Namen und keine doppelten Patterns,
  - bekannte Kategorien,
  - die Kollisions-URL-Liste,
  - nackte Produktwort-HTML-Regeln (mit Baseline),
  - Cookie-Länge und `maxConfidence`-Bereich.
- Dependabot (6.4): `.github/dependabot.yml`, wöchentlich, für npm in `project/`, `project/server` und `project/client` sowie für pip in `project/server`.

**Folgeaufgaben (noch offen):**
- **Golden Corpus (6.2):** gespeicherte HTML-, Request- und Cookie-Snapshots echter Referenz-Sites mit erwarteter Erkennungsliste unter `project/server/tests/golden/`.
- **Stale-Rule-Monitor (6.5):** Er braucht vorher die Speicherung der gematchten Pattern-IDs bzw. Hosts je Detection. Danach das Skript `scripts/stale-rule-monitor.ts` bauen.
- **Regel-Metadaten (6.1):** Felder `docsUrl`, `lastVerified` und `meta.tests` je Regel; heute liegen die Testfälle nur zentral in `ruleQuality.test.ts`.
- **CI-Workflow** (6.4), der `tsc` und `npm test` bei Pull Requests ausführt.
