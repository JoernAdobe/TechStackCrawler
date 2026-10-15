# Offene Fingerprint-Datenbanken für den TechStack Analyzer

**Stand:** 15. Oktober 2026
**Scope:** Bewertung externer, (teil-)offener Technologie-Erkennungs- und Tracker-Datenbanken als Ergänzung zu unseren ~549 handgepflegten Regeln in
`project/server/src/services/customDetectors.ts`. Reine Recherche — es wurde kein Code geändert und nichts committet.

---

## 0. Ausgangslage: Was wir heute schon abdecken

`DETECTION_RULES` in `customDetectors.ts` enthält aktuell **549 Regeln** in 29 Kategorien (Stand dieser Analyse, per `grep -c "name: '"`). Die größten Blöcke:

| Kategorie | Anzahl | Beispiele |
|---|---|---|
| Advertising / Ad Tech | 67 | Google Ads, Criteo, The Trade Desk, Prebid.js, Awin |
| Analytics | 55 | Adobe Analytics, GA4, Mixpanel, Contentsquare, Piano |
| CMS | 51 | AEM, WordPress, Sitecore, Contentful, Storyblok |
| ESP / Marketing Automation | 43 | Marketo, Braze, Klaviyo, Salesforce Marketing Cloud |
| eCommerce | 29 | Adobe Commerce, Shopify, SAP Commerce Cloud |
| Personalization & Optimization | 26 | Adobe Target, Optimizely, Dynamic Yield, Monetate |
| Customer Support / Chat | 27 | Intercom, Zendesk, Drift, Genesys |
| Consent / CMP | 20 | OneTrust, Cookiebot, Usercentrics, Didomi |
| CDP | 19 | Adobe RTCDP, Segment, Tealium, mParticle, Lytics |
| Hosting/CDN, JS/CSS-Frameworks, DAM, CRM, Payments, Search, Social/UGC, Video, Forms, Scheduling, Performance, Security, Push, Accessibility, Popups, EDW | je 1–20 | — |

Die Bibliothek ist für eine handgepflegte Martech-Taxonomie bereits ungewöhnlich breit (Adobe Audience Manager bis Ortto). Die Recherche unten zeigt trotzdem reale Lücken, v. a. bei neueren Adobe-Konkurrenzprodukten (Salesforce Data Cloud, Oracle Maxymiser) und bei Cookie→Vendor-Mapping-Daten, die wir komplett nicht haben.

---

## 1. Quellen im Detail

### 1.1 enthec/webappanalyzer (Wappalyzer-Community-Fork)

- **Link:** https://github.com/enthec/webappanalyzer
- **Was:** Fortführung des öffentlichen Wappalyzer-Regelsatzes, nachdem AliasIO/wappalyzer im August 2023 privatisiert wurde (`wappalyzer/wappalyzer` ist seitdem privat). ~7.600 Technologie-Fingerprints in `src/technologies/*.json` (alphabetisch sortiert, A–Z + `_.json` für Sonderzeichen).
- **Format:** Ein JSON-Objekt pro Technologie mit `cats`, `cookies`, `dom`, `headers`, `js`, `meta`, `scriptSrc`, `html`, `xhr`, `implies`, `excludes`, `cpe`, `website` — strukturell fast identisch zu unserem eigenen `DetectionRule`-Schema (scriptSrc/requests/html/cookies/headers/jsGlobals/meta), nur als JSON statt TypeScript.
- **Lizenz:** **GPL-3.0** (`LICENSE`-Datei, per GitHub API verifiziert: `GNU GENERAL PUBLIC LICENSE Version 3`). ⚠️ Copyleft.
- **Nutzung in einem internen Closed-Source-Tool:**
  - *Code/JSON 1:1 einbinden oder daraus abgeleitete Datenstrukturen direkt ausliefern* → riskant. GPL-3 verlangt bei Distribution abgeleiteter Werke, dass diese ebenfalls unter GPL-3 stehen bzw. der Quellcode offengelegt wird. Da unser Tool proprietär bleibt, ist ein direktes Kopieren der JSON-Regeln in unser Repo **nicht sauber lizenzkonform**, wenn wir es weitergeben/deployen (auch intern an andere Teams/BUs kann als "Distribution" zählen, abhängig von Auslegung).
  - *Fakten extrahieren (Technologie heißt X, nutzt Cookie Y, Script-Pfad enthält Z) und davon inspiriert eigene Regeln neu schreiben* → deutlich unkritischer. Reine Fakten (Produktnamen, bekannte Cookie-Namen, URL-Muster) sind in den meisten Rechtsordnungen nicht urheberrechtsfähig; nur die konkrete Formulierung/Struktur der Regel ist es. Empfehlung: **als Zweitmeinungs-/Recherchequelle nutzen, Regeln selbst neu formulieren**, Namen in Changelog/Commit-Message referenzieren statt Copy-Paste.
