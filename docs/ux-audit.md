# UX-Audit – TechStack Analyzer

Stand: 15.10.2026 · Geprüft im Browser (Playwright) bei 1440px (Desktop) und 390px (Mobile).
Screenshots: `.playwright-mcp/ux-audit/` (`before-*` = Ausgangszustand, `after-*` = nach den Fixes).

Geprüfte Views: Analyzer-Startseite, Past Analyses, Ergebnis-Detail (lazardassetmanagement.com #7 mit OP-Abgleich „done“, bmw.com #6 mit OP „not found“), ObservePoint · Evidence Matrix inkl. „Compare with ObservePoint“, Account / Bulk, Admin-Login (`#/dashboard`, ohne Login).

Legende: ✅ behoben · ⏳ offen

## P1 – kritisch (Bedienbarkeit / Konsistenz)

| # | Finding | Screenshot | Status |
|---|---|---|---|
| 1 | **Sprachmix:** Die ObservePoint-/Evidence-Matrix-Karte war komplett Deutsch, die restliche App ist Englisch. Datumsformat `de-DE`. Entscheidung: App bleibt Englisch, die Karte wurde vollständig übersetzt (Labels, Status, Spalten, Hinweise, Fehlertexte, `en-US`-Datum, Singular/Plural „page/pages“). | before-04, before-09 → after-08, after-10 | ✅ |
| 2 | **Horizontaler Overflow auf Mobile** (`scrollWidth` 404 bei 390px): Analyze-Button abgeschnitten (Input ohne `min-w-0`), fixe Bottom-Bar mit drei Buttons und langer Domain läuft über, OP-CTA ragt aus der Karte, Status-Chips und Quelle-Zeile laufen über. | before-02, before-05 → after-02, after-05, after-06 | ✅ (`scrollWidth` jetzt ≤ Viewport) |
| 3 | **Past-Analyses-Detail auf Desktop mit horizontalem Scrollbalken** durch den `w-screen left-1/2 -ml-[50vw]`-Trick (100vw inkl. Scrollbar). | before-04 → after-04 | ✅ |
| 4 | **Kontrast:** `text-secondary` #7C7C8A erreichte auf Cards (#1A1A1E) nur 4,22:1 (WCAG-AA-Fail). Auf #9494A1 angehoben (≥ 5,2:1 auf allen Surfaces). Executive Summary nutzt jetzt Primärtext mit Zeilenbreite ≤ 80ch. | before-04 → after-05 | ✅ |
| 5 | **Keyboard/ARIA:** Keine sichtbaren Fokus-Styles; Tabs nicht als ARIA-Tabs ausgezeichnet; URL-Input ohne Label; Icon-Buttons ohne `aria-label`. Jetzt: globales `:focus-visible`, Tablist mit `role=tab`, `aria-selected`, Roving-Tabindex und Pfeiltasten, `aria-label` am Input, Sound-Button mit `aria-pressed`, Tabelle mit `caption`/`scope`. | – | ✅ |
| 6 | **Lange Ergebnisseite ohne Orientierung** (~6.000px Desktop, ~11.000px Mobile). Neue sticky Sprungleiste (Summary, Tech Stack, Opportunities, Use Cases, Tech Case, Deep Dive, ObservePoint, GEO Score) mit aktiver Sektion (`aria-current`) und Smooth-Scroll (respektiert `prefers-reduced-motion`). | before-04 → after-05, after-08 | ✅ |
| 7 | **Doppeltes Padding / versetzte Kanten:** ParityExtras plus Kinder mit je `px-6 py-8 max-w-7xl` → Karten-Kanten bei 152px vs. 128px, sehr schmale Karten auf Mobile, große Lücken. | before-04, before-05 → after-04 | ✅ |
| 8 | **Past Analyses:** nur die letzten 3 Einträge, kein „mehr“; beim Öffnen kein Ladefeedback, kein Scroll nach oben, Fehler nur bei leerer Liste sichtbar. Jetzt: 10 Einträge + „Show more“, Spinner „Opening…“, deaktivierte Buttons während des Ladens, Scroll-to-top, Inline-Fehler, „Try again“. | before-03 → after-03, after-09 | ✅ |
| 9 | **Irreführende Aktion:** In der Past-Detailansicht hieß der Reset-Button „New Analysis“, führte aber nur zur Liste zurück. Jetzt „Back to list“. | before-04 → after-05 | ✅ |
| 10 | **Inkonsistenz:** Tech-Case-Insights fehlten in der Past-Detailansicht. | – | ✅ |
| 11 | **Sichtbarer Scrollbalken an der Tab-Leiste** (und an der neuen Sektions-Leiste): `overflow-x:auto` + `-mb-px` am aktiven Tab führte zu vertikalem Mini-Overflow. Fix: `-mb-px` entfernt, Grundlinie per Inset-Shadow, `overflow-y:hidden`, Scrollbar versteckt (`scrollbar-width:none`, `::-webkit-scrollbar`). Horizontales Scrollen auf schmalen Viewports bleibt erhalten. | after-01, after-02, after-11 | ✅ |
| 12 | **Server-Texte auf Deutsch:** `op.note` (z. B. „Audits vorhanden, aber kein abgeschlossener Run …“) und `matrix.sources[].detail` („3 Erkennungen“, „1 Seiten“) kommen vom Server. Server-Code war außerhalb des Scopes. | after-07, after-10 | ⏳ |

## P2 – wichtig (Klarheit / Hierarchie)

| # | Finding | Screenshot | Status |
|---|---|---|---|
| 1 | **CTA-Hierarchie flach:** Excel *und* Markdown primär rot, alle „Run“-Buttons voll rot. Jetzt: Excel primär, Markdown/Back sekundär (Outline); Run-Buttons der Enrichment-Panels und GEO Score sekundär. | before-04 → after-08, after-10 | ✅ |
| 2 | **OP-Leerzustand:** Bei `not_found` zeigte die Matrix „–“, 0/0/0/37 und eine leere Tabelle („0 von 37 Zeilen“). Jetzt kompakter Hinweis statt leerer Matrix. | before-09 → after-10 | ✅ |
| 3 | **OP-Abgleich ohne Rückmeldung:** Jetzt Button-Label „Comparing…“, `aria-busy`, `aria-live`-Statusmeldung, Fehler mit `role=alert`; Button-Label „Re-run comparison“, wenn bereits Daten da sind. | before-10 → after-08 | ✅ |
| 4 | **Evidence-Tabelle auf Mobile:** gequetschte Spalten ohne Scroll-Hinweis. Jetzt `min-w-[760px]` + Hinweis „Swipe horizontally …“. | before-05 → after-07 | ✅ |
| 5 | **Naming:** Header „TechStack Optimizer“ vs. Seitentitel/README „TechStack Analyzer“. | before-01 → after-01 | ✅ |
| 6 | **Mobile Header/Hero/Tabs:** Header gequetscht, Hero `text-5xl` zu groß, Tabs umbrechend. Jetzt kompakter Header, `text-4xl sm:text-5xl`, scrollbare Tab-Leiste, kürzerer Placeholder. | before-02 → after-02 | ✅ |
| 7 | **Bulk-Fortschrittsbalken** bei „completed“ rot (wirkt wie Fehler) → jetzt grün (`ts-success`). | before-07 | ✅ |
| 8 | **Admin-Login:** Passwort-Login ist der primäre rote CTA, „Sign in with Adobe“ (SSO) nur sekundär. Für Adobe-Nutzer sollte SSO primär und oben stehen. Bewusst offen gelassen (Auth-Flow-Entscheidung). | before-08 | ⏳ |
| 9 | **Datenkonsistenz:** Category Status zeigt „DAM = Adobe“, die DAM-Kachel „Not Found“. Daten-/Server-Thema. | before-04 | ⏳ |
| 10 | Verbleibende schwache Textvarianten (`text-ts-text-secondary/50`, `/60`, ca. 14 Stellen) liegen teils unter AA; nur in den bearbeiteten Komponenten angehoben. | – | ⏳ (teilweise) |

## P3 – Feinschliff

| # | Finding | Status |
|---|---|---|
| 1 | Tab-Leiste `max-w-4xl` vs. Bulk-Content `max-w-6xl` → ungleiche Ausrichtung im Bulk-Tab. | ⏳ |
| 2 | „Detection Confidence“-Chart steht allein in einer halben Spalte. | ⏳ |
| 3 | Console: Favicon-404 (gstatic) und saleshub-Banner-Fehler – harmlos, aber Rauschen. | ⏳ |
| 4 | Bundle > 500 kB (Vite-Warnung) – Code-Splitting für Dashboard/Charts sinnvoll. | ⏳ |
| 5 | Aktive Pille der Sektions-Leiste scrollt auf Mobile nicht immer automatisch ins Sichtfeld. | ⏳ |

## Geänderte Dateien (Client)

`src/index.css`, `src/App.tsx`, `components/Header.tsx`, `components/ResultsSectionNav.tsx` (neu), `components/ResultsTable.tsx`, `components/UseCaseDiscovery.tsx`, `components/TechCaseInsights.tsx`, `components/ParityExtras.tsx`, `components/EnrichmentPanels.tsx`, `components/GeoScorePanel.tsx`, `components/ObservePointPanel.tsx`, `components/EvidenceMatrix.tsx`, `components/PastAnalyses.tsx`, `components/DownloadButton.tsx`, `components/UrlInput.tsx`, `components/BatchAssessment.tsx`.

Keine neuen Abhängigkeiten, kein Server-Code, `types/parity.ts` unverändert. Validierung: `tsc --noEmit` ✓, ESLint ✓, `npm run build` ✓.
