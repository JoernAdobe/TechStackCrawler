#!/usr/bin/env python3
"""Scrapling browser worker. Reads one JSON request from stdin and writes one JSON result."""

from __future__ import annotations

import asyncio
import ipaddress
import json
import os
import re
import socket
import sys
from typing import Any
from urllib.parse import urlsplit, urlunsplit

MAX_HTML_CHARS = 10_000_000
MAX_LINKS = 200
MAX_BODY_TEXT_CHARS = 50_000
MAX_REQUESTS = 1_500
MAX_REQUEST_URL_CHARS = 2_048
MAX_EDGE_BODY_BYTES = 512_000
MAX_EDGE_RESPONSES = 5
# Adobe Experience Platform Edge Network (also first-party CNAMEs like edge.example.com/ee/v1/interact).
EDGE_INTERACT_RE = re.compile(r"/ee/(?:[a-z0-9-]+/)?v\d+/interact", re.I)
JS_PROBES = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "js_probes.js"), encoding="utf-8").read()
BLOCKED_SCHEME_RE = re.compile(r"^(?:0x[0-9a-f]*|\d+)(?:\.(?:0x[0-9a-f]*|\d+))*$", re.I)
ACCEPT_SELECTORS = (
    "#onetrust-accept-btn-handler",
    '[id*="onetrust-accept"]',
    ".onetrust-close-btn-handler",
    "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
    "#CybotCookiebotDialogBodyButtonAccept",
    '[id*="CybotCookiebotDialogBodyButton"]',
    '[id*="OptanonConsent"] button',
    ".optanon-allow-all",
    "#optanon-accept",
    '[id*="didomi"] button[id*="accept"]',
    '[class*="didomi"] button[class*="accept"]',
    'button[id*="didomi-notice-agree"]',
    ".cky-btn-accept",
    '[class*="cookieyes"] button[class*="accept"]',
    ".cc-btn.cc-allow",
    ".cc-accept",
    '[class*="cookie-consent"] button[class*="accept"]',
    '[class*="cookie-banner"] button[class*="accept"]',
    '[id*="cookie"] button[class*="accept"]',
    '[id*="consent"] button[class*="accept"]',
    '[class*="consent"] button[class*="accept"]',
    '[class*="gdpr"] button[class*="accept"]',
    '[data-action="accept"]',
    '[data-testid*="accept"]',
    '[aria-label*="Accept" i]',
    '[aria-label*="Allow" i]',
    '[aria-label*="Akzeptieren" i]',
    '[aria-label*="Zustimmen" i]',
    'a[href*="accept-cookies"]',
    'a[href*="accept_all"]',
)
ACCEPT_WORDS = (
    "accept all",
    "accept all cookies",
    "allow all",
    "allow all cookies",
    "alle akzeptieren",
    "alle cookies akzeptieren",
    "alle erlauben",
    "zustimmen",
    "akzeptieren",
    "accept",
    "allow",
    "agree",
    "i agree",
    "ok",
    "got it",
    "accepter tout",
    "accepter",
    "todos los cookies",
    "aceptar todo",
    "aceptar",
    "accetta tutto",
    "accetta",
    "akceptuj wszystko",
    "akceptuj",
    "accepteer alles",
    "accepteer",
)


def parse_safe_url(value: str) -> str:
    candidate = value.strip()
    if not candidate:
        raise ValueError("URL is empty")
    explicit_scheme = re.match(r"^([a-z][a-z0-9+.-]*):", candidate, re.I)
    remainder = candidate[explicit_scheme.end():] if explicit_scheme else ""
    host_port = bool(re.match(r"^\d+(?:[/?#]|$)", remainder))
    if (
        explicit_scheme
        and explicit_scheme.group(1).lower() not in ("http", "https")
        and not host_port
    ):
        raise ValueError("Blocked non-HTTP URL scheme")
    if not re.match(r"^https?://", candidate, re.I):
        candidate = "https://" + candidate
    parsed = urlsplit(candidate)
    hostname = (parsed.hostname or "").rstrip(".").lower()
    if (
        parsed.scheme.lower() not in ("http", "https")
        or not hostname
        or parsed.username is not None
        or parsed.password is not None
        or hostname == "localhost"
        or hostname.endswith((".localhost", ".local", ".internal"))
        or BLOCKED_SCHEME_RE.fullmatch(hostname)
    ):
        raise ValueError("Blocked unsafe URL")
    try:
        address = ipaddress.ip_address(hostname)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("Blocked private or reserved IP address")
    return urlunsplit((parsed.scheme.lower(), parsed.netloc, parsed.path or "/", parsed.query, ""))


