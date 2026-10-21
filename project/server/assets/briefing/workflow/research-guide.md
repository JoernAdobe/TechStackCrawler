# Research Guide

Complete this research before writing any HTML. Work through each section's questions in order. Every answer becomes source material; do not invent data.

---

## Intake — before the first search

1. **Get today's date from the system** (e.g. `date +%Y-%m-%d`). Use it for the "Updated: [Month Year]" header, the footer year, and the year in search queries. Never assume the year.
2. **Confirm the entity.** If the name is ambiguous (e.g. "Sky", "EMS", a company with a parent and several subsidiaries), ask which legal entity and region the report covers. If it is unambiguous, state your assumption in one line and continue.
3. **Check for an existing report** at `clients/<kebab-name>/`. If one exists, ask whether to **update** it (overwrite) or **keep both**. When keeping both, save the new one as `<kebab-name>-client-report-YYYY-MM-DD.html` (today's date) and leave the old file untouched. Never overwrite silently.
4. **Read the reference report** `examples/example report.html` for structure, format, prose style and the s14 layout. It predates the source-independence rules below, so do not copy its sourcing. Never copy its facts.

---

## Recency & sourcing rules (apply to every search)

- **Always search for the latest available information.** Do a full, fresh search per topic — do not rely on prior knowledge or a single result.
- **Target sources less than 1 year old.** Add the current year (and, where useful, "latest" / a recent quarter) to queries, e.g. `Sky Group revenue 2025`, `Sky CEO 2026`, `Sky martech latest`.
- **2 years is the absolute maximum.** Only fall back to something older when no more recent source exists for that fact — and when you do, mark it `(archival)` in the source date.
- If the freshest figure you can find is stale (e.g. only an older annual report exists), **say so explicitly** in the section text and flag it in your pre-HTML summary.
- **Capture the source for every fact as you go.** For each section, keep a running list of the 2–5 sources you actually used, each with: title, publisher, URL (if public), and publication date. These become that section's `sources` block.
- Do not fabricate URLs or dates. Only cite pages you actually retrieved. If a fact came from a non-linkable source (paid DB, tool detection, inference), record it as a no-link note.

---

## Source independence — the client's own website is not enough

The client's own sites (corporate, investor, regional, brand, careers, newsroom, press releases and social profiles) tell you **what the client says about itself**. That is the right source for legal facts, leadership, official figures and stated strategy — and **nothing else**. Performance, competition, technology, search, social reach, regulatory exposure, stakeholder priorities and every evaluative claim need an **independent** source.

**Rules (the validator enforces them):**
1. **Every section has at least one independent source** (a source not owned by the client). A section whose sources are all client-owned fails.
2. **No more than half of a section's sources, and no more than ~40% of the whole report's, may be client-owned.** Ownership includes subsidiaries, investor-relations sites, regional domains and company-run social profiles.
3. **Corroborate headline numbers** (revenue, profit, headcount, leadership changes) with an independent source — a regulatory filing, news agency, financial or trade press.
4. **"Not publicly available" must be earned.** Write it only after trying at least two independent routes for that data point (e.g. BuiltWith **and** job postings for tech stack), and say which routes you tried in the note or the sources block. Do not leave a fact blank just because the client's own site does not state it.
5. **Declare the client's domains** in the report's `<!-- client-domains: … -->` comment (see `design/components.md`) — every domain the client owns, including non-obvious ones (e.g. `bat.com` for British American Tobacco).

**Search technique:** for every section run at least one query that excludes the client's own domain (e.g. `"Company Name" agency review -site:companyname.com`), plus topic queries that name third parties (`"Company Name" BuiltWith`, `"Company Name" CMO interview`, `"Company Name" profit warning`). **Retry cap:** if a search or fetch fails twice (errors, timeouts, empty results), stop, note the gap in the report with the routes tried, and move on — do not keep retrying.

**Where to look beyond the client's own site:**

| Section | Independent sources to try |
|---|---|
| s01 Company Overview | Companies House / SEC / national registry, stock-exchange announcements (RNS), Reuters, FT, Bloomberg, Wikipedia (lead only) |
| s02 Products & Services | Trade press for the sector, analyst notes, product reviews, retailer / marketplace listings |
| s03 Financial Performance | Regulatory filings (RNS, SEC, Companies House), results coverage in Reuters / FT / Sharecast / trade press, broker or analyst commentary |
| s04 Digital & Technology | BuiltWith, Wappalyzer, job postings (LinkedIn, Indeed), vendor case studies and partner press releases, conference talks, trade press |
| s05 Marketing & Advertising | Campaign, Marketing Week, The Drum, Adweek, agency award entries and case studies, Ad Library / ad-intelligence tools |
| s06 Social & Content | The platforms themselves (follower counts, with date), Social Blade, trade press on creator / content programmes |
| s07 SEO & Search | SimilarWeb, Semrush, Ahrefs, SpyFu, PageSpeed Insights, own AI-answer checks (ChatGPT, Google AI Overviews) — record the date |
| s08 Brand & Website | BuiltWith / Wappalyzer per domain, Wayback Machine, accessibility audits or complaints, trade press on redesigns |
| s09 Competitive Landscape | Competitors' own results and sites, sector trade press, analyst / market-share reports, Reuters / FT comparisons |
| s10 Customer & Market | Industry and market reports, analyst commentary, trade press, review sites (Trustpilot, Glassdoor), statistics offices |
| s11 Regulatory & Compliance | Regulator sites and decisions (ICO, FCA, Ofcom, CNIL, FTC…), EUR-Lex, law-firm briefings, news on fines / investigations |
| s12 Stakeholder Mapping | Executive interviews and conference talks, trade press profiles, LinkedIn (public), stock-exchange announcements on appointments |
| s13 Strategic Direction | Investor-day / capital-markets-day coverage, analyst and press commentary, M&A news, sustainability-rating bodies |
| s14 Adobe Opportunity | Adobe's own sources for product facts (`workflow/adobe-products.md`); the client facts it relies on come from s01–s13 |

---

## s01 — Company Overview

- [ ] Full legal name and any trading names
- [ ] Headquarters city and country
- [ ] Parent company / holding group / ownership structure
- [ ] Year founded or year of current corporate structure
- [ ] Approximate headcount (total employees, key regions)
- [ ] Current CEO and any other C-suite relevant to Adobe (CMO, CTO, CDO, CPO)
- [ ] One-sentence description of what the company does and who it serves
- [ ] Any major corporate event in last 12 months (acquisition, merger, restructure, new leadership)

---

## s02 — Products & Services

- [ ] Full list of product lines, services, or brands
- [ ] Revenue or strategic weighting of each major line (if public)
- [ ] Any lines being sunset, launched, or repositioned
- [ ] Sub-brands or divisions with their own identity/team
- [ ] Physical vs. digital product split (if relevant)
- [ ] International product variation (e.g. different SKUs by market)

---

## s03 — Financial Performance

- [ ] Most recent full fiscal year: revenue, gross profit, operating profit/EBIT, net income
- [ ] Prior year comparables for trend (YoY growth/decline %)
- [ ] Most recent quarter if available
- [ ] Volume metrics relevant to the industry (units sold, subscribers, GMV, etc.)
- [ ] Annual investment or capex budget if public (relevant to tech spend signals)
- [ ] Any profit warnings, guidance revisions, or analyst downgrades in last 12 months
- [ ] Fiscal year end date (not all companies use calendar year)

---

## s04 — Digital Transformation & Technology

- [ ] Known CMS or web platform (BuiltWith, Wappalyzer, or job postings)
- [ ] Known analytics platform (Google Analytics, Adobe Analytics, other)
- [ ] Known commerce platform or checkout stack
- [ ] Known CRM (Salesforce, Microsoft Dynamics, SAP, other)
- [ ] Known CDP or DMP
- [ ] Known marketing automation platform (Marketo, HubSpot, Eloqua, other)
- [ ] Any major digital transformation programme (named initiative, vendor, timeline)
- [ ] E-commerce presence: own-site, third-party marketplace, or both
- [ ] App or mobile strategy
- [ ] Named technology partnerships or vendors announced publicly
- [ ] Digital headcount signals (job postings, LinkedIn)

---

## s05 — Marketing & Advertising Strategy

- [ ] Known global creative or media agency of record
- [ ] Any active agency reviews or recent account moves
- [ ] Stated brand positioning or tagline
- [ ] Notable campaigns in the last 24 months
- [ ] Primary paid channels (TV, OOH, digital display, search, social, influencer)
- [ ] Known marketing technology stack (DSP, attribution, personalisation)
- [ ] CMO name and tenure
- [ ] Estimated annual media spend (if reported by trade press)
- [ ] Any award-winning or culturally significant campaign work

---

## s06 — Social Media & Content Strategy

- [ ] Primary social platforms (Instagram, TikTok, YouTube, LinkedIn, X, Facebook, Pinterest, etc.)
- [ ] Follower count on each major platform (note date of check)
- [ ] Estimated average engagement rate per platform (if detectable)
- [ ] Content format mix: video vs. static vs. stories vs. live
- [ ] Posting cadence (daily / weekly / event-driven)
- [ ] Evidence of influencer or creator programme (named partners, ambassador schemes)
- [ ] Social commerce: shoppable posts, native checkout, TikTok Shop, etc.
- [ ] Any paid social amplification signals (boosted posts, dark ads, Meta Ads Library)
- [ ] UGC strategy or community-building initiatives
- [ ] Content production model: in-house studio, agency, UGC-first, or hybrid
- [ ] Any content bottleneck signals (inconsistent cadence, low production value, delayed localisation)

---

## s07 — SEO & Search Visibility

- [ ] Estimated monthly organic search traffic (SimilarWeb, SEMrush, or Ahrefs if available)
- [ ] Domain authority / domain rating score
- [ ] Top organic keyword categories (product, brand, informational)
- [ ] Known SEO agency or in-house SEO team signals (job postings, Linkedin)
- [ ] Paid search presence: Google Ads, Bing Ads (SEM signals from auction insights or SpyFu)
- [ ] Evidence of AI-search visibility: is brand/product mentioned in AI overviews, ChatGPT answers?
- [ ] Any major algorithm update impacts (traffic drops or gains in last 12 months)
- [ ] International / multilingual SEO: hreflang implementation, local domain strategy
- [ ] Core Web Vitals or page speed signals (PageSpeed Insights)
- [ ] Gap between organic and paid share of voice that creates a content opportunity

---

## s08 — Brand & Website Portfolio

- [ ] All primary web domains and microsites (list each with country/language)
- [ ] CMS or platform behind each major domain (BuiltWith, Wappalyzer)
- [ ] Number of languages or locale variants supported
- [ ] Evidence of site fragmentation (different platforms per market, orphaned microsites)
- [ ] Evidence of any site consolidation programme in progress
- [ ] Accessibility compliance signals (WCAG statement, known litigation, third-party audits)
- [ ] Mobile-first or responsive design status
- [ ] Any brand refresh or site redesign announced or in progress
- [ ] Campaign landing page or microsite volume (signals content production scale)

---

## s09 — Competitive Landscape

- [ ] Top 3–5 direct competitors by market segment
- [ ] Approximate market share split if publicly reported (industry reports, analyst coverage)
- [ ] Competitor digital spend signals (SimilarWeb rank, paid search overlap)
- [ ] Competitor recent moves: product launches, acquisitions, rebrands, price changes
- [ ] How does the client position against competitors (premium/value, innovation/heritage, global/local)?
- [ ] Any competitor that is clearly outpacing the client on digital or content production
- [ ] Any competitor recently won or lost an Adobe contract (useful for competitive urgency)
- [ ] Analyst or media commentary on competitive dynamics in the last 12 months

---

## s10 — Customer & Market Profile

- [ ] Primary customer demographic: age range, income band, gender split (if public)
- [ ] Primary customer psychographic: values, lifestyle, motivations
- [ ] Top 3–5 geographic markets by revenue or volume
- [ ] Markets with fastest growth or strategic priority
- [ ] Any underserved or new audience being targeted
- [ ] Customer lifetime value or retention signals (if public)
- [ ] D2C vs. retail/partner channel split

---

## s11 — Regulatory & Compliance

- [ ] Key data privacy regulations applicable to the client's markets (GDPR, CCPA, PDPA, etc.)
- [ ] Any sector-specific regulation (financial services, healthcare, automotive, media)
- [ ] Documented consent management or cookie compliance approach (CMP vendor, OneTrust, etc.)
- [ ] Any active regulatory investigations, fines, or enforcement actions
- [ ] Accessibility obligations (EN 301 549, ADA, EAA 2025 deadline)
- [ ] AI / algorithmic regulation exposure (EU AI Act, UK OFCOM online safety)
- [ ] Any data residency or sovereignty requirements affecting cloud or platform choice
- [ ] Evidence of compliance-driven technology investment (DPA appointments, privacy-tech job posts)

---

## s12 — Stakeholder Mapping

- [ ] CMO: name, tenure, reported priorities, recent public statements or conference appearances
- [ ] CTO / CIO: name, tenure, known technology philosophy, vendor preferences
- [ ] CDO / Chief Digital Officer: name, scope of role, key initiatives
- [ ] CPO / Chief Product Officer (if relevant): name and scope
- [ ] CFO: name, known stance on technology investment vs. cost reduction
- [ ] Any recent C-suite hires or departures that shift buying dynamics
- [ ] Evidence of internal tension: marketing vs. IT ownership of digital, brand vs. performance split
- [ ] Known internal champions of digital transformation or MarTech investment
- [ ] Known blockers: procurement centralisation, existing enterprise agreements, political dynamics

---

## s13 — Strategic Direction

- [ ] Named multi-year strategy or transformation programme with public documentation
- [ ] Key strategic pillars (3–5 top priorities)
- [ ] Electrification, sustainability, or ESG commitments with targets and dates
- [ ] M&A activity: acquisitions, divestments, or JVs in last 24 months
- [ ] New market entries or geographic expansion plans
- [ ] Any regulatory or geopolitical factors affecting strategy (tariffs, compliance, data residency)
- [ ] Investor Day or analyst presentations with forward guidance

---

## s14 — Adobe Opportunity

Map each finding from s01–s13 to a specific Adobe product using `workflow/adobe-products.md` (current product names, what each solves, the client signals that justify it). For each opportunity, answer:

1. **What is the client's pain point or initiative?** (cite the section where this was identified)
2. **Which Adobe product solves it?** (be specific and use the current name, e.g. Adobe Experience Platform, not just "Experience Cloud")
3. **What is the measurable outcome the client would care about?** (faster content production, higher conversion, reduced agency fees, unified customer data, etc.)
4. **Is there a timing signal?** (platform migration, agency review, new product launch, fiscal year start, regulatory deadline)

Prioritise 4–6 opportunities. Rank by deal size potential × timing proximity.

---

## Research tactics (lessons from live runs)

**Speed**
- Batch independent searches and fetches in parallel; do not run them one at a time.
- Verify **headline numbers and named people** with a fetch; supporting colour can rest on a search citation you have read.
- If a search or fetch fails twice, stop, record the gap ("not verified in this pass" plus the routes tried) and move on.
- Do not fetch raw PDFs through the web fetcher — they return unreadable binary and waste context. Use the HTML/RNS version, a trade-press write-up, or skip.

**Trust**
- A search tool's synthesised summary can **guess** (for example "sites like this often use Sitecore or WordPress"). Use only facts you can see in a retrieved page, a citation you have read, or your own observation.
- **Do not name people from aggregator or contact-data sites** (RocketReach, Craft, GlobalData, ContactOut, Bayt, "company executives" scrapers). They conflict with each other. Use filings, the company's own leadership page, the company's announcements, trade press or a conference listing — and if sources disagree, leave the role unnamed and say so.
- Ownership percentages and headcounts from aggregators are not verified facts; say "not verified" or use the filing.

**Observe the live site (s04, s07, s08)**
- Inspect response headers, script hosts, page markup, `robots.txt` and the declared locale alternates (`hreflang` count). This is observed evidence, not something the client says, and is recorded as a no-link note such as `Page-source inspection of example.com (checked Oct 2026)`.
- If `curl` is bot-blocked (a "noindex Information Page", a 403 or a tiny page), **use a real browser** (browser tools) and read the loaded page's scripts, globals (`__NEXT_DATA__`, `dataLayer`, `OneTrust`), links and `robots.txt`. Say if tags only load after consent.
- Do not claim a vendor is absent because it was not seen before consent. Say what was and was not visible.
- Tell-tale markers: AEM (`/etc.clientlibs`, `/content/dam`, `aem-GridColumn`, `data-cmp-*`), Sitecore, Next.js (`__NEXT_DATA__`), OneTrust/Cookiebot, Google Tag Manager, Akamai/Fastly/Cloudflare headers.
- **Check whether the client already runs Adobe products.** If so, frame s14 as extend-and-measure, not a first purchase, and name what was observed.

**Thin sections**
- If a section could not be researched to a verifiable standard, say so in its opening paragraph, list the routes tried, and carry the gap into the hand-off summary. Do not pad it with unverified claims.

---

## Research quality bar

- Use named sources where possible (annual report, investor day, trade press byline)
- Prefer sources under 1 year old; never older than 2 years unless nothing newer exists (then mark `(archival)`)
- For financial data, note the fiscal year and reporting date
- For tech stack, note the detection method (BuiltWith / job posting / press release)
- For social metrics, note the date of observation
- Flag any data that is estimated or inferred rather than stated
- If a data point cannot be found, note it as "not publicly available" rather than omitting or inventing
- Every section carries 2–5 dated sources into its `sources` block — collect these during research, not afterwards
- Every section includes at least one **independent** (non-client-owned) source; the client's own site is never the only evidence (see *Source independence* above)