- **Update-Frequenz:** sehr hoch — mehrmals täglich/wöchentlich via Community-PRs (GitHub Actions-Validator aktiv).
- **Relevanz Martech:** sehr hoch, deckt auch Nischenprodukte ab (siehe Gap-Analyse Abschnitt 2).

### 1.2 projectdiscovery/wappalyzergo

- **Link:** https://github.com/projectdiscovery/wappalyzergo
- **Was:** Performante Go-Portierung der Wappalyzer-Erkennungslogik; lädt die Fingerprint-Datenbank automatisch via `update-fingerprints`-Tool (Quelle: enthec-Fork bzw. eigene normalisierte Kopie).
- **Lizenz:** **MIT** (eigener Code, `LICENSE.md`, verifiziert). Die **Daten** stammen aber letztlich aus derselben GPL-3-Quelle (enthec) — MIT gilt nur für den Go-Wrapper, nicht automatisch für die mitgelieferte Fingerprint-DB.
- **Nutzung:** Der Go-Code selbst ist unkritisch einzubinden (falls wir je einen Go-Dienst bauen), aber das Lizenzrisiko der zugrunde liegenden Daten bleibt wie bei 1.1.
- **Relevanz:** Für uns als TypeScript/Node-Projekt nicht direkt als Library nutzbar, aber die normalisierten Regex-Pattern sind eine gute **Referenzquelle** zum Abgleich (z. B. als zweite Meinung in einem Review-Skript, nicht im Produktivcode).

### 1.3 tunetheweb/wappalyzer — HTTP Archive Technologies

- **Recherche-Hinweis:** Es existiert **kein eigenständiges Repo** `tunetheweb/wappalyzer` mehr (404 beim Abruf); Rick Viscomi (`tunetheweb`) ist Maintainer des **HTTP Archive**-Projekts. Die relevante Quelle ist:
  - **HTTP Archive / Web Almanac:** https://httparchive.org/ und https://almanac.httparchive.org/
  - **Methodik:** https://almanac.httparchive.org/en/2024/methodology — HTTP Archive crawlt monatlich Millionen Websites und nutzt einen eigenen Wappalyzer-Fork zur Technologieerkennung; Rohdaten liegen öffentlich in Google BigQuery (`httparchive.org`-Dataset, Projekt `httparchive`).
  - **Lizenz:** HTTP Archive-Daten sind **öffentlich/BigQuery-zugänglich** (im Kern CC-BY-artige Nutzung für Auswertungen; die zugrunde liegenden Wappalyzer-Pattern selbst unterliegen weiterhin GPL-3 von enthec).
  - **Nutzung:** Ideal für **Marktanteils-Validierung** ("Wie verbreitet ist Technologie X wirklich auf dem Web?") statt für Pattern-Import. Kein Ersatz für Live-Erkennung, aber gute Priorisierungshilfe (siehe Abschnitt 3).
  - **Aktualisierung:** monatlich (Crawl), jährlich (Web Almanac Report).

### 1.4 AliasIO/wappalyzer (Original-Repo)

- **Status:** **Nicht mehr existent / 404** unter `github.com/AliasIO/wappalyzer`. Wappalyzer Inc. hat das Repo im August 2023 privatisiert und bietet heute nur noch eine kommerzielle API (wappalyzer.com) an.
- **Konsequenz:** Für offene Nutzung ist der enthec-Fork (1.1) der De-facto-Nachfolger; das Original ist kein nutzbarer Kandidat mehr.

### 1.5 retire.js (JS-Library-Versionen & CVEs)

- **Link:** https://github.com/RetireJS/retire.js (Datenfile: `repository/jsrepository.json`)
- **Was:** Datenbank bekannter JavaScript-Bibliotheken mit Versionserkennungs-Regex (`extractors.func`, `filecontent`, `filename`, `hashes`) und zugehörigen **CVEs/Schwachstellen** je Versionsbereich (`below`/`atOrAbove`, `severity`, `identifiers.CVE`).
- **Lizenz:** **Apache-2.0** (`node/package.json: "license": "Apache-2.0"`). ✅ Unkritisch — Apache-2.0 erlaubt Nutzung, Modifikation und auch Einbindung in proprietäre Software, verlangt nur Attribution und Lizenzhinweis-Beibehaltung bei Weitergabe des Codes selbst (nicht bei reiner Datennutzung).
- **Format:** JSON, ca. 580 KB, mehrere hundert JS-Bibliotheken (jQuery, Angular, Bootstrap, Lodash, Handlebars, Swiper, GSAP, etc.) inkl. Versions-Patterns.
- **Aktualisierungsfrequenz:** laufend, mehrere Releases/Monat.
- **Relevanz Martech:** mittel-direkt — liefert uns **Versionserkennung** für bereits erkannte JS-Frameworks (React, jQuery, Bootstrap) plus CVE-Kontext, der im Pre-Sales nützlich ist ("Kunde nutzt jQuery 1.12 mit bekannten XSS-CVEs" als Gesprächsaufhänger für Sicherheits-/Modernisierungs-Pitch). Kein direkter Martech-Vendor-Fingerprint-Ersatz, aber eine sinnvolle **Zusatzschicht** für unsere bestehenden JS-Framework-Regeln (Abschnitt 3614 ff. in `customDetectors.ts`).
- **Empfehlung:** Unkompliziertester Import der ganzen Recherche — Apache-2.0 erlaubt direkten Datenimport inkl. Attribution im Code-Kommentar/Lizenzdatei.

