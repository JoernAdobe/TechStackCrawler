# Component Library

Copy-paste patterns for building reports. Class names are exact — do not alter them.

---

## Content → Component mapping

| Content type | Component to use |
|---|---|
| Intro / overview paragraph | Plain `<p>` in section body |
| 2–4 comparable items | `feature-grid` cards |
| Sequential or enumerated items | `step` blocks |
| Key facts, warnings, context notes | `note` callout |
| Data colour key / legend | `color-legend` |
| External link or file download | `dl-link` |
| Screenshot / diagram | `img-slot` with base64 src |
| Data table | `<table>` with inline styles |
| Sources for a section | `sources` block — **required at the bottom of every section** |

---

## HTML Shell

Full document boilerplate. Replace all `[PLACEHOLDERS]`. In the `client-domains` comment, list **every domain the client owns** (corporate, investor, regional, brand, careers, social profile hosts), comma-separated, e.g. `<!-- client-domains: acme.com, acme.co.uk, acmegroup.com -->`. The validator uses it to check that sources are not just the client's own sites.

```html
<!DOCTYPE html>
<html lang="en"><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<!-- client-domains: [CLIENT-DOMAIN.com], [OTHER-CLIENT-DOMAIN.com] -->
<title>[CLIENT NAME] — Client Report</title>
<style>
  /* INSERT FULL CONTENTS OF design/styles.css HERE */
</style>
</head>
<body>

<header>
  <div class="eyebrow">Adobe &nbsp;|&nbsp; Client Intelligence</div>
  <h1>[CLIENT NAME]</h1>
  <p class="sub">Account Overview &nbsp;|&nbsp; Updated: [MONTH YEAR]</p>
</header>

<div class="container">

  <div class="toc">
    <div class="toc-title">Contents</div>
    <ol>
      <li><a href="#s01">Company Overview</a></li>
      <li><a href="#s02">Products &amp; Services</a></li>
      <li><a href="#s03">Financial Performance</a></li>
      <li><a href="#s04">Digital Transformation &amp; Technology</a></li>
      <li><a href="#s05">Marketing &amp; Advertising Strategy</a></li>
      <li><a href="#s06">Social Media &amp; Content Strategy</a></li>
      <li><a href="#s07">SEO &amp; Search Visibility</a></li>
      <li><a href="#s08">Brand &amp; Website Portfolio</a></li>
      <li><a href="#s09">Competitive Landscape</a></li>
      <li><a href="#s10">Customer &amp; Market Profile</a></li>
      <li><a href="#s11">Regulatory &amp; Compliance</a></li>
      <li><a href="#s12">Stakeholder Mapping</a></li>
      <li><a href="#s13">Strategic Direction</a></li>
      <li><a href="#s14">Adobe Opportunity</a></li>
    </ol>
  </div>

  <!-- sections go here — see workflow/standard-sections.md -->

  <footer>
    <p>© [YEAR] Adobe. Adobe Internal Only. &nbsp;|&nbsp; Prepared by Adobe Account Intelligence</p>
  </footer>

</div>

<div id="navMenu" style="display:none;">
  <div class="nh">Jump to section</div>
  <a href="#s01" onclick="document.getElementById('navMenu').style.display='none'">Company Overview</a>
  <a href="#s02" onclick="document.getElementById('navMenu').style.display='none'">Products &amp; Services</a>
  <a href="#s03" onclick="document.getElementById('navMenu').style.display='none'">Financial Performance</a>
  <a href="#s04" onclick="document.getElementById('navMenu').style.display='none'">Digital Transformation</a>
  <a href="#s05" onclick="document.getElementById('navMenu').style.display='none'">Marketing Strategy</a>
  <a href="#s06" onclick="document.getElementById('navMenu').style.display='none'">Social Media &amp; Content</a>
  <a href="#s07" onclick="document.getElementById('navMenu').style.display='none'">SEO &amp; Search</a>
  <a href="#s08" onclick="document.getElementById('navMenu').style.display='none'">Brand &amp; Website Portfolio</a>
  <a href="#s09" onclick="document.getElementById('navMenu').style.display='none'">Competitive Landscape</a>
  <a href="#s10" onclick="document.getElementById('navMenu').style.display='none'">Customer &amp; Market Profile</a>
  <a href="#s11" onclick="document.getElementById('navMenu').style.display='none'">Regulatory &amp; Compliance</a>
  <a href="#s12" onclick="document.getElementById('navMenu').style.display='none'">Stakeholder Mapping</a>
  <a href="#s13" onclick="document.getElementById('navMenu').style.display='none'">Strategic Direction</a>
  <a href="#s14" onclick="document.getElementById('navMenu').style.display='none'">Adobe Opportunity</a>
</div>
<button id="navBtn" type="button" aria-label="Jump to section" aria-controls="navMenu" onclick="var m=document.getElementById('navMenu');m.style.display=m.style.display==='block'?'none':'block';">☰</button>

<script>
document.addEventListener('click', function (e) {
  if (!e.target.closest('#navMenu, #navBtn')) document.getElementById('navMenu').style.display = 'none';
});
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') document.getElementById('navMenu').style.display = 'none';
});
</script>

</body>
</html>
```

---

## Section bar heading — use this for every section

The section-bar replaces the old `eyebrow + h2` pattern. It renders a full-width black bar that breaks out of the container, with the category label in red above a white h2. Use it at the top of every `<div class="section">`.

```html
<div class="section-bar">
  <span class="s-label">EYEBROW LABEL</span>
  <h2>Section Heading.</h2>
</div>
```

Eyebrow labels and h2 text for each section are defined in `workflow/standard-sections.md`.

---

## Section wrapper

