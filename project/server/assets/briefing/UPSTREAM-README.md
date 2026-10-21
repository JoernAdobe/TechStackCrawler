# Adobe Client Intelligence Reports

Generates Adobe-branded, single-page HTML **client intelligence reports** for the Sales/Account team: a fixed 14-section structure, one design system, dated sources in every section, and an Adobe opportunity section (s14) tied to facts from the research.

Reports are produced by an AI agent (Claude Code, GitHub Copilot, …) following the skill and instructions in this repository.

## Quick start

**Requirements:** an agent with web search and file read/write (Claude Code recommended); Python 3 for the optional validator.

```bash
git clone https://github.com/AdobeChrisW/Client-Report.git
cd Client-Report
scripts/install-skill.sh              # personal install -> ~/.claude/skills/adobe-client-report
# or: scripts/install-skill.sh --project /path/to/your/project
```

Restart your agent session, `cd` to the folder where you want reports saved, then ask:

> new client report for *Company Name*

The agent will confirm the company, research all 14 sections (showing progress), write the report to `clients/<company>/<company>-client-report.html` in your current folder, validate it, and print the absolute path. Open the file in any browser — it is fully self-contained and works offline.

**No installer?** Copy the `adobe-client-report/` folder to `~/.claude/skills/adobe-client-report/` (or `<project>/.claude/skills/adobe-client-report/`). The folder is self-contained: `SKILL.md`, `design/`, `workflow/`, `examples/`, `scripts/`. A GitHub ZIP download works the same way.

**Single-file tools** (no folder support): upload `export/adobe-client-report-SKILL.md`. It embeds the design system and workflow files but not the example or validator.

**Working inside this repo** (Claude Code, GitHub Copilot, other `AGENTS.md`-aware agents): the instructions load automatically from `AGENTS.md` — just ask for a client report.

## What's in the repo

| Path | Purpose |
|---|---|
| `AGENTS.md` | Single source of truth for agent instructions (`CLAUDE.md` and `.github/copilot-instructions.md` point to it) |
| `design/` | `styles.css` (injected verbatim into every report) and `components.md` (HTML shell + component patterns) |
| `workflow/` | The 14 sections, research guide (incl. intake), quality checklist, current Adobe product reference |
| `examples/` | `example report.html` — the **single reference** for structure, format, prose style and s14 layout. It predates the source-independence rules and the latest CSS, so follow `workflow/research-guide.md` for sourcing. Never reuse its facts |
| `scripts/` | `validate-report.py`, `build-skill.py`, `install-skill.sh` |
| `adobe-client-report/` | Installable skill: hand-written `SKILL.md` plus generated copies of the files above |
| `export/` | Generated single-file version of the skill |
| `clients/` | Your generated reports — **git-ignored** (they contain account research) |

## Validating a report

```bash
python3 scripts/validate-report.py clients/acme/acme-client-report.html
```

Checks: 14 sections `s01`–`s14` in order, section-bar headings, TOC/nav links, a 2–5 entry dated `sources` block ending every section (age rules), **source independence** (every section needs at least one non-client source; client-owned sources must stay at or below about 40% of the report — it reads the client's domains from the `client-domains` comment), verbatim `design/styles.css`, no external resources or placeholders, header/footer text, feature-grid card counts, and s14 structure (4–6 numbered, named Adobe products). It cannot judge accuracy — the agent still works through `workflow/quality-checklist.md`.

## Changing the standards

1. Edit the canonical files only: `design/`, `workflow/`, `examples/`, `scripts/validate-report.py`, `adobe-client-report/SKILL.md`, `AGENTS.md`.
2. Run `python3 scripts/build-skill.py` to regenerate the bundle copies and the single-file export (`--check` verifies nothing is stale).
3. Commit everything, including the regenerated files.

Update `workflow/adobe-products.md` whenever Adobe renames or launches products — s14 depends on it.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Agent doesn't offer the skill | Check the folder is exactly `…/.claude/skills/adobe-client-report/SKILL.md`, then restart the session |
| Two client-report skills trigger | Remove or move older ones (e.g. `~/.claude/skills/new-client-report`, which predates these rules) — the installer warns about this. The installed skill's name is `adobe-client-report` (slash command `/adobe-client-report`) |
| Report saved in the wrong place | Reports go to `clients/` under the agent's *current working directory* — `cd` first |
| Validator says CSS differs | The report must contain `design/styles.css` verbatim; re-inject it (older reports predate the latest CSS) |
| No web search available | Research is mandatory — use an agent/mode with web access |

Internal use only — reports are marked *Adobe Internal Only*.