### 1.6 Ghostery TrackerDB

- **Link:** https://github.com/ghostery/trackerdb , NPM-Paket `@ghostery/trackerdb`
- **Was:** Tracker-Datenbank mit Domain/URL → Organisation/Kategorie-Mapping (u. a. Basis für WhoTracks.me-Reports), inkl. Filter-Patterns (`||domain.com^$3p`).
- **Lizenz:** **CC-BY-NC-SA-4.0** (`LICENSE`-Datei, verifiziert: "Licensed under the CC-BY-NC-SA-4.0 license"). ⚠️ **NonCommercial-Klausel.**
- **Nutzung in einem Pre-Sales-Tool bei Adobe:** Problematisch. Auch wenn das Tool "intern" ist, dient es einem kommerziellen Vertriebsprozess (Pre-Sales-Analyse für Deals) — das kann als "commercial advantage"-Nutzung ausgelegt werden, was die NC-Klausel verbietet. **Nicht ohne gesonderte Lizenz von Ghostery nutzbar.**
- **Relevanz:** Hohe fachliche Qualität (Organisation-Zuordnung von Trackern, z. B. "wer steckt hinter dieser Analytics-Domain"), aber lizenzrechtlich gesperrt für unseren Use-Case, außer wir fragen Ghostery nach einer kommerziellen Lizenz an.

### 1.7 DuckDuckGo Tracker Radar

- **Link:** https://github.com/duckduckgo/tracker-radar
- **Was:** Domain-Metadaten (Parent Entity, Prevalence, Fingerprinting-Nutzung, Cookies, Privacy Policy, Performance) für die häufigsten Third-Party-Domains.
- **Lizenz:** **CC BY-NC-SA 4.0** (verifiziert im Repo-README: "licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License"). ⚠️ Gleiches Problem wie 1.6 — NonCommercial, "If you'd like to license the list for commercial use, please reach out" (DDG bietet explizit kommerzielle Lizenzierung gegen Anfrage an).
- **Relevanz:** Gute Datenqualität zur Organisation-Zuordnung von Trackerdomains; **nur mit expliziter kommerzieller Lizenz von DuckDuckGo nutzbar.**

### 1.8 disconnect.me Tracking Protection Lists

- **Link:** https://github.com/disconnectme/disconnect-tracking-protection
- **Lizenz:** **CC BY-NC-SA 4.0**, identische Klausel ("Please email support@disconnect.me if you'd like to license the lists for commercial use"). ⚠️ Gleiches NC-Problem.
- **Relevanz:** gering-mittel, eher Ad-Blocking-fokussiert als Vendor-Fingerprinting.

### 1.9 EasyList / EasyPrivacy

- **Link:** https://easylist.to/ (EasyPrivacy: Tracker-/Analytics-Blocklist im AdBlock-Filtersyntax)
- **Lizenz:** **Dual-Lizenz GPL-3.0-or-later ODER CC BY-SA 3.0** (mit Pflicht-Attribution "The EasyList authors"). ✅ Kommerzielle Nutzung ist laut Lizenztext ausdrücklich erlaubt, **aber** Copyleft-Pflicht: abgeleitete/verteilte Werke müssen unter derselben Lizenz stehen. Für reine *interne* Auswertung (nicht-Distribution) unkritisch; bei Weitergabe der abgeleiteten Daten/Regeln an Dritte würde Copyleft greifen.
- **Format:** Adblock-Filter-Syntax (`||domain.com^`), kein strukturiertes JSON — müsste für unser Schema geparst/transformiert werden.
- **Relevanz:** gut als **Blockliste-Abgleich** (ist ein erkannter Domain-Hit überhaupt ein Tracker?), weniger als Vendor-Namensquelle.

### 1.10 Open Cookie Database (jkwakman/Open-Cookie-Database)

