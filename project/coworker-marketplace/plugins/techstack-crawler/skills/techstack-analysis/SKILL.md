---
name: techstack-analysis
description: Analyze a public website's technology stack and, when requested, explore relevant Adobe use cases. Use when the user asks to inspect a website's technologies, digital experience stack, or Adobe opportunities.
---

# Website technology analysis

Use the `techstack-crawler` MCP integration only when the user asks for a website technology analysis or Adobe use-case discovery.

## Analyze a website

1. Use only the URL supplied by the user. If no URL is supplied, ask for one.
2. Confirm that the URL is a public website. Never try internal hostnames, private IP addresses, localhost, or URLs containing credentials.
3. Call the `analyze-url` tool of the `techstack-crawler` integration (typically exposed as `mcp__techstack-crawler__analyze-url`) with the URL.
4. Report detected technologies and the returned confidence/version details. Distinguish observed signals from inferred conclusions; do not invent vendors or versions.
5. Explain that results reflect publicly accessible pages at analysis time and can miss technologies loaded only on other pages or behind authentication.

## Adobe use cases

Only when the user asks for Adobe opportunities or use cases, and the analysis result contains an ID, call the `use-case-discovery` tool of the same integration with that analysis ID. Separate tool-backed findings from recommendations and do not claim that a recommendation is already implemented.

## Missing integration or errors

The plugin connects to the TechStack MCP server automatically and authenticates with the signed-in user's Adobe IMS identity; no token setup is required. Never ask the user for a token and never place tokens in prompts or chat history.

If no `analyze-url` tool from the `techstack-crawler` integration is available, authentication fails, or the tool returns an error, explain that the TechStack service is currently unavailable and do not fabricate an analysis.
