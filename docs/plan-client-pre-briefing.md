# Plan: Client Pre-Briefing im TechStack Analyzer

Stand: 21.10.2026 · Status: **Entwurf zur Freigabe** · Basis: Repo `Client-Report-main` (Chris Whitehead), Mock-up, Server-Check vom 21.10.

> **Client Pre-Briefing – powered by Chris Whitehead.** Inhaltsstandard, Abschnitte, Recherche-Regeln und Design stammen aus seinem Repo `Client-Report`. Die Credit-Zeile „Client Pre-Briefing powered by Chris Whitehead“ erscheint in der UI (Abschnittsauswahl + Ergebnis), im Footer jedes generierten Reports und in der Beschreibung des MCP-Tools.

## 1. Ziel

Der TechStack Analyzer bekommt eine zusätzliche Option **„Client Pre-Briefing“**. Ist sie angehakt, erzeugt das Tool neben der Tech-Stack-Analyse einen recherchierten, quellenbelegten HTML-Report (bis zu 14 Abschnitte, Adobe-Branding nach dem Design des Kollegen). Gilt für Einzelanalyse **und** Batch-Modus. Keine eigene Kachel im SalesHub.

## 2. Ausgangslage

| Baustein | Was es ist | Bedeutung für uns |
|---|---|---|
| Kollegen-Repo | **Keine App**, sondern ein Agent-Skill: Prompts, 14 Abschnitte, Recherche-Guide, `styles.css`, Komponenten, Beispielreport, `validate-report.py` | Liefert Inhaltsstandard + Design. Den Recherche-Ablauf, den sonst ein Agent (Claude Code) mit Websuche übernimmt, bauen wir serverseitig nach. |
| TechStack Analyzer | Node/TS + React, Bedrock (Sonnet 4.6), Semrush, Scraper, Chromium, MariaDB, Okta, Batch-Runner, Enrichment-Muster, MCP-Server | Fast alles an Infrastruktur ist da. |
| Server (10.42.71.232) | 4 CPU, 15 GB RAM (9,5 frei), 64 GB Disk frei, Last 0,2 | Reicht. |
| Ausgehender Zugriff (geprüft) | DuckDuckGo HTML → 200 + Treffer, Wikipedia → 200, SEC EDGAR → 200; im Container: Python 3, Chromium, Node 20 | Recherche ist vom Server aus möglich. |

## 3. Was möglich ist

### 3.1 Funktionsumfang
- **Option im Analyzer:** Checkbox unter dem URL-Feld → klappt die Abschnittsauswahl auf (wie Mock: „Select all“, 14 Abschnitte, „Adobe Opportunity“ immer an/gesperrt).
- **Ergebnis:** neuer Abschnitt in der Ergebnisansicht mit Live-Fortschritt pro Abschnitt, Vorschau (sandboxed iframe), Download als self-contained HTML. Gespeichert an der Analyse → auch später abrufbar.
- **Nachträglich:** Button „Briefing erzeugen“ bei bestehenden Analysen (Verlauf).
- **Batch:** Option „Client Pre-Briefing“ im Batch-Formular, läuft über das vorhandene „costly items“-Limit (heute max. 50). Briefings pro Account in der Batch-Detailansicht + ZIP-Download aller Reports.
- **MCP/Coworker:** Tool `generate_client_briefing` (Parität mit der UI), damit das auch aus Copilot/Claude heraus geht.

### 3.2 Datenquellen je Abschnitt

