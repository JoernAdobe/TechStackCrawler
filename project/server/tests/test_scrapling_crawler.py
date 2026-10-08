import unittest
from unittest.mock import patch

from python.scrapling_crawler import (
    _headers_as_arrays,
    _is_public_ip,
    extract_data,
    hostname_is_public,
    parse_safe_url,
    pick_accept_index,
)


class SafeUrlTests(unittest.TestCase):
    def test_adds_https_and_preserves_url_components(self):
        self.assertEqual(
            parse_safe_url("example.com/path?q=1#fragment"),
            "https://example.com/path?q=1",
        )

    def test_preserves_a_valid_public_host_port(self):
        self.assertEqual(
            parse_safe_url("example.com:8443/path"),
            "https://example.com:8443/path",
        )

    def test_rejects_private_hosts_and_non_http_schemes(self):
        for url in (
            "http://127.0.0.1",
            "http://10.1.2.3",
            "http://169.254.169.254/latest/meta-data",
            "http://[::1]",
            "http://localhost",
            "http://printer.local",
            "http://service.internal",
            "ftp://example.com/file",
            "https://user:password@example.com",
            "http://2130706433",
            "http://0x7f.1",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                parse_safe_url(url)

    def test_checks_every_dns_answer_and_fails_closed(self):
        with patch(
            "python.scrapling_crawler.socket.getaddrinfo",
            return_value=[
                (2, 1, 6, "", ("93.184.216.34", 0)),
                (2, 1, 6, "", ("192.168.1.2", 0)),
            ],
        ):
            self.assertFalse(hostname_is_public("example.com"))
        with patch("python.scrapling_crawler.socket.getaddrinfo", side_effect=OSError):
            self.assertFalse(hostname_is_public("example.com"))

    def test_public_ip_filter_rejects_reserved_ranges(self):
        self.assertTrue(_is_public_ip("8.8.8.8"))
        for address in ("127.0.0.1", "10.0.0.1", "169.254.1.1", "192.0.2.1", "::1"):
            with self.subTest(address=address):
                self.assertFalse(_is_public_ip(address))

    def test_rejects_non_http_scheme_without_reinterpreting_it_as_a_hostname(self):
        for url in ("ftp://example.com/file", "javascript:alert(1)", "file:///etc/passwd"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                parse_safe_url(url)


class ExtractionTests(unittest.TestCase):
    def test_normalizes_response_header_values(self):
        self.assertEqual(_headers_as_arrays({"Server": "nginx"}), {"server": ["nginx"]})

    def test_extracts_detector_contract(self):
        try:
            from scrapling.parser import Selector
        except ImportError:
            self.skipTest("scrapling is not installed")

        page = Selector(
            '<html><head><title>Example</title>'
            '<meta name="generator" content="WordPress 6.8">'
            '<script src="/assets/app.js"></script></head>'
            '<body>Willkommen, Größe <a href="https://example.com/shop">Shop</a>'
            '<a href="/relative">rel</a></body></html>',
            url="https://example.com/final",
        )

        result = extract_data(
            page,
            "https://example.com",
            {"Server": "nginx/1.2"},
            {"session": "value"},
        )
        self.assertEqual(result["finalUrl"], "https://example.com/final")
        self.assertEqual(result["title"], "Example")
        self.assertIn("Willkommen, Größe", result["bodyText"])
        self.assertIn("<title>Example</title>", result["html"])
        self.assertEqual(result["meta"]["generator"], ["WordPress 6.8"])
        self.assertEqual(result["headers"]["server"], ["nginx/1.2"])
        self.assertEqual(result["scriptSrc"], ["/assets/app.js"])
        self.assertEqual(result["links"], ["https://example.com/shop"])
        self.assertEqual(result["cookies"], {"session": "value"})


class CookieBannerTests(unittest.TestCase):
    def test_prefers_specific_exact_accept_phrase(self):
        labels = ["Cookie settings", "Facebook", "Accept", "Accept all cookies"]
        self.assertEqual(pick_accept_index(labels), 3)

    def test_ignores_substring_matches(self):
        self.assertIsNone(pick_accept_index(["Cookie policy", "Outlook", "Book now"]))

    def test_matches_aria_label_and_punctuation(self):
        self.assertEqual(pick_accept_index(["", "X\nAlle akzeptieren!"]), 1)


if __name__ == "__main__":
    unittest.main()