- **Link:** https://github.com/jkwakman/Open-Cookie-Database
- **Was:** CSV/JSON-Datenbank von Cookie-Namen → Kategorie (Functional/Personalization/Analytics/Marketing/Security), inkl. Wildcard-Flag für dynamische Cookie-Namen (z. B. `_gac_<ID>`). Basis u. a. für das offizielle **EDPB Website Auditing Tool** der EU.
- **Lizenz:** **Apache-2.0** (verifiziert, `LICENSE`-Datei). ✅ Unkritisch, kommerzielle Nutzung und Einbindung in proprietäre Software erlaubt.
- **Format:** CSV + JSON (`open-cookie-database.json`), leichtgewichtig (~Hundert KB), zusätzlich eine EDPB-spezifische JSON-Variante.
- **Aktualisierungsfrequenz:** Community-PRs, mehrmals im Jahr.
- **Relevanz Martech:** **hoch** — das ist exakt die Lücke, die wir heute nicht abdecken: Cookie-Name → Vendor/Kategorie-Mapping. Unsere Regeln nutzen zwar teils `cookies`-Signale pro Technologie, aber es gibt keine generische Cookie→Vendor-Tabelle als Fallback/Zweitsignal.
- **Empfehlung:** **Sofort-Kandidat für Import** (Apache-2.0, klein, strukturiert, hohe Relevanz).

### 1.11 WhatRuns

- **Link:** https://www.whatruns.com/
- **Befund:** Keine offengelegte Lizenz für die Fingerprint-Datenbank; die API ist primär für die Browser-Extension gedacht. Automatisiertes Scraping/Bulk-Abfragen verstößt in der Regel gegen die ToS kommerzieller Erkennungsdienste (allgemeines Muster: Rate-Limits, Verbot von Reverse Engineering/Datenbank-Nachbau, siehe auch BuiltWith unten).
- **Bewertung:** **Nicht empfohlen** ohne direkte Anfrage/kommerzielle Lizenz bei WhatRuns (Francisco Partners/Freemium-Modell). Kein verifizierbarer offener Lizenztext gefunden.

### 1.12 BuiltWith Free API

- **Link:** https://api.builtwith.com/free-api , Hintergrund: https://blog.builtwith.com/2017/07/30/free-api/ (Terms of Use unter builtwith.com/terms, nicht per automatisiertem Link-Checker validierbar wegen serverseitiger Gzip-Antwort, Inhalt wurde manuell per `curl` verifiziert: HTTP 200)
- **Lizenz/ToS:** Eigene proprietäre Nutzungsbedingungen. Erlaubt: Abfrage einzelner Domains für **interne Geschäftszwecke** (genau unser Pre-Sales-Use-Case passt hier potenziell!). **Nicht erlaubt:** Bulk-Export/Nachbau der Gesamtdatenbank, Weiterverkauf, automatisiertes Massen-Scraping über die Rate-Limits hinaus (1 req/s im Free-Tier), Nutzung zum Training/Betrieb eines konkurrierenden Tech-Erkennungsdienstes.
- **Einordnung:** Kein "Update-Quelle für unsere Regel-Bibliothek" (wir dürfen die BuiltWith-Datenbank nicht abziehen/nachbauen), aber **denkbar als Live-Zweitmeinungs-API pro Domain** innerhalb der Rate-Limits — allerdings würde das potenziell "duplicate BuiltWith's own offering" verletzen, da unser Tool strukturell dasselbe tut (Tech-Erkennung für Pre-Sales). **Rechtlich heikel, vor Nutzung Adobe Legal/Procurement einbinden**, ggf. kommerziellen BuiltWith-Enterprise-Vertrag prüfen statt Free-Tier.

### 1.13 Netcraft

- **Befund:** Netcraft bietet kommerzielle Site-Report-/API-Dienste (Hosting-Provider-Erkennung, Phishing-Takedowns), keine offene Fingerprint-Datenbank zum Download. Kein geeigneter Kandidat für Regel-Import; höchstens punktuelle manuelle Recherche für Hosting/CDN-Zuordnung.

### 1.14 cdnjs

- **Link:** https://cdnjs.com / https://github.com/cdnjs/cdnjs
- **Was:** Katalog von CDN-gehosteten JS/CSS-Bibliotheken (Name, Version, Pfad-Muster `cdnjs.cloudflare.com/ajax/libs/<name>/<version>/...`).
- **Lizenz:** Metadaten/API unter permissiven Bedingungen (cdnjs-Projekt selbst **MIT**-artig, einzelne Libraries behalten ihre jeweilige Originallizenz).
- **Relevanz:** Nützlich als **Pfad-Muster-Quelle** für unsere `scriptSrc`-Regeln bei JS-Frameworks (Abschnitt "JavaScript Frameworks" in unserer Regel-Datei), nicht für Martech-spezifische Vendor-Erkennung. Geringe Priorität, aber risikofrei nutzbar (Fakten/Pfadmuster, kein Copyleft-Datenimport nötig).

---

## 2. Lizenz-Ampel (Zusammenfassung)