| Abschnitt | Quelle | Erwartete Qualität |
|---|---|---|
| s01 Company Overview | Wikipedia/Wikidata-API, GLEIF (Legal Entity), Websuche, Kunden-Website | gut |
| s02 Products & Services | Kunden-Website (vorhandener Scraper), Websuche | gut |
| s03 Financial Performance | **Börsennotiert US:** SEC EDGAR (API). **Andere börsennotierte:** Geschäftsbericht/IR-Seite + Presse via Suche. **Privat (DACH-Mittelstand):** siehe Grenzen | gut bis schwach |
| s04 Digital & Technology | **TechStack-Analyse selbst** (Detektoren, ObservePoint, Evidence Matrix) + Stellenanzeigen/Presse via Suche | **sehr gut** (besser als im Kollegen-Skill, der BuiltWith/Wappalyzer nur „sucht“) |
| s05 Marketing & Advertising | Websuche (Fachpresse, Agentur-News) | mittel |
| s06 Social Media & Content | Social-Links von der Website, Websuche | schwach (siehe Grenzen) |
| s07 SEO & Search | **Semrush (vorhanden), Traffic, GEO-Score (KI-Sichtbarkeit), Lighthouse** | **sehr gut** |
| s08 Brand & Website Portfolio | **TechStack:** Sitemap, Multi-Page-Crawl, Domain-Vorschläge, Mobile Apps | gut |
| s09 Competitive Landscape | Websuche + LLM-Einordnung | mittel |
| s10 Customer & Market | Geschäftsbericht, Websuche | mittel |
| s11 Regulatory & Compliance | Branchenwissen + Websuche (Bußgelder, Verfahren) + Consent-Audit aus TechStack | mittel bis gut |
| s12 Stakeholder Mapping | Presse, Pressemitteilungen, Website „Management/Vorstand“ | mittel (siehe Grenzen) |
| s13 Strategic Direction | Geschäftsbericht, Investor-/Strategie-Presse | gut bei Großunternehmen |
| s14 Adobe Opportunity | Produktliste des Kollegen (`adobe-products.md`) + **vorhandene Adobe-Displacement-/Use-Case-Logik** aus TechStack | gut |

### 3.3 Technischer Ablauf (Einzelanalyse)
1. Analyse läuft wie heute. Ist die Option angehakt, startet danach ein **asynchroner Briefing-Job** (das heutige Enrichment-Muster ist synchron und für 5–10 Min ungeeignet).
2. Pro gewähltem Abschnitt: Bedrock plant Suchanfragen → DuckDuckGo → Seiten abrufen (schneller Fetch, bei Bot-Block Chromium) → Bedrock schreibt **strukturiertes JSON** inkl. Quellen.
3. **Quellen-Guardrail:** Es dürfen nur URLs zitiert werden, die tatsächlich abgerufen wurden; Datum wird aus der Seite gelesen. Fehlt etwas → „not publicly available“ mit Angabe der Wege, die versucht wurden.
4. Server rendert das HTML aus dem JSON mit `styles.css` + Komponenten des Kollegen (das LLM schreibt **kein** freies HTML → stabiler, kein Abbruch bei 70 KB-Dateien).
5. `validate-report.py` prüft den Report (angepasst, damit abgewählte Abschnitte erlaubt sind) + ein kurzer LLM-Selbstcheck gegen die Qualitäts-Checkliste.

### 3.4 C-Level-Ansicht mit Overall Pre-Briefing Score (nur UI)

Über dem Briefing steht eine große **Executive-Ansicht**. Erst die Zusammenfassung, dann bei Bedarf der Drilldown.

**Aufbau:**
1. **Hero:** großer Score-Ring **„Overall Pre-Briefing Score“ 0–100** mit Ampel, ein Satz Fazit (z. B. „Hohe Dringlichkeit: Replatforming läuft, Sitecore-Vertrag endet 2027“) und eine Konfidenz-Anzeige (hoch/mittel/niedrig, je nach Datenlage).
2. **5 Bulletpoints (C-Level):** *Why now* · *Top-Opportunity* · *Größtes Risiko* · *Wen ansprechen* · *Nächster Schritt*. Jeder Punkt hat eine Fußnote zur Quelle.
3. **Sub-Score-Kacheln** (anklickbar → Drilldown):

| Sub-Score | Gewicht (Vorschlag) | Basis | Art |
|---|---|---|---|
| Adobe Whitespace | 30 % | vorhandene Building-Block-Lücken und Displacement-Map (Wettbewerber-Tools, fragmentierter Stack) | **gemessen** |
| Digital Maturity | 15 % | Tech-Anzahl, Lighthouse, GEO-Score, Consent-Audit | **gemessen** |
| Digital Reach | 15 % | Traffic-Score (Tranco/Semrush), Anzahl Domains/Märkte | **gemessen** |
| Business Momentum | 20 % | Umsatztrend, Investitionen, M&A (s03, s13) | LLM-Bewertung nach Rubrik |
| Urgency & Triggers | 20 % | laufende Transformation, Führungswechsel, Regulatorik, Agentur-Review (s04, s11, s12, s13) | LLM-Bewertung nach Rubrik |

