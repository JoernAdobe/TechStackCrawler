#!/usr/bin/env bash
# Öffnet den Stage-Onboarding-PR für TechStack Crawler in Adobe-Experience-Platform/aif (Fork-PR).
# Aufruf aus dem Repo-Root: bash project/scripts/open-gateway-pr.sh
set -euo pipefail
SRC="$(cd "$(dirname "$0")/../coworker-marketplace" && pwd)"
export GH_TOKEN="$(gh auth token -u daudert_adobe)"
# aep-ai wurde in aif umbenannt; aif erzwingt Fork-and-Pull (keine Branches im Upstream).
REPO=Adobe-Experience-Platform/aif
BRANCH=techstack-crawler-stage-onboarding
WORK="$(mktemp -d)"
ME="$(gh api user --jq .login)"

gh repo fork "$REPO" --clone=false --default-branch-only >/dev/null 2>&1 || true
for _ in $(seq 1 30); do gh api "repos/$ME/aif" --silent 2>/dev/null && break; sleep 2; done
gh repo sync "$ME/aif" --source "$REPO" >/dev/null 2>&1 || true

git clone --depth 1 --filter=blob:none --sparse "https://github.com/$REPO.git" "$WORK/aif"
cd "$WORK/aif"
git remote add fork "https://github.com/$ME/aif.git"
git config credential.helper '!gh auth git-credential'
HEAD_REF="$ME:$BRANCH"
git sparse-checkout set config/cxo-ai-gateway
git checkout -b "$BRANCH"
DEST=config/cxo-ai-gateway/environments/stage
cp "$SRC/gateway-stage-server-card.yaml" "$DEST/mcp_servers/techstack_crawler_mcp.yaml"
cp "$SRC/gateway-stage-manifest.yaml" "$DEST/manifests/techstack_crawler.yaml"
git add "$DEST"
git commit -m "cxo-ai-gateway(stage): onboard TechStack Crawler MCP on a scoped manifest"
git push -u fork "$BRANCH"

gh pr create --repo "$REPO" --base main --head "$HEAD_REF" \
  --title "cxo-ai-gateway(stage): onboard TechStack Crawler MCP (scoped manifest)" \
  --body "Stage-only onboarding of the TechStack Crawler MCP on its own manifest (\`techstack_crawler\`), as suggested in #coworker-gateway, to validate the Coworker plugin end to end. No prod card, no change to config.yaml targeting.

- Server card \`stage/mcp_servers/techstack_crawler_mcp.yaml\`: IMS passthrough, include_tools allowlist (4 tools), required_segments internal-orgs, read timeout 180s (analyze-url renders the page + LLM pass, ~30-90s).
- Manifest \`stage/manifests/techstack_crawler.yaml\`: only this card, reached via \`/mcp/collection/techstack_crawler?manifest_id=techstack_crawler\`.
- Upstream \`https://techstack.corp.adobe.com/mcp\` is a corp-network VM; reachability from the gateway's Ethos namespace still to be confirmed.
- Upstream auth validates the passthrough IMS token via IMS userinfo and allows adobe.com users only."

echo "PR erstellt. Workdir: $WORK"
