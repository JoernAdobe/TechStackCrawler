#!/usr/bin/env python3
"""Validate an Adobe client report against the project rules.

Usage: python3 scripts/validate-report.py <report.html> [--allow-css-drift]

Checks the structural items from workflow/quality-checklist.md that can be
verified mechanically. Exit code 0 = no errors (warnings are allowed),
1 = one or more errors, 2 = usage / file problems.
Standard library only.
"""
import re
import sys
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
TODAY = date.today()


class Node:
    def __init__(self, tag, attrs, parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children, self.text = [], []

    @property
    def classes(self):
        return (self.attrs.get("class") or "").split()

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()

    def inner_text(self):
        parts = list(self.text)
        for c in self.children:
            parts.append(c.inner_text())
        return " ".join(p.strip() for p in parts if p.strip())

    def find_all(self, tag=None, cls=None):
        return [n for n in self.walk() if (tag is None or n.tag == tag) and (cls is None or cls in n.classes)]


class Builder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", [])
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.cur)
        self.cur.children.append(node)
        if tag not in VOID:
            self.cur = node

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.text.append(data)


def expected_sections():
    """Parse eyebrow labels from workflow/standard-sections.md (unescaped)."""
    path = ROOT / "workflow" / "standard-sections.md"
    out = {}
    if not path.exists():
        return out
    text = path.read_text(encoding="utf-8")
    for m in re.finditer(r"^## (s\d\d) — .*?\n\*\*Eyebrow:\*\* `([^`]*)`", text, re.S | re.M):
        out[m.group(1)] = m.group(2).replace("&amp;", "&").strip()
    return out


def norm(s):
    return re.sub(r"\s+", " ", s.replace("&amp;", "&").replace("\u00a0", " ")).strip()


def source_date(text):
    m = re.search(r"\((?:[^)]*?\b)?(%s)[a-z]* (\d{4})[^)]*\)" % "|".join(MONTHS), text)
    if not m:
        return None
    return int(m.group(2)), MONTHS.index(m.group(1)) + 1


def host_of(url):
    host = re.sub(r"^https?://", "", url.strip().lower()).split("/")[0].split(":")[0]
    return host[4:] if host.startswith("www.") else host