| Quelle | Lizenz | Ampel | Nutzung in unserem Tool |
|---|---|---|---|
| Open Cookie Database | Apache-2.0 | 🟢 | Direkter Import als Cookie→Vendor-Mapping-Tabelle |
| retire.js (jsrepository.json) | Apache-2.0 | 🟢 | Direkter Import für JS-Lib-Versionen + CVE-Kontext |
| cdnjs (Katalog/Pfadmuster) | MIT-artig | 🟢 | Fakten/Pfadmuster frei nutzbar |
| EasyList / EasyPrivacy | GPL-3.0 oder CC BY-SA 3.0 (Wahlrecht) | 🟡 | Nur intern, nicht weiterverteilen; bei Copy Attribution Pflicht |
| HTTP Archive / Web Almanac (BigQuery) | Daten öffentlich, zugrunde liegende Pattern GPL-3 | 🟡 | Nur für Marktanteils-Validierung, kein Pattern-Copy |
| enthec/webappanalyzer | **GPL-3.0** | 🟠 | Nur als Recherche-/Zweitmeinungsquelle, Regeln selbst neu schreiben, nicht JSON kopieren |
| projectdiscovery/wappalyzergo | MIT (Code) / GPL-3 (Daten) | 🟠 | Gleiche Einschränkung wie enthec bzgl. Daten |
| BuiltWith Free API | Proprietäre ToS | 🟠 | Nur Einzelabfragen im Rahmen ToS, kein Bulk-Import, vorher Legal einbinden |
| WhatRuns | Keine offene Lizenz / ToS unklar | 🔴 | Nicht nutzen ohne Partnerschaft |
| Ghostery TrackerDB | CC BY-NC-SA 4.0 | 🔴 | NonCommercial-Klausel verbietet Pre-Sales-Nutzung ohne Sonderlizenz |
| DuckDuckGo Tracker Radar | CC BY-NC-SA 4.0 | 🔴 | Dito, außer kommerzielle Lizenz bei DDG angefragt |
| disconnect.me Lists | CC BY-NC-SA 4.0 | 🔴 | Dito |
| Netcraft | Kommerziell, kein Datendownload | 🔴 | Kein Kandidat |

🟢 = unkritisch direkt nutzbar · 🟡 = nutzbar mit Auflagen (Attribution/keine Weiterverteilung) · 🟠 = nur als Zweitmeinung/Inspiration, nicht 1:1 kopieren · 🔴 = nicht nutzbar ohne gesonderte kommerzielle Lizenz

---

## 3. Abdeckungs-Vergleich: Top 40 fehlende Martech-Technologien

Methodik: Die ~7.600 Technologienamen aus `enthec/webappanalyzer/src/technologies/*.json` wurden heruntergeladen und gegen unsere 549 Regelnamen abgeglichen (nur zur **Namens-Identifikation**, keine Pattern übernommen — siehe Lizenz-Hinweis 🟠 oben). Priorisierung nach Pre-Sales-Relevanz für Adobe Experience Cloud (direkte Konkurrenzprodukte zuerst).

### A. Sehr hohe Priorität — direkte Adobe-Konkurrenzprodukte (fehlen komplett)

| # | Technologie | Kategorie | Warum wichtig |
|---|---|---|---|
| 1 | **Salesforce Data Cloud** | CDP | Zentrales RTCDP-Konkurrenzprodukt seit 2023/24-Rebranding (vorher Genie/CDP); bisher nur "Salesforce DMP (Krux)" (End-of-Life-Produkt) in unserer Liste |
| 2 | **Oracle Maxymiser** | Personalization | Direktes Adobe-Target-Konkurrenzprodukt (A/B-Testing & Personalisierung), in enthec als `Oracle Maxymiser` vorhanden |
| 3 | **Salesforce Audience Studio** | DMP | Nachfolgename von Krux/DMP, bei enthec separat gelistet, bei uns nicht |
| 4 | **IBM Tealeaf** | Analytics / Session Replay | Konkurrenz zu Adobe Analytics/Contentsquare bei Enterprise-Kunden |
| 5 | **Celebrus (D4t4 Solutions)** | CDP | Real-Time-CDP-Konkurrent im Enterprise-Segment (nicht in enthec, aber bekannter Markt-Player — müsste manuell recherchiert werden) |
| 6 | **Epsilon PeopleCloud** | CDP / ESP | Großer Agentur-/CDP-Wettbewerber (nicht in enthec gefunden, manuell nachpflegen) |
| 7 | **Acquia Customer Data Platform** | CDP | Teil des Drupal/Acquia-Ökosystems, direkter RTCDP-Wettbewerber im Open-Source-CMS-Umfeld |
| 8 | **Acquia Personalization** | Personalization | Pendant zu Adobe Target im Acquia-Stack |
| 9 | **Acquia Content Hub / Site Studio** | DAM/CMS | Relevanter Mitbewerber zu AEM Assets |
| 10 | **Oracle Infinity** | Analytics | Oracle-Nachfolgeprodukt für Web-Analytics, Enterprise-Konkurrenz zu Adobe Analytics |

