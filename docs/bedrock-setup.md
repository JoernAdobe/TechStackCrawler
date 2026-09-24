# Bedrock-Zugriff einrichten

Bedrock kann über **IAM Credentials** (empfohlen, läuft nicht ab) oder einen **API-Key** (läuft ab) genutzt werden.

## Option 1: IAM Credentials (empfohlen)

### A) AWS CLI konfigurieren
```bash
aws configure
# AWS Access Key ID: [dein Key]
# AWS Secret Access Key: [dein Secret]
# Default region: us-west-2
```
Die App nutzt dann automatisch `~/.aws/credentials`.

### B) In .env eintragen
```env
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-west-2
```

### IAM-Berechtigungen
Der IAM-User braucht Zugriff auf Bedrock, z.B.:
- `AmazonBedrockFullAccess` (Managed Policy)
- Oder eine eigene Policy mit `bedrock:InvokeModel` etc.

**Access Key erstellen:** AWS Console → IAM → Users → [dein User] → Security credentials → Create access key

---

## Option 2: Bedrock API-Key (läuft ab)

1. AWS Console → [Bedrock](https://console.aws.amazon.com/bedrock) → API keys
2. "Generate long-term API keys" → Ablaufdatum wählen
3. Key in `.env` eintragen:
```env
BEDROCK_API_KEY=ABSK...
BEDROCK_ENDPOINT=https://bedrock-runtime.us-west-2.amazonaws.com
```

---

## Fehlerbehebung

| Fehler | Lösung |
|--------|--------|
| 403 / unauthorized | IAM-Policy prüfen (AmazonBedrockFullAccess) |
| credentials | `aws configure` ausführen oder AWS_* in .env setzen |
| API-Key abgelaufen | Neuen Key in Console generieren oder auf IAM umstellen |
