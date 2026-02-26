#!/bin/bash
# Use Case Discovery - API Test Script
# Voraussetzung: Server läuft auf localhost:3001
# Mit Mock: USE_MOCK_AI=1 in .env setzen für Demo ohne Bedrock-Key

set -e
BASE="http://localhost:3001"
TMP="/tmp/uc_test_$(date +%s)"

echo "=== TechStack Crawler - Use Case Discovery Tests ==="
echo ""

echo "1. Health Check"
curl -s "$BASE/api/health" | grep -q '"status":"ok"' && echo "   OK" || (echo "   FAIL"; exit 1)

echo ""
echo "2. Analyze Sync (example.com)"
ANALYSIS=$(curl -s -X POST "$BASE/api/analyze-sync" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com"}')
echo "$ANALYSIS" > "${TMP}_analysis.json"
if echo "$ANALYSIS" | grep -q '"ok":true'; then
  echo "   OK"
  echo "   Summary: $(echo "$ANALYSIS" | grep -o '"summary":"[^"]*"' | head -1 | cut -c1-60)..."
  echo "   pageContentExcerpt: $(echo "$ANALYSIS" | grep -o '"pageContentExcerpt":"[^"]*"' | wc -c) chars"
else
  echo "   FAIL: $(echo "$ANALYSIS" | grep -o '"error":"[^"]*"' | head -1)"
  exit 1
fi

echo ""
echo "3. Use Case Discovery"
RESULT=$(curl -s -X POST "$BASE/api/use-case-discovery" \
  -H "Content-Type: application/json" \
  -d "$(node -e "const d=JSON.parse(require('fs').readFileSync('${TMP}_analysis.json')); process.stdout.write(JSON.stringify(d.result||{}));")")
echo "$RESULT" > "${TMP}_ucd.json"
if echo "$RESULT" | grep -q '"ok":true'; then
  echo "   OK"
  COUNT=$(echo "$RESULT" | grep -o '"rank":[0-9]*' | wc -l)
  echo "   Use Cases: $COUNT"
  echo "   First: $(echo "$RESULT" | grep -o '"title":"[^"]*"' | head -1)"
else
  echo "   FAIL: $(echo "$RESULT" | grep -o '"error":"[^"]*"' | head -1)"
fi

rm -f "${TMP}"_*.json 2>/dev/null
echo ""
echo "=== Tests abgeschlossen ==="