4. **Top-3-Adobe-Plays** als Karten (aus „Adobe Opportunity“) mit dem Fakt, auf den sie sich stützen.
5. **Drilldown:** Klick auf eine Kachel, einen Bulletpoint oder einen Play springt in den passenden Abschnitt des Reports, inklusive Quellen. Darunter liegt der vollständige Report mit Abschnittsnavigation.

**Regeln, damit der Score belastbar bleibt:**
- Den Gesamtwert rechnet der **Server** aus den Sub-Scores. Das LLM vergibt keine Gesamtzahl frei.
- LLM-Sub-Scores nutzen eine feste Rubrik (1–5 mit Kriterien), eine Begründung und Quellen. Die Begründung ist im Drilldown sichtbar.
- Ist ein Abschnitt abgewählt oder fehlen Daten, wird der Sub-Score als „not assessed“ markiert und herausgerechnet. Die Konfidenz sinkt entsprechend, statt dass der Wert geraten wird.
- Der Score ist eine **Priorisierungshilfe**, keine Prognose. Das steht als Hinweis in der Ansicht.

**Wo die Ansicht auftaucht:**
- **Analyzer:** ganz oben im Briefing-Ergebnis.
- **Batch:** Score als sortierbare Spalte plus Mini-Ring je Account, damit sich Accounts ranken lassen. Klick öffnet die Executive-Ansicht.
- **HTML-Download:** kompakte Executive-Summary-Seite vor dem ersten Abschnitt. Dafür passen wir den Validator an.
- **Coworker/MCP:** nur Score und Bullets als JSON-Felder, keine eigene Darstellung.

### 3.5 Aufwand, Laufzeit, Kosten (Schätzung)
| | Einzel-Briefing | Batch 20 Accounts | Batch 50 Accounts |
|---|---|---|---|
| Laufzeit | 5–10 Min | ~1–1,5 h (2 parallel) | ~3–4 h |
| Bedrock-Kosten | ~1–3 $ | ~20–60 $ | ~50–150 $ |
| DuckDuckGo-Anfragen | ~40–70 | ~1.000 | ~2.500–3.500 ⚠ |

## 4. Was nicht (oder nur eingeschränkt) möglich ist

| Thema | Grenze | Umgang |
|---|---|---|
| **DuckDuckGo-Scraping** | Kein offizielles API, kein verlässlicher Datumsfilter, Rate-Limit/Blockade bei Volumen möglich – besonders im Batch | Drosselung (≥1 s), Cache pro Query, max. 2 Briefings parallel, Batch-Briefings auf **20 Accounts begrenzen** (Empfehlung). Bei Blockade: Abschnitt als „not verified“ markieren, nicht abbrechen. Upgrade-Pfad: bezahlte Such-API als Fallback später nachrüstbar. |
| **Paywall-Quellen** (FT, Bloomberg, Handelsblatt, WSJ, teils Reuters) | Volltext nicht abrufbar | Nur Snippet/Überschrift nutzen; Zahlen nur, wenn eine frei zugängliche Quelle sie bestätigt. |
| **Bezahlte Datentools** (BuiltWith, Similarweb, Ahrefs, Crunchbase, North Data) | Kein Zugang | Ersetzt durch eigene TechStack-Erkennung + Semrush. Crunchbase/North Data entfallen. |
| **LinkedIn** | Login-Pflicht, Scraping verboten | Nicht genutzt. Stakeholder nur aus Presse/Website/Pflichtmitteilungen. |
| **Social-Media-Kennzahlen** (Instagram, TikTok, LinkedIn, X) | Blockieren Scraping, Zahlen nicht verlässlich | s06 nennt Kanäle + Aktivität aus Website/Presse, **keine Follower-Zahlen** (außer YouTube, wo öffentlich lesbar). |
| **Private Unternehmen (DACH-Mittelstand), Finanzen** | Bundesanzeiger hat Captcha/JS-Sperre; Unternehmensregister ebenso | s03 dann aus Presse/Website; sonst „not publicly available“. Kein Captcha-Umgehen. |
| **Datenschutz bei Personen (s12)** | Namen aus Aggregatoren (ZoomInfo, RocketReach o. Ä.) sind tabu (Regel des Kollegen + unsere Guardrail) | Nur Personen aus Primärquellen (Website, Pressemitteilung, Geschäftsbericht, seriöse Presse) mit Quelle. |
| **Interne Adobe-Daten** (Dynamics, TPS, Glean, Highspot) | Auf dem Server kein Zugriff/keine Auth; zudem „public information“-Anspruch im Mock | Nicht im Scope v1. Optional später: Hinweis „bestehender Kunde?“ über separaten Weg. |
| **Faktentreue** | Kein Mensch prüft vor dem Ausliefern; Validator prüft nur Struktur | Quellen-Guardrail + Selbstcheck + gelber Hinweis im UI (wie im Mock: „review sources before talking to clients“). Restrisiko bleibt. |
| **Echtzeit** | Ein Briefing dauert Minuten, nicht Sekunden | Async-Job mit Fortschritt; Mail/Benachrichtigung nicht in v1. |
| **Sprache** | v1 nur Englisch | Deutsch später möglich (Prompts + feste Labels). |
| **Websuche „wie ein Agent“** | Bedrock hat keine eingebaute Websuche wie Claude Code; der Kollegen-Skill setzt das voraus | Eigene Tool-Schleife (Suche/Fetch als Tools) – funktional gleichwertig, aber an DuckDuckGo-Qualität gebunden. |