Every section follows this pattern. The `section-bar` replaces the standalone eyebrow + h2 — do not use both.

```html
<!-- Section: [Name] -->
<div class="section" id="s01">
  <div class="section-bar">
    <span class="s-label">EYEBROW LABEL</span>
    <h2>Section Heading.</h2>
  </div>
  <p style="font-size:13px;color:#333;line-height:1.65;">Opening paragraph.</p>
  <!-- components -->
</div>
<hr>
```

Note: omit the trailing `<hr>` on the **last** section (s14).

**Every section must end with a `sources` block** (see below) placed as the last child inside `<div class="section">`, after all other components and before the closing `</div>`.

---

## Sources block — required at the bottom of every section

Every section (s01–s14) must end with a `sources` block listing the specific sources used for that section's content. This makes each section independently verifiable.

Rules:
- List **2–5 sources per section** — the actual pages/reports used, not a generic homepage.
- **Include at least one independent source** (regulator filing, news agency, trade press, analyst or data tool, vendor/partner, platform) — a section whose sources are all the client's own sites is not acceptable, and client-owned sources must be no more than half of any section's list (~40% across the report). See `workflow/research-guide.md` → *Source independence*.
- Each entry: short source name + publisher + **publication date in (Mon YYYY) form**, so recency is visible at a glance.
- Prefer sources **less than 1 year old**; **2 years is the absolute maximum**. Only use something older when no recent source exists — and when you do, label it `(archival)` after the date.
- Use a real `href` where a public URL exists. For a source with no linkable URL (e.g. a paid database reading or an inferred detection), use a `<span class="no-link">` instead of an `<a>`.
- Do not fabricate URLs — only link to pages you actually retrieved.

```html
<div class="sources">
  <span class="sources-label">Sources</span>
  <a href="https://example.com/report" target="_blank" rel="noopener">Company FY24 Annual Report — Investor Relations (Mar 2025)</a>
  <a href="https://example.com/news" target="_blank" rel="noopener">"Headline of the article" — Financial Times (Jul 2025)</a>
  <span class="no-link">Tech stack detection via BuiltWith (checked Sep 2026)</span>
</div>
```

## Feature grid — 2–4 comparable items

Use for comparisons: two brands, two products, two metrics, two market segments.  
Always use an **even number** of cards (2 or 4).

```html
<div class="feature-grid">
  <div class="feature-card">
    <span class="tag-label">TAG LABEL</span>
    <h4>Card heading.</h4>
    <p>Card description text.</p>
  </div>
  <div class="feature-card">
    <span class="tag-label">TAG LABEL</span>
    <h4>Card heading.</h4>
    <p>Card description text.</p>
  </div>
</div>
```

---

## Step block — sequential or enumerated items

Use for numbered lists, brand breakdown lists, ranked priorities, or any ordered sequence.  
`.step-num` is hidden by CSS — omit it from new HTML. Each step renders with a thin red left-border accent.  
**Numbering:** where the section spec says "numbered" (s04, s13, s14) or the items are ranked, put the number in the title itself (`<strong>1. Initiative name.</strong>`). Otherwise use an unnumbered title.  
**Inline emphasis:** `.step-body strong` is `display:block`, so inside a step's `<p>` use `<b>Label:</b>` (not `<strong>`) for inline bold labels such as Fit / Outcome / Timing, or each label will break onto its own line.

```html
<div class="step">
  <div class="step-body">
    <strong>1. Step title.</strong>
    <p>Step description text.</p>
  </div>
</div>
```

---

## Cross-references — name the section, never its code

When text needs to point back to another section, **write the section's name and link it** — never "s05", "see s08" or similar codes, which mean nothing to a reader. Use the `xref` class and the section's exact name from `workflow/standard-sections.md`. Use them sparingly, only where the pointer helps the reader.

```html
…the multi-site estate described in <a class="xref" href="#s04">Digital Transformation &amp; Technology</a>…
```

---

## Note callout

Use for strategic context, timing signals, warnings, or anything the reader must not miss.

```html
<div class="note"><strong>Key label:</strong> Note text explaining the important point.</div>
```

---

## Color legend

Use in Financial Performance or Strategic Direction sections to label data categories.

```html
<div class="color-legend">
  <div class="color-item"><div class="color-box" style="background:#2D9CDB;"></div><strong>Blue — Label:</strong>&nbsp; description</div>
  <div class="color-item"><div class="color-box" style="background:#27AE60;"></div><strong>Green — Label:</strong>&nbsp; description</div>
  <div class="color-item"><div class="color-box" style="background:#EB1000;"></div><strong>Red — Label:</strong>&nbsp; description</div>
</div>
```

---

## Download / CTA link

Use for linking to external resources, decks, or portal pages.

```html
<a class="dl-link" href="[URL]" target="_blank" rel="noopener">↓ Link label</a>
```

---

## Image slot

Only use when a base64-encoded image is available. If no image, omit the block entirely.

```html
<div class="img-slot">
  <img src="data:image/png;base64,[BASE64_DATA]" alt="Description of image">
</div>
```

---

## Data table (inline-styled)

Use for structured data that doesn't fit a feature-grid (3+ columns, numerical data).

```html
<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;">
  <thead>
    <tr style="background:var(--gray-light);">
      <th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--red);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Column A</th>
      <th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--red);font-size:11px;text-transform:uppercase;letter-spacing:0.08em;">Column B</th>
    </tr>
  </thead>
  <tbody>
    <tr style="border-bottom:1px solid var(--gray-mid);">
      <td style="padding:8px 12px;">Value</td>
      <td style="padding:8px 12px;">Value</td>
    </tr>
  </tbody>
</table>
```
