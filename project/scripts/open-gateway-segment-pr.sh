#!/usr/bin/env bash
# Fügt eine IMS-Org dem Stage-Segment internal-orgs in Adobe-Experience-Platform/aif hinzu (Fork-PR).
# Nötig, weil die TechStack-Card required_segments: internal-orgs hat; Orgs außerhalb sehen das Tool nicht.
# Aufruf aus dem Repo-Root: bash project/scripts/open-gateway-segment-pr.sh <ORG_ID@AdobeOrg> "<Org-Name>"
set -euo pipefail
ORG="${1:?IMS-Org-ID fehlt (…@AdobeOrg)}"
NAME="${2:?Org-Name fehlt}"
[[ "$ORG" =~ ^[0-9A-F]{24}@AdobeOrg$ ]] || { echo "Ungültige IMS-Org-ID: $ORG"; exit 1; }
export GH_TOKEN="$(gh auth token -u daudert_adobe)"
REPO=Adobe-Experience-Platform/aif
BRANCH="stage-internal-orgs-${ORG%@AdobeOrg}"
FILE=config/cxo-ai-gateway/environments/stage/segments/internal-orgs.yaml
WORK="$(mktemp -d)"
ME="$(gh api user --jq .login)"

gh repo fork "$REPO" --clone=false --default-branch-only >/dev/null 2>&1 || true
gh repo sync "$ME/aif" --source "$REPO" >/dev/null 2>&1 || true

git clone --depth 1 --filter=blob:none --sparse "https://github.com/$REPO.git" "$WORK/aif"
cd "$WORK/aif"
git remote add fork "https://github.com/$ME/aif.git"
git config credential.helper '!gh auth git-credential'
git sparse-checkout set config/cxo-ai-gateway/environments/stage/segments
git checkout -b "$BRANCH"
grep -q "$ORG" "$FILE" && { echo "Org steht schon im Segment."; exit 0; }
printf '  - %s  # %s\n' "$ORG" "$NAME" >> "$FILE"
git add "$FILE"
git commit -m "cxo-ai-gateway(stage): add $NAME to internal-orgs segment"
git push -u fork "$BRANCH"

gh pr create --repo "$REPO" --base main --head "$ME:$BRANCH" \
  --title "cxo-ai-gateway(stage): add $NAME to internal-orgs segment" \
  --body "Stage-only. Adds the internal Adobe stage org \`$ORG\` ($NAME) to the stage \`internal-orgs\` segment.

Reason: the TechStack Crawler card (Adobe-Experience-Platform/aif#18968) is gated by \`required_segments: internal-orgs\`. The stage segment only lists CJM Stage and AEP Quality VA7 Stage, so in this org the plugin installs but the gateway hides the tools. This org is where I test CX Coworker stage. Upstream additionally restricts to adobe.com users via IMS userinfo."

echo "PR erstellt. Workdir: $WORK"