### B. Hohe Priorität — ESP / Personalization / CMP-Lücken

| # | Technologie | Kategorie | Hinweis |
|---|---|---|---|
| 11 | **Marigold** (Dachmarke von Cheetah Digital, CM Group, Sailthru, Campaign Monitor) | ESP | Wir haben Einzelmarken (Sailthru, Campaign Monitor), aber nicht die 2023 vereinheitlichte Dachmarke „Marigold Engage/Grow" |
| 12 | **Bluecore** | ESP/Personalization | Retail-fokussierte Personalisierung/ESP, direkter AJO/Target-Wettbewerber im E-Commerce |
| 13 | **Movable Ink** | Personalization | Content-Personalisierung in E-Mails, relevanter Adobe-Journey-Optimizer-Wettbewerber |
| 14 | **Intellimize** | Personalization | KI-gestütztes A/B-Testing, Target-Wettbewerber |
| 15 | **Mutiny** | Personalization | B2B-Website-Personalisierung |
| 16 | **Barilliance** | Personalization | E-Commerce-Personalisierung/Recommendations |
| 17 | **Act-On** | ESP/Marketing Automation | Mittelstands-Marketing-Automation, Marketo-Wettbewerber |
| 18 | **SharpSpring** | ESP/Marketing Automation | SMB-Marketing-Automation (Teil von Marigold) |
| 19 | **Netcore Cloud** | ESP/CDP | Starker Player in APAC/EMEA (ähnlich CleverTap/MoEngage, die wir schon haben) |
| 20 | **Ketch** | Consent/CMP | Moderner CMP/Privacy-Wettbewerber zu OneTrust/Usercentrics |
| 21 | **Transcend** | Consent/Privacy | Privacy-Infrastruktur-Anbieter (DSAR/Consent), zunehmend Enterprise-relevant |
| 22 | **Yieldify** | Personalization/CRO | On-Site-Personalisierung & CRO |
| 23 | **Ordergroove** | eCommerce/Subscription | Subscription-Commerce-Layer |
| 24 | **Blueshift** | CDP/ESP | Cross-Channel-CDP mit KI-Fokus |
| 25 | **Klevu** *(bereits vorhanden? prüfen)* | Search | War in unserer Liste bereits vorhanden — als Kontrolle markiert, keine Aktion nötig |

### C. Mittlere Priorität — CMS/DAM/Commerce-Lücken

| # | Technologie | Kategorie | Hinweis |
|---|---|---|---|
| 26 | **Liferay (DXP)** | CMS | Großer Java-basierter Digital-Experience-Platform-Wettbewerber zu AEM, fehlt komplett |
| 27 | **Jahia (DX)** | CMS | Enterprise-CMS/DXP, EU-Markt relevant |
| 28 | **OpenText Web Solutions** | CMS/DAM | Ex-Vignette/TeamSite-Erbe, Enterprise-Wettbewerber |
| 29 | **Backbase** | CMS/Digital Banking | Branchenspezifische DXP (Finance), zunehmend AEM-Konkurrenz im Banking-Vertikal |
| 30 | **Zmags Creator** | eCommerce/Content | Digital-Shelf/Content-Experience-Anbieter |
| 31 | **Commerce Layer** | eCommerce | Headless-Commerce-API, moderner Adobe-Commerce-Headless-Wettbewerber |
| 32 | **Image Relay** | DAM | Mittelstands-DAM-Alternative zu Bynder/Canto |
| 33 | **Webtrends** | Analytics | Legacy-Enterprise-Analytics, bei Altkunden noch im Einsatz (Migrations-Opportunity!) |

### D. Ergänzend — Cookie/Consent-Erkennung via Open Cookie Database (kein Vendor-Rule, sondern generisches Mapping)

| # | Lücke | Nutzen |
|---|---|---|
| 34 | **Generisches Cookie→Kategorie-Fallback** (Functional/Analytics/Marketing/Security) | Erkennt auch Vendoren, für die wir (noch) keine dedizierte Regel haben, zumindest kategorisch |
| 35 | **Wildcard-Cookie-Muster** (z. B. `_gac_<ID>`, `_hjSessionUser_<ID>`) | Reduziert False-Negatives bei dynamischen Cookie-Namen, die unsere statischen `cookies`-Signale heute verpassen |

### E. JS-Framework-Versionstiefe via retire.js (Ergänzung zu bestehenden Regeln, keine neuen Vendoren)

| # | Lücke | Nutzen |
|---|---|---|
| 36 | **Versionserkennung + CVE-Tag** für bereits erkannte Frameworks (jQuery, Angular, Bootstrap, Lodash, Handlebars, Swiper) | Pre-Sales-Storytelling: "veraltete, CVE-behaftete Bibliothek" als Security-/Modernisierungs-Hook |
| 37 | **Node.js-Modul-Scanning-Logik** (sofern wir je Server-Side-Scans machen) | Für zukünftige SBOM-/Supply-Chain-Erweiterung |

