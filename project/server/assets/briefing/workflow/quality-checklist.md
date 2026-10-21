# Quality Checklist

Run through every item after writing the report and before telling the user it is finished. A single unchecked item means the report is not ready. Fix failures with targeted edits to the saved file.

---

## Structure

- [ ] Exactly 14 sections present, in the order defined in `workflow/standard-sections.md`
- [ ] Section IDs are `s01` through `s14` — no gaps, no duplicates, no alternative names
- [ ] TOC has exactly 14 `<li>` entries with `href="#s01"` through `href="#s14"`
- [ ] Hamburger nav has exactly 14 `<a>` entries with `href="#s01"` through `href="#s14"`
- [ ] `<hr>` separates every section **except** after s14
- [ ] Each section uses the **section-bar** heading pattern (`.section-bar` div with `.s-label` and `h2`) — not a plain eyebrow + h2
- [ ] Each section has: section-bar, at least one paragraph, at least one component
- [ ] **Every section (s01–s14) ends with a `sources` block** as its last child, before the closing `</div>`

---

## Design system

- [ ] `<style>` block contains the full, unabbreviated content of `design/styles.css`
- [ ] No `@font-face` rules present
- [ ] No external stylesheet `<link>` tags
- [ ] CSS variables match: `--red: #EB1000`, `--gray-light: #F5F5F5`, `--gray-mid: #E8E8E8`
- [ ] All `.s-label` text inside section-bar headings matches eyebrow labels defined in `workflow/standard-sections.md`

---

## Content

- [ ] No placeholder text remaining (e.g. `[CLIENT NAME]`, `[YEAR]`, `[MONTH YEAR]`, `TBD`, `TODO`)
- [ ] No invented or hallucinated data — every fact traces to research
- [ ] Every `sources` block lists 2–5 real, dated sources (each with `(Mon YYYY)`)
- [ ] Sources are under 1 year old wherever possible; none older than 2 years unless marked `(archival)`
- [ ] **Source independence:** every section has at least one independent (non-client-owned) source; client-owned sources are ≤ half of each section and ~40% or less of the report
- [ ] `<!-- client-domains: … -->` comment lists every domain the client owns
- [ ] Every "not publicly available" note was preceded by at least two independent search routes (named in the text or sources)
- [ ] Headline numbers (revenue, profit, headcount, leadership changes) are corroborated by an independent source
- [ ] No people are named from aggregator or contact-data sites; conflicting role holders were left unnamed
- [ ] Any thin or unverified section says so in its opening paragraph and the routes tried are listed
- [ ] No fabricated URLs — every `sources` link points to a page that was actually retrieved
- [ ] Footer reads: `© [current year] Adobe. Adobe Internal Only. &nbsp;|&nbsp; Prepared by Adobe Account Intelligence` (exactly as in the shell)
- [ ] `<title>` reads `[Client name] — Client Report`
- [ ] Header eyebrow reads: `Adobe &nbsp;|&nbsp; Client Intelligence`
- [ ] Header subtitle reads: `Account Overview &nbsp;|&nbsp; Updated: [Month Year]` — month/year taken from the system date, not assumed
- [ ] s14 Adobe Opportunity section: every recommendation names a specific Adobe product, not a cloud family
- [ ] s14 Adobe Opportunity section: every product name is current per `workflow/adobe-products.md` (renamed products use the new name)
- [ ] s14 Adobe Opportunity section: every recommendation references a specific client fact from the earlier sections
- [ ] s14 steps are titled `N. Adobe Product (detail) — headline benefit` and written as one flowing paragraph each — **no "Fit:", "Outcome:" or "Timing:" labels** (match `examples/example report.html`)
- [ ] No section codes (`s05`, `see s08`, …) appear in the text; references to other sections use the section's name as an `xref` link
- [ ] s10 does not repeat s09's competitor positioning

---

## Components

- [ ] All feature-grids have an even number of cards (2 or 4)
- [ ] Numbered sequences (s04, s13, s14 and any ranked list) put the number in the step title (`1. Title.`) — `.step-num` is hidden and must not be used
- [ ] All `<a>` hrefs in TOC and hamburger nav use `#anchor` — no `file://` paths
- [ ] All `<img>` tags use `src="data:image/...;base64,..."` — no external URLs, no relative paths
- [ ] `dl-link` elements have a valid `href` — no empty or placeholder URLs

---

## File output

- [ ] `python3 scripts/validate-report.py <report>` exits 0 (automated structure, CSS, sources and link checks) — fix every reported error
- [ ] Filename is `<kebab-case-client-name>-client-report.html` (or `...-client-report-YYYY-MM-DD.html` when keeping an earlier version)
- [ ] File saved to `clients/<kebab-case-client-name>/` — not the project root, and never inside the skill folder
- [ ] No earlier report was overwritten without the user's say-so
- [ ] File opens correctly in a browser with no internet connection
- [ ] Absolute path printed to terminal after saving