def hostname_is_public(hostname: str) -> bool:
    normalized = hostname.rstrip(".").lower()
    if (
        not normalized
        or normalized == "localhost"
        or normalized.endswith((".localhost", ".local", ".internal"))
        or BLOCKED_SCHEME_RE.fullmatch(normalized)
    ):
        return False
    try:
        return ipaddress.ip_address(normalized).is_global
    except ValueError:
        pass
    try:
        records = socket.getaddrinfo(normalized, None, type=socket.SOCK_STREAM)
    except OSError:
        return False
    addresses = {record[4][0] for record in records}
    return bool(addresses) and all(_is_public_ip(address) for address in addresses)


def _is_public_ip(value: str) -> bool:
    try:
        return ipaddress.ip_address(value.split("%", 1)[0]).is_global
    except ValueError:
        return False


async def _resolve_public(hostname: str) -> bool:
    try:
        return await asyncio.wait_for(asyncio.to_thread(hostname_is_public, hostname), timeout=5)
    except (asyncio.TimeoutError, OSError):
        return False


def _as_text(value: Any) -> str:
    return str(value or "")


def _headers_as_arrays(headers: dict[str, Any]) -> dict[str, list[str]]:
    return {str(key).lower(): [str(value)] for key, value in headers.items()}


def edge_signals_from_payload(data: Any) -> set[str]:
    """Summarize an AEP Edge interact response into handle types and decision providers."""
    signals: set[str] = set()
    if not isinstance(data, dict):
        return signals
    for handle in data.get("handle") or []:
        if not isinstance(handle, dict):
            continue
        handle_type = handle.get("type")
        if isinstance(handle_type, str) and len(handle_type) < 80:
            signals.add(f"handle:{handle_type}")
        payload = handle.get("payload")
        for item in payload if isinstance(payload, list) else []:
            if not isinstance(item, dict):
                continue
            details = item.get("scopeDetails")
            provider = details.get("decisionProvider") if isinstance(details, dict) else None
            if isinstance(provider, str) and len(provider) < 40:
                signals.add(f"decisionProvider:{provider}")
    return signals


def extract_data(
    page: Any,
    requested_url: str,
    response_headers: dict[str, Any],
    cookies: dict[str, str],
    requests: list[str] | None = None,
    network_scripts: list[str] | None = None,
    js_globals: dict[str, str] | None = None,
    edge_signals: set[str] | None = None,
    consent: dict[str, Any] | None = None,
) -> dict[str, Any]:
    meta: dict[str, list[str]] = {}
    for element in page.css("meta"):
        attrs = element.attrib
        name = attrs.get("name") or attrs.get("property") or attrs.get("http-equiv") or ""
        content = attrs.get("content") or ""
        if name and content:
            meta.setdefault(name, []).append(content)

    script_src = [
        _as_text(value)
        for value in page.css("script[src]::attr(src)").getall()
        if value
    ]
    # Tag managers inject and remove scripts at runtime; the network log is the complete picture.
    seen_scripts = set(script_src)
    for value in network_scripts or []:
        if value not in seen_scripts:
            seen_scripts.add(value)
            script_src.append(value)
    links = [
        _as_text(value)
        for value in page.css('a[href^="http"]::attr(href)').getall()[:MAX_LINKS]
        if value
    ]
    body = page.css("body").first
    body_text = body.get_all_text() if body is not None else ""
    html = _as_text(page.html_content)[:MAX_HTML_CHARS]

    return {
        "url": requested_url,
        "finalUrl": _as_text(getattr(page, "url", "")) or requested_url,
        "html": html,
        "headers": _headers_as_arrays(response_headers),
        "meta": meta,
        "scriptSrc": script_src,
        "cookies": cookies,
        "title": _as_text(page.css("title::text").get()),
        "bodyText": _as_text(body_text)[:MAX_BODY_TEXT_CHARS],
        "links": links,
        "requests": list(requests or [])[:MAX_REQUESTS],
        "jsGlobals": {str(k): str(v) for k, v in (js_globals or {}).items()},
        "edgeSignals": sorted(edge_signals or ()),
        "consent": {
            "bannerAccepted": bool((consent or {}).get("bannerAccepted")),
            "preConsentRequests": [str(u) for u in (consent or {}).get("preConsentRequests", [])][:MAX_REQUESTS],
            "preConsentCookies": [str(c) for c in (consent or {}).get("preConsentCookies", [])][:500],
        },
    }


