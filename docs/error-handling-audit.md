# Error-Handling-Audit

## Benutzerfehler

Audit der Robustheit gegen Fehleingaben und Fehlbedienung. Anlass: „bwm.com“ statt „bmw.com“ → 60 s Scraper-Timeout, UI zeigte nur „Analysis Failed“. Alle user-sichtbaren Fehlertexte sind jetzt englisch und liefern `{error, code, hint?, suggestion?}`.

Kernbausteine: `server/src/utils/urlInput.ts` (syntaktische Validierung + SSRF), `server/src/services/urlPreflight.ts` (DNS-Lookup 5 s + HTTP-Probe https/http parallel 8 s vor dem Scrape, abschaltbar mit `URL_PREFLIGHT=0`), `server/src/services/domainSuggest.ts` (Damerau-Levenshtein ≤ 2 gegen frühere Analysen in der DB + ~95 bekannte Marken), Client `lib/urlValidation.ts` (Inline-Spiegel der Regeln) und `components/AnalysisError.tsx` (Fehlerzustand).

| Fall | Vorher | Nachher | Status |
|---|---|---|---|
| Leere Eingabe / nur Leerzeichen | Button deaktiviert; Server: generische 400 | Inline „Please enter a website URL.“; Server 400 `url_empty` | Behoben |
| Leerzeichen in der Domain („bmw .com“) | Scrape-Fehler | Inline + 400 `url_whitespace` | Behoben |
| Fehlendes Schema („bmw.com“) | https:// ergänzt | unverändert (https:// ergänzt, IDN → Punycode) | OK |
| Vertipptes Schema („https:/bmw.com“, „http//…“) | ungültige URL | wird repariert | Behoben |
| Fremdes Schema (`ftp:`, `javascript:`) | „Invalid or disallowed URL“ | 400 `unsupported_scheme` | Behoben |
| Mehrere URLs in einem Feld | erste/kaputte URL gescannt | Inline + 400 `multiple_urls` („use Batch Assessment“) | Behoben |
| Ungültige TLD / TLD-Tippfehler („bmw.con“) | DNS-Fehler oder 60 s Timeout | Inline + 400 `invalid_tld` mit Button „Did you mean bmw.com?“ | Behoben |
| Ungültiger Host (`-x-.com`, Unterstriche, ohne Punkt) | Scrape-Fehler | 400 `invalid_host` | Behoben |
| IP-Literal privat / localhost (SSRF) | 400 „Invalid or disallowed URL“ | 400 `url_disallowed`, SSRF-Prüfung (`sanitizeUrl` + `sanitizeUrlWithDns`) unverändert zusätzlich aktiv | Behoben (nicht geschwächt) |
| Zugangsdaten in URL (`user:pw@host`) | durchgereicht | 400 `url_credentials` | Behoben |
| Pfad/Query, Groß/Klein, Trailing Dot, `#hash` | teils doppelte Analysen | Pfad/Query bleiben, Host lowercase, Trailing Dot und Hash entfernt | Behoben |
| Anführungszeichen / `<…>` beim Copy-Paste | ungültige URL | werden entfernt | Behoben |
| Zu lange Eingabe | — | Schema max. 4096, 400 `url_too_long` | Behoben |
| Domain existiert nicht (NXDOMAIN) | 400 „Invalid or disallowed URL“ ohne Erklärung | 422 `domain_not_found` in < 1 s, ggf. Vorschlag (Tippfehler oder www-Variante) | Behoben |
| Domain löst auf, antwortet aber nicht („bwm.com“) | 60 s Scraper-Timeout, „Analysis Failed“ | 422 `site_unreachable` nach 8 s: „did not respond within 8 seconds“ + „Did you mean bmw.com?“ (Timeout blockiert nur, wenn ein Tippfehler-Kandidat existiert – Tarpit-Schutz) | Behoben (live verifiziert) |
| Verbindung abgelehnt (http+https) | Timeout/Fehler nach Scrape | 422 `site_unreachable` sofort | Behoben |
| Scrape-Timeout/Netzwerkfehler nach bestandenem Preflight | deutsche generische Meldung | englische Meldung + Vorschlag (`findDomainSuggestion`) im Fehler-JSON | Behoben |
| Fehlertexte deutsch (`toUserFriendlyError`) | Deutsch | Englisch, mit `code` und `hint` | Behoben |
| Fehlerzustand im Client | nur „Analysis Failed“ + Retry | Ursache, Handlungsempfehlung, klickbarer Vorschlag, „Edit URL“ (URL bleibt im Feld), „Try Again“ nur bei retrybaren Fehlern | Behoben (Browser verifiziert) |
| Inline-Validierung vor dem Absenden | keine | beim Submit und onBlur, `role=alert`, `aria-invalid`; Vorschlag-Button übernimmt und sendet | Behoben |
| Doppelklick / mehrfaches Enter | mehrere parallele Analysen möglich | Guard in `UrlInput` (submittedRef) und `App.handleSubmit` (state `analyzing`) | Behoben |
| Analyse abbrechen | URL ging verloren | Abbrechen → zurück ins Eingabefeld mit vorbelegter URL | Behoben |
| Tab schließen/Reload während Analyse | kein Hinweis | `beforeunload`-Warnung | Behoben |
| Bulk: ungültige Zeilen / Duplikate | erst Server-Fehler bzw. Doppel-Scans | Inline-Vorschau (max. 5 Zeilen), ungültige blockieren Submit, Duplikate (gleiche Dedupe-Regel wie Server) als Warnung; Server-Fehlerzeile nennt den Grund (`checkBatchUrl`) | Behoben |
| MCP-Tool `analyze-url` | nur SSRF-Prüfung | gleiche Validierung + Preflight | Behoben |
| ObservePoint-Abgleich mehrfach klicken | — | bereits `busy`-Guard (Button disabled) | OK, unverändert |
| Admin-Login Fehleingaben | — | bereits `loading`-Guard, `required`, Server-`loginLimiter`, generisches „Invalid credentials“ | OK, unverändert |
| Rate-Limit (5 Analysen/min) | „Too many requests“ | englischer Hint „wait a minute“ (`rate_limited`) | Behoben (siehe offene Punkte) |

Tests: `server/tests/urlInput.test.ts` (Validierung, SSRF, Damerau-Levenshtein, Vorschläge, Preflight mit gefaktem DNS/HTTP, Fehlerklassifikation); `batch.test.ts` angepasst.

### Offene Punkte (Benutzerfehler)

- `analysisLimiter` (5/min, `server/src/index.ts`) zählt auch 400/422 aus Validierung/Preflight – Tippfehler-Serien führen schnell zu 429. Empfehlung: `skipFailedRequests` oder Validierung vor dem Limiter.
- Abbrechen im Client stoppt die laufende Server-Analyse nicht (Analyzer hat kein Abort-Signal; außerhalb dieses Auftrags).
- Batch-Runner hat keinen Preflight pro Item – nicht erreichbare Domains laufen weiter in den Scraper-Timeout.
- Kein Vorschlag, wenn ein Tippfehler auf eine *funktionierende* fremde Seite zeigt (bewusst: keine Blockade gültiger Seiten).

## Systemfehler

Audit der Robustheit gegen Fehler in der Lösung selbst (LLM/Bedrock, Scraper, Fehlerseiten, Prozess, Enrichments, Client). UI-/Fehlertexte sind englisch.

| # | Schwere | Risiko | Fundstelle | Auswirkung | Fix | Status |
|---|---|---|---|---|---|---|
| S1 | Hoch | Bedrock-Stream bricht mit „terminated“/ECONNRESET ab; SDK-Retries greifen mitten im Stream nicht | `server/src/services/ai.ts` | Analyse scheitert komplett, nur manueller Retry hilft | `services/llmCall.ts` + `utils/retry.ts`: Retry mit Exponential Backoff + Full Jitter (Throttling 3× Basis), Timeout pro Versuch via AbortController, Fehlerklassen `transient/throttled/auth/invalid_response/timeout/fatal`, SDK `maxRetries:0`. Env: `BEDROCK_MAX_ATTEMPTS` (3), `BEDROCK_TIMEOUT_MS` (180 s), `BEDROCK_RETRY_BASE_MS` (1,5 s). Auch in `useCaseDiscovery.ts` und `geoScore.ts` | Behoben |
| S2 | Hoch | Endgültiger KI-Ausfall = Totalausfall, obwohl Erkennungen vorliegen | `services/analyzer.ts` | Kein Ergebnis trotz erfolgreichem Scan | `buildDetectionOnlyResult`: Teilergebnis (Erkennungen nach Kategorie, ohne KI-Text) + Warnung `ai_unavailable` | Behoben |
| S3 | Hoch | Fehlerseite (AEM „Service Outage“), 5xx, Bot-Wall oder Leerseite wird still als Ergebnis akzeptiert | `services/analyzer.ts`, `scraper.ts` | Scheinbar gültiges, aber falsches Ergebnis (z. B. nur 3 Erkennungen) | `services/pageHealth.ts` (error_page, http_error, bot_challenge, thin_content, http_fallback, few_detections) → `scanWarnings` im Result; ein automatischer Re-Scan bei transienten Fällen (`SCAN_RETRY_DELAY_MS`, Default 4 s), das bessere Ergebnis wird behalten; Python-Worker liefert HTTP-Status; Client-Banner `ScanWarningsBanner` | Behoben |
| S4 | Mittel | JSON-Antwort des Modells kaputt/falsche Struktur | `services/ai.ts` | Analyse scheitert | `validateAnalysisJson` (Reparatur via `parseAIJson`, Strukturprüfung) → `RetryableResponseError` → erneuter Versuch | Behoben |
| S5 | Mittel | Kein Fallback, wenn der Scrapling-Worker scheitert (Timeout/Exit 1) | `services/scraper.ts` | Analyse scheitert | `services/httpFallbackScrape.ts`: HTTP-Fetch über `safeFetch` (SSRF-Schutz, 20 s Timeout) + Regex-Extraktion; SSRF-Blockaden werden nie per Fallback umgangen; Warnung `http_fallback` | Behoben |
| S6 | Mittel | Kein `unhandledRejection`/`uncaughtException`-Handler, kein `server.on('error')` | `server/src/index.ts` | Prozessabsturz (Dev-Server) | Handler loggen; nur in Production geordneter Shutdown (Orchestrator startet neu), harmlose Socket-Codes werden ignoriert; EADDRINUSE → klarer Exit; idempotenter Shutdown mit 5-s-Timer | Behoben |
| S7 | Mittel | Client zeigt „Request failed (HTTP 500)“ ohne Ursache, wenn der Server neu startet (tsx watch) und der Vite-Proxy eine leere 500 liefert | `client/src/lib/apiClient.ts`, `vite.config.ts` | Unverständliche Meldung | apiClient: Netzwerkfehler und 5xx ohne JSON → „Server was restarted or is unreachable – please try again.“, Offline-Erkennung, 200 mit HTML → `invalid_response`; Helfer `toNetworkError`/`apiErrorFromResponse` auch in `DeckButton`/`FeedbackList`; Vite-Proxy antwortet bei Backend-Ausfall mit JSON 502 `server_unreachable` | Behoben |
| S8 | Mittel | Keine React-ErrorBoundary | `client/src/App.tsx`, `ParityExtras.tsx` | Eine kaputte Karte killt die ganze Seite | `components/ErrorBoundary.tsx` um Analyzer, Ergebnisbereiche und jede Enrichment-Karte (compact, „Try again“, Reset bei neuem Ergebnis) | Behoben |
| S9 | Mittel | ObservePoint 401/403/429/5xx als unklare 502/403 (Client kann OP-401 als eigenen Auth-Fehler missverstehen), deutsche UI-Texte, kein Retry | `services/observepoint/*`, `routes/enrichments.ts` | Unklare Meldungen, sporadische Fehler | Englische Meldungen je Status; Upstream-401/403 → 502 `observepoint_auth`/`observepoint_forbidden`; 429 → 429; Timeout → 504; Retry (3×) nur für idempotente Calls bei 429/5xx; API-Key nie in Meldung oder Log | Behoben |
| S10 | Niedrig | Enrichment-Fehler (Lighthouse, Traffic, Mobile Apps) als generische 500 | `routes/enrichments.ts` | Keine Ursache erkennbar | `toEnrichmentError`: Timeout → 504, Rate-Limit → 429, sonst 502 mit englischem Text | Behoben |
| S11 | Niedrig | `errorHandler` antwortet bei bereits gesendeten Headern nicht (Request hängt) | `utils/http.ts` | Hängende Requests | Loggen + `next(err)` (Express beendet die Verbindung) | Behoben |
| S12 | Niedrig | Kaputter/zu großer JSON-Body → 500 | `utils/http.ts` | Falscher Statuscode | `entity.parse.failed` → 400, `entity.too.large` → 413; LlmError → 429/502/503 `ai_<kind>`; alle 500er als JSON `{error, code}` ohne Stacktrace | Behoben |
| S13 | Niedrig | Server-`requestTimeout` 300 s kürzer als langer Scan + Re-Scan + KI-Retries | `index.ts` | Abbruch langer Analysen | `requestTimeout` 10 min, `headersTimeout` 65 s, `keepAliveTimeout` 61 s | Behoben |
| S14 | Niedrig | Alte DB-Analysen mit fehlenden/falsch typisierten Feldern | `db/analyses.ts` | Client-Crash beim Öffnen alter Analysen | `normalizeAnalysisResult` in `getAnalysisById`; zusätzlich ErrorBoundaries | Behoben |

Tests: `server/tests/robustness.test.ts`, `server/tests/robustness-scan.test.ts` (Bedrock, Netz und ObservePoint gemockt).

### Offene Punkte

- Verwaiste Python-Worker, falls der Node-Prozess hart gekillt wird (SIGKILL) – kein Cleanup möglich.
- `geoScore`: einzelne fehlgeschlagene Teilaufrufe werden weiterhin als Fehler der GEO-Karte gemeldet (die Karte ist per ErrorBoundary isoliert).
- Bot-Walls werden erkannt und gemeldet, aber bewusst nicht umgangen.
- Der Re-Scan verlängert die Analysezeit bei Fehlerseiten um ca. Scrapling-Timeout + 4 s.
- Eine echte End-to-End-Analyse gegen den Dev-Server wurde in dieser Session nicht freigegeben (siehe Abschlussbericht); verifiziert sind Unit-Tests, `/api/health` und das 400-JSON bei kaputtem Body.
