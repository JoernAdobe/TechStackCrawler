# TechStackCrawler – Verbindungstest-Bericht

**Datum:** 26.02.2026  
**Befehl:** `npm run test:connections` (im project-Verzeichnis)

---

## Testergebnisse

| Service | Status | Details |
|---------|--------|---------|
| **Bedrock (Claude AI)** | ✓ OK | Antwort erhalten – API-Key gültig |
| **ElevenLabs (TTS)** | ✓ OK | Audio erzeugt (~10–15 KB) |
| **MariaDB** | ✗ Nicht konfiguriert | DB_PASSWORD fehlt – DB deaktiviert |
| **Puppeteer (Chromium)** | ✓ OK | Chromium startet erfolgreich |

**Zusammenfassung:** 3/4 Tests erfolgreich

---

## Details

### Bedrock
- Verbindung zu AWS Bedrock funktioniert
- Modell: `us.anthropic.claude-sonnet-4-6`
- API-Key ist gültig (kein 403 mehr)

### ElevenLabs
- TTS-Service erreichbar
- Voice-ID und API-Key konfiguriert
- Willkommens- und Abschluss-Nachrichten werden unterstützt

### MariaDB
- Ohne `DB_PASSWORD` in `.env` deaktiviert
- Für Persistenz (Past Analyses, Audio-Cache): `make docker-up` und DB_PASSWORD setzen

### Puppeteer
- Chromium startet für Web-Scraping
- Keine Konfigurationsänderung nötig

---

## Tests erneut ausführen

```bash
cd project
npm run test:connections
```