def _accept_cookie_banner(page: Any) -> Any:
    async def click_accept() -> bool:
        for selector in ACCEPT_SELECTORS:
            candidate = page.locator(selector).first
            try:
                if await candidate.is_visible(timeout=200):
                    await candidate.click(timeout=700)
                    return True
            except Exception:
                continue

        buttons = page.locator("button, a, [role=button]")
        labels: list[str] = []
        for index in range(min(await buttons.count(), 100)):
            candidate = buttons.nth(index)
            try:
                if not await candidate.is_visible(timeout=200):
                    labels.append("")
                    continue
                tag = await candidate.evaluate("el => el.tagName.toLowerCase()")
                href = (await candidate.get_attribute("href", timeout=200) or "").strip()
                if tag == "a" and href and not href.startswith(("#", "javascript:")):
                    labels.append("")
                    continue
                text = await candidate.inner_text(timeout=200)
                aria = await candidate.get_attribute("aria-label", timeout=200) or ""
                labels.append(f"{text}\n{aria}")
            except Exception:
                labels.append("")

        index = pick_accept_index(labels)
        if index is not None:
            try:
                await buttons.nth(index).click(timeout=700)
                return True
            except Exception:
                return False
        return False

    return click_accept()


def _normalize_label(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", value.lower())).strip()


def pick_accept_index(labels: list[str]) -> int | None:
    """Pick the control whose text or aria-label exactly matches the most specific accept phrase."""
    normalized = [
        {_normalize_label(part) for part in label.split("\n") if part.strip()}
        for label in labels
    ]
    for word in sorted(ACCEPT_WORDS, key=len, reverse=True):
        for index, parts in enumerate(normalized):
            if word in parts:
                return index
    return None


async def scrape(payload: dict[str, Any]) -> dict[str, Any]:
    requested_url = parse_safe_url(str(payload.get("url", "")))
    timeout_ms = payload.get("timeoutMs", 60_000)
    if not isinstance(timeout_ms, int) or not 1_000 <= timeout_ms <= 120_000:
        raise ValueError("timeoutMs must be an integer between 1000 and 120000")
    host = urlsplit(requested_url).hostname or ""
    if not await _resolve_public(host):
        raise ValueError("Blocked unsafe or unresolved target hostname")

    from scrapling.fetchers import StealthyFetcher

    verdicts: dict[str, asyncio.Task[bool]] = {}
    response_headers: dict[str, Any] = {}
    cookie_values: dict[str, str] = {}
    private_remote_hit: list[str] = []
    remote_tasks: set[asyncio.Task[Any]] = set()
    request_urls: dict[str, None] = {}
    network_scripts: dict[str, None] = {}
    js_globals: dict[str, str] = {}
    edge_signals: set[str] = set()
    edge_responses = [0]
    consent: dict[str, Any] = {"bannerAccepted": False, "preConsentRequests": [], "preConsentCookies": []}

    async def public_host(hostname: str) -> bool:
        hostname = hostname.rstrip(".").lower()
        task = verdicts.get(hostname)
        if task is None:
            task = asyncio.create_task(_resolve_public(hostname))
            verdicts[hostname] = task
        return await task

    async def guard_request(route: Any) -> None:
        if private_remote_hit:
            await route.abort("blockedbyclient")
            return
        target = route.request.url
        if target.startswith(("data:", "blob:")):
            await route.continue_()
            return
        try:
            parsed = urlsplit(target)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                await route.abort("blockedbyclient")
                return
            parse_safe_url(target)
            if await public_host(parsed.hostname):
                await route.continue_()
                return
        except (ValueError, OSError):
            pass
        await route.abort("blockedbyclient")

    async def setup_page(page: Any) -> None:
        await page.context.route("**/*", guard_request)
        await page.add_init_script(
            script="""for (const key of ['WebSocket','RTCPeerConnection','webkitRTCPeerConnection',
              'WebTransport','Worker','SharedWorker']) {
              try { Object.defineProperty(window, key, {value: undefined, configurable: false}); } catch {}
            }"""
        )

        async def capture_response(response: Any) -> None:
            try:
                request = response.request
                if request.is_navigation_request() and request.frame == page.main_frame:
                    response_headers.clear()
                    response_headers.update(await response.all_headers())
                address = await response.server_addr()
                ip = address.get("ipAddress") if address else None
                if ip and not _is_public_ip(ip):
                    private_remote_hit.append(f"{response.url} -> {ip}")
                    return
                if (
                    EDGE_INTERACT_RE.search(response.url)
                    and edge_responses[0] < MAX_EDGE_RESPONSES
                    and response.ok
                ):
                    edge_responses[0] += 1
                    body = await response.body()
                    if len(body) <= MAX_EDGE_BODY_BYTES:
                        edge_signals.update(edge_signals_from_payload(json.loads(body)))
            except Exception:
                return

        def on_response(response: Any) -> None:
            task = asyncio.create_task(capture_response(response))
            remote_tasks.add(task)
            task.add_done_callback(remote_tasks.discard)

        # Route handlers do not see redirect hops; validate them here and fail the job.
        async def check_redirect(request: Any) -> None:
            target = request.url
            try:
                parsed = urlsplit(target)
                parse_safe_url(target)
                if parsed.hostname and await public_host(parsed.hostname):
                    return
            except (ValueError, OSError):
                pass
            private_remote_hit.append(f"redirect to {target}")

        def on_request(request: Any) -> None:
            url = _as_text(request.url)
            if url.startswith(("http://", "https://")) and len(request_urls) < MAX_REQUESTS:
                url = url[:MAX_REQUEST_URL_CHARS]
                request_urls[url] = None
                if request.resource_type == "script":
                    network_scripts[url] = None
            if request.redirected_from is None:
                return
            task = asyncio.create_task(check_redirect(request))
            remote_tasks.add(task)
            task.add_done_callback(remote_tasks.discard)

        page.on("response", on_response)
        page.context.on("request", on_request)

    async def finish_page(page: Any) -> None:
        # Scrapling swallows page_action exceptions, so every step is isolated: one failing
        # step must not silently drop cookies or probes.
        clicked = False
        # Snapshot before the consent click: whatever already fired did so without consent.
        pre_requests = list(request_urls)
        pre_cookies: list[str] = []
        try:
            pre_cookies = [c["name"] for c in await page.context.cookies() if c.get("name")]
        except Exception:
            pass
        try:
            clicked = await _accept_cookie_banner(page)
        except Exception:
            pass
        if clicked:
            consent.update(
                bannerAccepted=True,
                preConsentRequests=pre_requests[:MAX_REQUESTS],
                preConsentCookies=pre_cookies[:500],
            )
        try:
            # Many tags (Analytics, Pixels, Personalization) only fire after consent or on scroll.
            await page.evaluate("window.scrollTo(0, Math.floor(document.body.scrollHeight / 2))")
            # networkidle resolves immediately if it already fired before the click, so give
            # post-consent tags a fixed head start first.
            await page.wait_for_timeout(1_500 if clicked else 800)
            await page.wait_for_load_state("networkidle", timeout=4_000 if clicked else 2_000)
        except Exception:
            pass
        try:
            js_globals.update(await asyncio.wait_for(page.evaluate(JS_PROBES), timeout=5))
        except Exception:
            pass
        if remote_tasks:
            await asyncio.gather(*list(remote_tasks), return_exceptions=True)
        if private_remote_hit:
            raise RuntimeError(f"Blocked response from private IP address: {private_remote_hit[0]}")
        for cookie in await page.context.cookies():
            if cookie.get("name"):
                cookie_values[cookie["name"]] = cookie.get("value", "")

    options: dict[str, Any] = {
        "headless": True,
        "timeout": timeout_ms,
        "network_idle": False,
        "load_dom": True,
        "google_search": False,
        "block_webrtc": True,
        "solve_cloudflare": False,
        "retries": 1,
        "dns_over_https": False,
        "page_setup": setup_page,
        "page_action": finish_page,
        "extra_flags": [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        ],
    }
    if payload.get("locale"):
        options["locale"] = str(payload["locale"])
    if payload.get("timezone"):
        options["timezone_id"] = str(payload["timezone"])
    chromium_path = os.environ.get("SCRAPLING_CHROMIUM_PATH")
    if chromium_path:
        options["executable_path"] = chromium_path

    page = await asyncio.wait_for(
        StealthyFetcher.async_fetch(requested_url, **options),
        timeout=(timeout_ms / 1000) + 10,
    )
    if private_remote_hit:
        raise RuntimeError(f"Blocked response from private IP address: {private_remote_hit[0]}")
    return extract_data(
        page,
        requested_url,
        response_headers,
        cookie_values,
        requests=list(request_urls),
        network_scripts=list(network_scripts),
        js_globals=js_globals,
        edge_signals=edge_signals,
        consent=consent,
    )


def main() -> int:
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("Request must be a JSON object")
        result = asyncio.run(scrape(payload))
        json.dump(result, sys.stdout, separators=(",", ":"), ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    except Exception as error:
        print(f"Scrapling worker failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