### F. Sonstige, niedrigere Priorität (Vollständigkeit)

| # | Technologie | Kategorie |
|---|---|---|
| 38 | **Proof Factor** | Social Proof/CRO (Konkurrenz zu unserer "Popups/CRO"-Kategorie) |
| 39 | **Attentive** *(bereits vorhanden — Kontrollzeile)* | ESP/SMS |
| 40 | **Sitecore XM Cloud / Content Hub** (als separate Einträge statt nur "Sitecore") | CMS/DAM — moderne SaaS-Produktlinie von Sitecore, die sich von der On-Prem-"Sitecore"-Regel unterscheidet und eigene Signale hat |

> Hinweis: Punkte 25 und 39 sind als Kontrollzeilen markiert — bei der automatisierten Namens-Gegenprüfung waren sie in unserer Liste bereits vorhanden (Klevu unter "Search", Attentive unter "ESP"); sie werden hier nur aufgeführt, um Transparenz über die Abgleichmethode zu schaffen.

---

## 4. Empfohlener, lizenzsicherer Sync-Mechanismus

### 4.1 Grundprinzip: „Fakten rein, Code/Patterns selbst geschrieben"

Um GPL-3-Copyleft-Risiken (enthec/wappalyzergo) und NonCommercial-Risiken (Ghostery, DDG, disconnect.me) zu vermeiden, synchronisieren wir **niemals automatisiert fremden Code/JSON 1:1** in `customDetectors.ts`. Stattdessen:

1. **Wöchentlicher Recherche-Job (read-only, kein Auto-Merge):**
   - Ein geplanter Job (z. B. GitHub Action, wöchentlich) lädt die 🟢/🟡-Quellen (Open Cookie Database, retire.js `jsrepository.json`, optional EasyPrivacy-Diff) herunter und vergleicht **nur Namen/Domains/Cookie-Keys** gegen unsere bestehenden Regeln.
   - Für 🟠-Quellen (enthec/webappanalyzer) wird **nur ein Namens-Diff** erzeugt ("neue Technologie X seit letztem Lauf gesehen, URL/Website: ..."), **keine Pattern-Übernahme**. Das Ergebnis ist ein Bericht/Issue für einen Menschen, kein automatischer Commit.
   - Output: ein Markdown/CSV-Report mit "Kandidaten für neue Regeln" (Name, Kategorie-Vorschlag, Quelle, Lizenz-Ampel), den ein Entwickler manuell in `customDetectors.ts` umsetzt (eigene Regex, eigene Formulierung).

2. **Direkter Datenimport (ohne Pattern-Schreibarbeit), nur für 🟢-Quellen:**
   - **Open Cookie Database** (Apache-2.0): als separate Tabelle/JSON-Asset ins Backend importieren (`cookieVendorMap.json` o. ä.), mit Attribution-Kommentar im Code ("Quelle: Open Cookie Database, github.com/jkwakman/Open-Cookie-Database, Apache-2.0"). Nutzung: zusätzliches **Fallback-Signal**, wenn ein Cookie erkannt wird, aber keine unserer 549 Regeln matcht — zeigt zumindest Kategorie (Analytics/Marketing/etc.) und ggf. bekannten Vendor an.
   - **retire.js `jsrepository.json`** (Apache-2.0): als Versions-/CVE-Anreicherung für bereits erkannte JS-Frameworks einbinden, ebenfalls mit Attribution-Kommentar.
   - Update-Rhythmus: wöchentlicher automatischer Pull + Diff-Check (reiner Datenaustausch, kein Pattern-Schreiben nötig, daher unkritisch automatisierbar).

3. **Validierungsquelle statt Datenquelle: HTTP Archive / Web Almanac**
   - Monatlich/jährlich prüfen, ob unsere Top-Technologien (nach Pre-Sales-Relevanz) in den aktuellen Web-Almanac-Zahlen an Marktanteil gewinnen/verlieren — nutzen, um Priorisierung der manuellen Regel-Pflege zu steuern (z. B. "Bluecore wächst laut Web Almanac X% im Jahr Y → Regel jetzt anlegen").

4. **Kommerzielle/eingeschränkte Quellen nur nach Freigabe:**
   - BuiltWith (Einzelabfragen im ToS-Rahmen), Ghostery TrackerDB, DuckDuckGo Tracker Radar, disconnect.me: **nicht automatisieren**, sondern vor Nutzung Rücksprache mit Adobe Legal/Procurement halten (NC-Klauseln bzw. proprietäre ToS). Falls freigegeben, separat dokumentieren.

5. **Governance:**
   - Jede neu übernommene Regel bekommt im Code-Kommentar eine Quellenangabe (z. B. `// Quelle: Recherche inspiriert von enthec/webappanalyzer (GPL-3, nur Namensreferenz, Pattern eigenständig formuliert)`), damit Herkunft und Lizenzlage für künftige Audits nachvollziehbar bleiben.
   - Der wöchentliche Diff-Report (Punkt 1) landet als GitHub Issue/PR-Vorschlag, kein automatischer Merge in `main`.

