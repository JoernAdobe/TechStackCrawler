function isPrivateOrReservedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '::' ||
    h === '0000:0000:0000:0000:0000:0000:0000:0001'
  ) {
    return true;
  }

  // IPv4 private / reserved ranges (RFC 1918, RFC 6890)
  const ipv4Match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16
    if (a === 169 && b === 254) return true;             // 169.254.0.0/16 (link-local / cloud metadata)
    if (a === 127) return true;                          // 127.0.0.0/8
    if (a === 0) return true;                            // 0.0.0.0/8
    return false;
  }

  // Block IPv6 addresses entirely (brackets stripped above)
  if (h.includes(':')) return true;

  // Block .local / .internal hostnames
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;

  return false;
}

export function sanitizeUrl(input: string): string | null {
  let url = input.trim();

  if (!url) return null;

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  try {
    const parsed = new URL(url);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    if (isPrivateOrReservedHost(parsed.hostname)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}