## 5. Namensfrage

„TechStack Analyzer“ trifft es mit Briefing nicht mehr ganz. Vorschläge:
- **Account Intelligence** (Untertitel „Tech Stack · Client Pre-Briefing“) – passt zum Footer des Kollegen „Prepared by Adobe Account Intelligence“. **Empfehlung.**
- „TechStack & Client Briefing“
- „Account Analyzer“

Unabhängig vom Namen bleibt die Credit-Zeile „Client Pre-Briefing powered by Chris Whitehead“ sichtbar.

Betroffen bei Umbenennung: SalesHub-Kachel (`hub/index.html`), Banner-Navigation (`hub/banner.html`, `banner-inject.js`), App-Header/Titel, Dashboard-Texte, MCP-Tool-Beschreibungen. **Domain `techstack.corp.adobe.com` bleibt** (neue Domain = DNS + Zertifikat, nicht nötig).

## 6. Umsetzung in Phasen

| Phase | Inhalt | Ergebnis |
|---|---|---|
| 1 – Kern | Modul `services/briefing/` (Recherche-Tools, Bedrock-Schleife, JSON-Schema, Renderer, Validator), Job-Tabelle, API `POST/GET /api/analyses/:id/briefing` | Briefing per API für eine Analyse |
| 2 – UI Einzelanalyse | Checkbox + Abschnittsauswahl, **Executive-Ansicht mit Overall Pre-Briefing Score + Drilldown**, Fortschritt, Vorschau, Download, Button im Verlauf | nutzbar im Analyzer |
| 3 – Batch | Option im Batch-Formular, Limit, **Ranking-Spalte Pre-Briefing Score**, Detailansicht, ZIP-Export | nutzbar im Batch |
| 4 – MCP + Umbenennung | MCP-Tool, Name/Kachel/Banner | fertig integriert |
| 5 – Test & Deploy | Probeläufe mit 3–5 echten Firmen (DAX, US-börsennotiert, DACH-Mittelstand), Kosten messen, Deploy nach deinem OK | live |

## 7. Offene Entscheidungen für dich
1. Name (Empfehlung: „Account Intelligence“) – jetzt oder später?
2. Batch-Limit für Briefings: 20 (Empfehlung) oder 50?
3. Soll das Briefing **automatisch** nach der Analyse laufen, wenn angehakt, oder erst per Button bestätigt werden (Kostenkontrolle)?
4. Wer darf es nutzen – alle Okta-User oder nur bestimmte (Kosten)?
5. Sollen wir die Dateien des Kollegen 1:1 übernehmen und bei seinen Updates nachziehen (Empfehlung), oder forken?
6. Score-Gewichtung: Vorschlag aus 3.4 übernehmen oder anders gewichten (z. B. Whitespace höher für Neukunden, Momentum höher für Bestandskunden)?
