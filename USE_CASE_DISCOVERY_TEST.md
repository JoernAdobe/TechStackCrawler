# Use Case Discovery – Testbericht

**Datum:** 26.02.2026  
**Getestet:** Analyse-Flow, Use Case Discovery API, UI

---

## 1. API-Tests

### Health Check
```
GET /api/health
→ {"status":"ok","timestamp":"..."}
✓ OK
```

### Analyse Sync
```
POST /api/analyze-sync
Body: {"url":"https://example.com"}
→ ok: true, result mit summary, categories, rawDetections, pageContentExcerpt
✓ OK
```

**Beispiel-Ergebnis (example.com):**
- Summary: "[Demo] Analyse von Example Domain. 1 Technologien erkannt."
- Categories: 1 (Cloudflare)
- pageContentExcerpt: ~129 Zeichen
- rawDetections: Cloudflare (CDN)

**Beispiel-Ergebnis (adobe.com):**
- Summary: "[Demo] Analyse von Adobe: Creative, marketing..."
- Categories: 3
- rawDetections: Angular, Akamai, Adobe Commerce (Magento)

### Use Case Discovery
```
POST /api/use-case-discovery
Body: <vollständiges AnalysisResult>
→ ok: true, result.useCases (10 Einträge)
✓ OK
```

**Beispiel Use Case #1:**
```json
{
  "rank": 1,
  "title": "Personalized Product Recommendations",
  "description": "Leverage customer behavior data to show relevant product suggestions.",
  "adobeProducts": ["Adobe Target", "Adobe Real-Time CDP"],
  "businessValue": "Increase conversion and average order value.",
  "implementationHint": "Start with Target for on-site personalization."
}
```

---

## 2. Test-Script

```bash
# Server starten (in einem Terminal)
make start

# In anderem Terminal: Tests ausführen
cd project
./scripts/test-use-case-discovery.sh
```

**Mock-Modus (ohne Bedrock-Key):**  
`USE_MOCK_AI=1` in `project/.env` setzen – liefert Demo-Daten für Analyse und Use Cases.

---

## 3. UI-Tests

- **Startseite:** Lädt korrekt (localhost:5173)
- **URL-Input:** Placeholder "Enter website URL (e.g., adobe.com)"
- **Analyze-Button:** Startet Analyse
- **Use Case Discovery:** Sektion erscheint nach Analyse unter den Tech-Stack-Karten
- **"Discover Use Cases"-Button:** Triggert API-Call, zeigt Loading-Spinner
- **Ergebnis:** 10 Use-Case-Karten in 2-Spalten-Grid mit Adobe-Produkt-Tags

---

## 4. Ablauf (End-to-End)

1. User gibt URL ein (z.B. example.com) → Klick "Analyze"
2. Scraping → Detection → AI-Analyse (oder Mock)
3. Ergebnis: Executive Summary + Tech-Stack-Karten
4. User klickt "Discover Use Cases"
5. Backend: POST /api/use-case-discovery mit AnalysisResult
6. Bedrock (oder Mock) generiert 10 Use Cases
7. UI zeigt Use Cases mit Titel, Beschreibung, Adobe-Produkten, Business Value

---

## 5. Bekannte Einschränkungen

- **pageContentExcerpt:** Bei manchen SPAs (z.B. adobe.com) kann der Body-Text leer sein – Use Cases basieren dann nur auf Tech Stack
- **Bedrock-Key:** Bei abgelaufenem Key → Fehlermeldung; `USE_MOCK_AI=1` für Demo
