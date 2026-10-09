#!/usr/bin/env bash
# Öffnet den Stage-Onboarding-PR für TechStack Crawler in Adobe-Experience-Platform/aep-ai.
# Aufruf aus dem Repo-Root: bash project/scripts/open-gateway-pr.sh
set -euo pipefail
SRC="$(cd "$(dirname "$0")/../coworker-marketplace" && pwd)"
export GH_TOKEN="$(gh auth token -u daudert_adobe)"
REPO=Adobe-Experience-Platform/aep-ai
BRANCH=techstack-crawler-stage-onboarding
WORK="$(mktemp -d)"

if [ "$(gh api "repos/$REPO" --jq '.permissions.push')" = "true" ]; then
  gh repo clone "$REPO" "$WORK/aep-ai" -- --depth 1 --filter=blob:none --sparse
  HEAD_REF="$BRANCH"
else
  gh repo fork "$REPO" --clone=false >/dev/null 2>&1 || true
  ME="$(gh api user --jq .login)"
  gh repo clone "$ME/aep-ai" "$WORK/aep-ai" -- --depth 1 --filter=blob:none --sparse
  HEAD_REF="$ME:$BRANCH"
fi

cd "$WORK/aep-ai"
git sparse-checkout set config/cxo-ai-gateway
git checkout -b "$BRANCH"
DEST=config/cxo-ai-gateway/environments/stage
cp "$SRC/gateway-stage-server-card.yaml" "$DEST/mcp_servers/techstack_crawler_mcp.yaml"
cp "$SRC/gateway-stage-manifest.yaml" "$DEST/manifests/techstack_crawler.yaml"
git add "$DEST"
git commit -m "cxo-ai-gateway(stage): onboard TechStack Crawler MCP on a scoped manifest"
git push -u origin "$BRANCH"

gh pr create --repo "$REPO" --base main --head "$HEAD_REF" \
  --title "cxo-ai-gateway(stage): onboard TechStack Crawler MCP (scoped manifest)" \
  --body "Stage-only onboarding of the TechStack Crawler MCP on its own manifest (\`techstack_crawler\`), as suggested in #coworker-gateway, to validate the Coworker plugin end to end. No prod card, no change to config.yaml targeting.

- Server card \`stage/mcp_servers/techstack_crawler_mcp.yaml\`: IMS passthrough, include_tools allowlist (4 tools), required_segments internal-orgs, read timeout 180s (analyze-url renders the page + LLM pass, ~30-90s).
- Manifest \`stage/manifests/techstack_crawler.yaml\`: only this card, reached via \`/mcp/collection/techstack_crawler?manifest_id=techstack_crawler\`.
- Upstream \`https://techstack.corp.adobe.com/mcp\` is a corp-network VM; reachability from the gateway's Ethos namespace still to be confirmed.
- Upstream auth validates the passthrough IMS token via IMS userinfo and allows adobe.com users only."

echo "PR erstellt. Workdir: $WORK"