def client_owned(host, key, declared):
    """True if the host belongs to the client: a declared domain, or a host label containing the client name."""
    if any(host == d or host.endswith("." + d) for d in declared):
        return True
    labels = host.split(".")[:-1]  # ignore the TLD
    for lab in labels:
        lab = lab.replace("-", "")
        if key and (len(key) >= 5 and key in lab or len(key) < 5 and lab.startswith(key)):
            return True
    return False


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    allow_css_drift = "--allow-css-drift" in argv
    if len(args) != 1:
        print(__doc__)
        return 2
    path = Path(args[0])
    if not path.is_file():
        print(f"File not found: {path}")
        return 2
    raw = path.read_text(encoding="utf-8")
    is_example = False  # no frozen example report is exempt from the source-age rules
    errors, warnings = [], []
    err, warn = errors.append, warnings.append

    builder = Builder()
    builder.feed(raw)
    root = builder.root

    # --- Design system -------------------------------------------------
    style_blocks = re.findall(r"<style[^>]*>(.*?)</style>", raw, re.S | re.I)
    css_file = ROOT / "design" / "styles.css"
    if not style_blocks:
        err("No <style> block found")
    elif css_file.exists():
        if norm(css_file.read_text(encoding="utf-8")) not in norm("\n".join(style_blocks)):
            (warn if allow_css_drift else err)(
                "<style> does not contain the full, verbatim content of design/styles.css")
    else:
        warn("design/styles.css not found next to this script; CSS check skipped")
    if re.search(r"@font-face", raw):
        err("@font-face rule present")
    if re.search(r"<link[^>]+rel=[\"']?stylesheet", raw, re.I):
        err("External stylesheet <link> present")
    if re.search(r"(src|href)=[\"']file://", raw, re.I):
        err("file:// path present")
    for img in root.find_all("img"):
        if not (img.attrs.get("src") or "").startswith("data:image/"):
            err(f"<img> src is not a data:image URI: {(img.attrs.get('src') or '')[:60]}")
    for tag in root.walk():
        if tag.tag in ("script", "iframe", "link") and (tag.attrs.get("src") or "").startswith(("http", "//")):
            err(f"External resource loaded via <{tag.tag}>: {tag.attrs.get('src')[:60]}")

    # --- Header / footer / title --------------------------------------
    title = (root.find_all("title") or [None])[0]
    if not title or not re.search(r"\S.* — Client Report", title.inner_text()):
        err("<title> must read '[Client name] — Client Report'")
    header = (root.find_all("header") or [None])[0]
    if header is None:
        err("No <header>")
    else:
        h = norm(header.inner_text())
        if "Adobe | Client Intelligence" not in h:
            err("Header eyebrow must read 'Adobe | Client Intelligence'")
        m = re.search(r"Account Overview \| Updated: (\w+) (\d{4})", h)
        if not m:
            err("Header subtitle must read 'Account Overview | Updated: [Month Year]'")
        elif int(m.group(2)) > TODAY.year:
            err(f"Header 'Updated' year {m.group(2)} is in the future")
        if not header.find_all("h1") or not header.find_all("h1")[0].inner_text().strip():
            err("Header <h1> (client name) is empty")
    footer = (root.find_all("footer") or [None])[0]
    if footer is None:
        err("No <footer>")
    else:
        f = norm(footer.inner_text())
        m = re.search(r"© (\d{4}) Adobe\. Adobe Internal Only\.", f)
        if not m:
            err("Footer must read '© [year] Adobe. Adobe Internal Only.'")
        elif int(m.group(1)) > TODAY.year:
            err(f"Footer year {m.group(1)} is in the future")

    # --- Placeholders --------------------------------------------------
    visible = re.sub(r"<(style|script)[^>]*>.*?</\1>", "", raw, flags=re.S | re.I)
    visible = re.sub(r"<!--.*?-->", "", visible, flags=re.S)
    for pat, label in [(r"\[[A-Z][A-Z0-9 _\-]{2,}\]", "bracketed placeholder"),
                       (r"\bTBD\b", "TBD"), (r"\bTODO\b", "TODO"), (r"INSERT FULL CONTENTS", "unreplaced CSS placeholder")]:
        for m in re.finditer(pat, visible):
            err(f"Placeholder left in report ({label}): {m.group(0)}")

    # --- TOC and nav ---------------------------------------------------
    wanted = [f"#s{i:02d}" for i in range(1, 15)]
    toc = (root.find_all(cls="toc") or [None])[0]
    toc_hrefs = [a.attrs.get("href") for a in toc.find_all("a")] if toc else []
    if toc_hrefs != wanted:
        err(f"TOC must link to #s01–#s14 in order (found {len(toc_hrefs)}: {toc_hrefs[:3]}…)")
    nav = next((n for n in root.walk() if n.attrs.get("id") == "navMenu"), None)
    nav_hrefs = [a.attrs.get("href") for a in nav.find_all("a")] if nav else []
    if nav_hrefs != wanted:
        err(f"Hamburger nav (#navMenu) must link to #s01–#s14 in order (found {len(nav_hrefs)})")

    # --- Sections -------------------------------------------------------
    sections = [n for n in root.walk() if n.tag == "div" and "section" in n.classes]
    ids = [s.attrs.get("id") for s in sections]
    if ids != [f"s{i:02d}" for i in range(1, 15)]:
        err(f"Sections must have ids s01–s14 in order; found {ids}")
    hr_count = len(re.findall(r"<hr\s*/?>", raw, re.I))
    if hr_count != 13:
        err(f"Expected 13 <hr> separators (none after s14); found {hr_count}")
    last = raw.rfind("<hr")
    s14_pos = raw.find('id="s14"')
    if last != -1 and s14_pos != -1 and last > s14_pos:
        err("<hr> found after s14")
    comment_count = len(re.findall(r"<!--\s*Section:", raw))
    if comment_count != 14:
        err(f"Expected 14 '<!-- Section: Name -->' comments; found {comment_count}")

    # --- Client-owned domains (for the source-independence rule) ----------
    declared = []
    dm = re.search(r"<!--\s*client-domains:\s*(.*?)-->", raw, re.S | re.I)
    if not dm:
        err("Missing '<!-- client-domains: a.com, b.com -->' comment listing every domain the client owns")
    else:
        declared = [d.strip().lower().removeprefix("www.") for d in dm.group(1).split(",") if d.strip()]
        if not declared or any("[" in d or "." not in d for d in declared):
            err("client-domains comment must list real domains (no placeholders), e.g. acme.com, acme.co.uk")
            declared = [d for d in declared if "[" not in d and "." in d]
    h1 = (root.find_all("h1") or [None])[0]
    key = re.sub(r"[^a-z0-9]", "", h1.inner_text().lower()) if h1 else ""
    total_links = owned_links = 0

    labels = expected_sections()
    recent_cutoff = TODAY.year * 12 + TODAY.month
    old_sources = 0
    components = {"feature-grid", "step", "note", "color-legend", "dl-link", "img-slot"}
    for s in sections:
        sid = s.attrs.get("id", "?")
        kids = list(s.children)
        bar = next((c for c in kids if "section-bar" in c.classes), None)
        if bar is None:
            err(f"{sid}: missing .section-bar heading")
        else:
            lab = bar.find_all(cls="s-label")
            h2 = bar.find_all("h2")
            if not lab or not h2:
                err(f"{sid}: section-bar needs an .s-label and an h2")
            elif sid in labels and norm(lab[0].inner_text()) != labels[sid]:
                (warn if sid in ("s02", "s13") else err)(
                    f"{sid}: s-label '{norm(lab[0].inner_text())}' != expected '{labels[sid]}'")
        if any(c.tag == "h2" for c in kids):
            err(f"{sid}: plain <h2> used instead of the section-bar pattern")
        if not s.find_all("p"):
            err(f"{sid}: no paragraph")
        if not any(set(n.classes) & components for n in s.walk()) and not s.find_all("table"):
            err(f"{sid}: no component (feature-grid, step, note, …)")
        if kids and not (kids[-1].tag == "div" and "sources" in kids[-1].classes):
            err(f"{sid}: the last child of the section must be the .sources block")
        srcs = s.find_all(cls="sources")
        if len(srcs) != 1:
            err(f"{sid}: expected exactly one .sources block, found {len(srcs)}")
        else:
            entries = [c for c in srcs[0].children if c.tag == "a" or "no-link" in c.classes]
            if not 2 <= len(entries) <= 5:
                err(f"{sid}: sources block must list 2–5 sources (found {len(entries)})")
            sec_owned = sum(1 for e in entries
                            if e.tag == "a" and client_owned(host_of(e.attrs.get("href", "")), key, declared))
            total_links += len(entries)
            owned_links += sec_owned
            if entries and sec_owned == len(entries):
                err(f"{sid}: every source is client-owned — add at least one independent source "
                    f"(filings, press, trade press, data tools, regulators; see workflow/research-guide.md)")
            elif entries and sec_owned * 2 > len(entries):
                warn(f"{sid}: {sec_owned}/{len(entries)} sources are client-owned; keep it to half or fewer")
            for e in entries:
                text = norm(e.inner_text())
                if e.tag == "a":
                    href = e.attrs.get("href", "")
                    if not re.match(r"https?://", href):
                        err(f"{sid}: source link is not an http(s) URL: {href[:60]}")
                    elif re.search(r"example\.(com|org)", href):
                        err(f"{sid}: placeholder source URL left in: {href}")
                d = source_date(text)
                if d is None:
                    err(f"{sid}: source missing a (Mon YYYY) date: {text[:70]}")
                    continue
                age = recent_cutoff - (d[0] * 12 + d[1])
                if age < 0:
                    err(f"{sid}: source date is in the future: {text[:70]}")
                elif age > 24:
                    if "archival" not in text.lower():
                        (warn if is_example else err)(
                            f"{sid}: source older than 2 years must be marked (archival): {text[:70]}")
                elif age > 12:
                    old_sources += 1
        for grid in s.find_all(cls="feature-grid"):
            n = len([c for c in grid.children if "feature-card" in c.classes])
            if n not in (2, 4):
                err(f"{sid}: feature-grid has {n} cards (must be 2 or 4)")
        for dl in s.find_all(cls="dl-link"):
            if not re.match(r"https?://", dl.attrs.get("href", "")):
                err(f"{sid}: dl-link has an empty or invalid href")
        if s.find_all(cls="step-num"):
            err(f"{sid}: .step-num is hidden by CSS and must not be used; number the step title instead")
        body_text = norm(" ".join(c.inner_text() for c in kids if "sources" not in c.classes))
        for m in re.finditer(r"\bs(?:0[1-9]|1[0-4])\b", body_text):
            err(f"{sid}: refers to a section by code ('{m.group(0)}') — name the section and link it with class=\"xref\"")
            break
        for x in s.find_all("a", cls="xref"):
            if x.attrs.get("href") not in [f"#s{i:02d}" for i in range(1, 15)]:
                err(f"{sid}: xref link points to {x.attrs.get('href')!r}, expected #s01–#s14")
    if old_sources:
        warn(f"{old_sources} source(s) are 12–24 months old; prefer sources under 1 year")
    if total_links:
        share = owned_links / total_links
        if share > 0.5:
            err(f"{owned_links}/{total_links} sources ({share:.0%}) are client-owned; the report must not rest on "
                f"the client's own website — keep client-owned sources to ~40% or less")
        elif share > 0.4:
            warn(f"{owned_links}/{total_links} sources ({share:.0%}) are client-owned; aim for ~40% or less")

    # --- s14 -------------------------------------------------------------
    s14 = next((s for s in sections if s.attrs.get("id") == "s14"), None)
    if s14 is not None:
        steps = s14.find_all(cls="step")
        if not 4 <= len(steps) <= 6:
            err(f"s14: expected 4–6 product recommendations (steps); found {len(steps)}")
        for st in steps:
            title = norm(st.find_all("strong")[0].inner_text()) if st.find_all("strong") else ""
            if "Adobe" not in title:
                err(f"s14: step title does not name a specific Adobe product: '{title[:60]}'")
            if not re.match(r"\d+\.", title):
                err(f"s14: step title must start with its number ('1. …'): '{title[:60]}'")
            body = norm(st.inner_text())
            if re.search(r"\b(Fit|Outcome|Timing):", body):
                err(f"s14: '{title[:40]}' uses Fit/Outcome/Timing labels — write one flowing paragraph instead")
        s14_text = norm(s14.inner_text())
        if re.search(r"LLM Optimizer", s14_text) and not re.search(r"formerly[^.]{0,40}LLM Optimizer|LLM Optimizer[^.]{0,40}(now|renamed)", s14_text):
            warn("s14 mentions 'LLM Optimizer' — now Adobe Brand Visibility (see workflow/adobe-products.md)")

    # --- Report ------------------------------------------------------------
    print(f"Validating {path}")
    for w in warnings:
        print(f"  WARN  {w}")
    for e in errors:
        print(f"  ERROR {e}")
    if errors:
        print(f"\nFAILED: {len(errors)} error(s), {len(warnings)} warning(s)")
        return 1
    print(f"\nPASSED: 0 errors, {len(warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
