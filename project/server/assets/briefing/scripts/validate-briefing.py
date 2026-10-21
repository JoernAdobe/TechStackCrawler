#!/usr/bin/env python3
"""Client Pre-Briefing wrapper around Chris Whitehead's validate-report.py.

Usage: python3 validate-briefing.py <report.html> [--sections s01,s04,s14] [--json] [--allow-css-drift]

validate-report.py stays untouched (so upstream updates can be pulled 1:1). This
wrapper runs its main() unchanged and post-processes the findings:

* Deselected sections: the five checks that hard-code "all 14 sections"
  (TOC, hamburger nav, section ids, <hr> count, '<!-- Section: -->' comments)
  are replaced by the same checks against the selected section list.
  Without --sections all 14 sections are expected, i.e. identical behaviour.
* Our deliberate additions -- the Executive Summary block before s01
  (id="executive-summary", not a .section, no <hr>, no 'Section:' comment)
  and the credit line in the footer -- are built so that none of the original
  checks fires on them. On top, every xref anywhere in the document must point
  to a section that is actually included.

Every other finding of the original validator is reported unchanged.
Exit code 0 = no errors, 1 = errors, 2 = usage / file problems. Standard library only.
"""
import contextlib
import importlib.util
import io
import json
import re
import sys

sys.dont_write_bytecode = True  # kein __pycache__ neben Chris' Dateien
from pathlib import Path

HERE = Path(__file__).resolve().parent
ALL_SECTIONS = [f"s{i:02d}" for i in range(1, 15)]

# Findings of validate-report.py that assume all 14 sections; re-checked below.
SECTION_COUNT_FINDINGS = (
    "TOC must link to #s01–#s14 in order",
    "Hamburger nav (#navMenu) must link to #s01–#s14 in order",
    "Sections must have ids s01–s14 in order",
    "Expected 13 <hr> separators",
    "Expected 14 '<!-- Section: Name -->' comments",
)


def load_original():
    spec = importlib.util.spec_from_file_location("validate_report", HERE / "validate-report.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def parse_sections(value):
    ids = [s.strip().lower() for s in value.split(",") if s.strip()]
    unknown = [s for s in ids if s not in ALL_SECTIONS]
    if unknown:
        raise ValueError(f"Unknown section id(s): {', '.join(unknown)}")
    if "s14" not in ids:
        ids.append("s14")
    return [s for s in ALL_SECTIONS if s in ids]


def run_original(mod, path, passthrough):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        code = mod.main(["validate-report.py", str(path), *passthrough])
    errors, warnings = [], []
    for line in buf.getvalue().splitlines():
        m = re.match(r"^\s{2}(ERROR|WARN)\s{1,2}(.*)$", line)
        if m:
            (errors if m.group(1) == "ERROR" else warnings).append(m.group(2))
    return code, errors, warnings, buf.getvalue()


def section_checks(mod, raw, selected):
    """Same structural checks as the original, against the selected sections."""
    errors = []
    builder = mod.Builder()
    builder.feed(raw)
    root = builder.root
    wanted = [f"#{s}" for s in selected]
    label = f"{selected[0]}–{selected[-1]}" if len(selected) > 1 else selected[0]

    toc = (root.find_all(cls="toc") or [None])[0]
    toc_hrefs = [a.attrs.get("href") for a in toc.find_all("a")] if toc else []
    if toc_hrefs != wanted:
        errors.append(f"TOC must link to the selected sections {wanted} in order (found {toc_hrefs})")
    nav = next((n for n in root.walk() if n.attrs.get("id") == "navMenu"), None)
    nav_hrefs = [a.attrs.get("href") for a in nav.find_all("a")] if nav else []
    if nav_hrefs != wanted:
        errors.append(f"Hamburger nav (#navMenu) must link to the selected sections in order (found {len(nav_hrefs)})")

    ids = [n.attrs.get("id") for n in root.walk() if n.tag == "div" and "section" in n.classes]
    if ids != selected:
        errors.append(f"Sections must have ids {label} (selected) in order; found {ids}")
    hr_count = len(re.findall(r"<hr\s*/?>", raw, re.I))
    if hr_count != len(selected) - 1:
        errors.append(f"Expected {len(selected) - 1} <hr> separators (none after s14); found {hr_count}")
    comment_count = len(re.findall(r"<!--\s*Section:", raw))
    if comment_count != len(selected):
        errors.append(f"Expected {len(selected)} '<!-- Section: Name -->' comments; found {comment_count}")

    for x in root.find_all("a", cls="xref"):
        if x.attrs.get("href") not in wanted:
            errors.append(f"xref link points to {x.attrs.get('href')!r}, which is not an included section")
    return errors


def main(argv):
    as_json = "--json" in argv
    passthrough = [a for a in argv[1:] if a == "--allow-css-drift"]
    args, selected = [], list(ALL_SECTIONS)
    it = iter(argv[1:])
    try:
        for a in it:
            if a == "--sections":
                selected = parse_sections(next(it, ""))
            elif a.startswith("--sections="):
                selected = parse_sections(a.split("=", 1)[1])
            elif not a.startswith("--"):
                args.append(a)
    except ValueError as exc:
        print(exc)
        return 2
    if len(args) != 1:
        print(__doc__)
        return 2
    path = Path(args[0])
    if not path.is_file():
        print(f"File not found: {path}")
        return 2

    mod = load_original()
    code, errors, warnings, output = run_original(mod, path, passthrough)
    if code == 2:
        print(output)
        return 2
    errors = [e for e in errors if not e.startswith(SECTION_COUNT_FINDINGS)]
    errors += section_checks(mod, path.read_text(encoding="utf-8"), selected)

    if as_json:
        print(json.dumps({"ok": not errors, "errors": errors, "warnings": warnings, "sections": selected}))
    else:
        print(f"Validating {path} (sections: {', '.join(selected)})")
        for w in warnings:
            print(f"  WARN  {w}")
        for e in errors:
            print(f"  ERROR {e}")
        print(f"\n{'FAILED' if errors else 'PASSED'}: {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