### 4.2 Konkrete nächste Schritte (Vorschlag, keine Umsetzung in diesem Research-Task)

1. Open Cookie Database (Apache-2.0) als `cookieVendorMap`-Datenasset importieren → schließt Lücke „generisches Cookie-Fallback".
2. retire.js `jsrepository.json` (Apache-2.0) für Versionserkennung der bereits unterstützten JS-Frameworks einbinden.
3. Die 10 Technologien aus Abschnitt 3.A (direkte Adobe-Konkurrenzprodukte) als neue, **selbst formulierte** Regeln in `customDetectors.ts` ergänzen (höchste Pre-Sales-Priorität).
4. Wöchentlichen Recherche-Diff-Job gegen enthec/webappanalyzer-Namen aufsetzen (nur Report, kein Auto-Merge).
5. Rechtliche Klärung mit Adobe Legal anstoßen für BuiltWith (Enterprise-Lizenz?) und ggf. Ghostery/DuckDuckGo-Sonderlizenzen, falls deren Organisationszuordnung (Domain→Firma) langfristig gewünscht ist.

---

## 5. Gaps & Unsicherheiten

- **Celebrus** und **Epsilon PeopleCloud** wurden in `enthec/webappanalyzer` **nicht gefunden** (0 Treffer bei Volltextsuche über alle 27 Buchstaben-Dateien) — ihre Relevanz basiert auf allgemeiner Marktkenntnis, nicht auf einer verifizierten offenen Fingerprint-Quelle. Für diese zwei Technologien müssten eigene Signale (Scripts, Cookies, Header) manuell recherchiert werden, bevor eine Regel sinnvoll ist.
- **WhatRuns, Netcraft:** Keine verifizierbaren offenen Lizenztexte für die Fingerprint-Datenbank gefunden; Bewertung basiert auf allgemeinen ToS-Mustern vergleichbarer Dienste, nicht auf Volltext-Einsicht in nicht-öffentliche Vertragsbedingungen.
- **"tunetheweb/wappalyzer"** als explizit genanntes Repo existiert nicht (404); es wurde durch die tatsächlich relevante HTTP-Archive/Web-Almanac-Infrastruktur ersetzt, die derselbe Maintainer (Rick Viscomi) mitbetreibt.
- Die enthec-Namens-Gegenprüfung (Abschnitt 3) wurde nur gegen **Technologienamen**, nicht gegen die feingranularen Match-Patterns durchgeführt (bewusst, aus Lizenzgründen). Es ist möglich, dass einzelne der 40 gelisteten Produkte bereits implizit über Mutterkonzern-Regeln (z. B. "Sitecore" deckt theoretisch auch XM Cloud ab) teilweise erkannt werden — eine Live-Testung gegen echte Kundenseiten wäre der nächste sinnvolle Schritt, um Priorität 26–40 zu verifizieren.
- Keine Pattern/Regex-Inhalte aus GPL-3- oder CC-BY-NC-SA-Quellen wurden in dieses Dokument oder in den Code übernommen — nur Produktnamen (Fakten) zur Gap-Identifikation.

---

## Quellenverzeichnis (Links)

- enthec/webappanalyzer: https://github.com/enthec/webappanalyzer
- enthec/webappanalyzer Lizenz (GPL-3.0): https://github.com/enthec/webappanalyzer/blob/main/LICENSE
- projectdiscovery/wappalyzergo: https://github.com/projectdiscovery/wappalyzergo
- projectdiscovery/wappalyzergo Lizenz (MIT): https://github.com/projectdiscovery/wappalyzergo/blob/main/LICENSE.md
- HTTP Archive: https://httparchive.org/
- Web Almanac Methodik: https://almanac.httparchive.org/en/2024/methodology
- RetireJS/retire.js: https://github.com/RetireJS/retire.js
- retire.js Datenfile: https://github.com/RetireJS/retire.js/blob/master/repository/jsrepository.json
- Ghostery TrackerDB: https://github.com/ghostery/trackerdb
- DuckDuckGo Tracker Radar: https://github.com/duckduckgo/tracker-radar
- disconnect.me Tracking Protection Lists: https://github.com/disconnectme/disconnect-tracking-protection
- EasyList: https://easylist.to/
- Open Cookie Database: https://github.com/jkwakman/Open-Cookie-Database
- WhatRuns: https://www.whatruns.com/
- BuiltWith Free API: https://api.builtwith.com/free-api
- BuiltWith Free API Hintergrund: https://blog.builtwith.com/2017/07/30/free-api/
- cdnjs: https://cdnjs.com
- cdnjs GitHub: https://github.com/cdnjs/cdnjs
