import { lookup } from 'dns/promises';

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

/**
 * Prüft eine bereits aufgelöste IP-Adresse auf private/reservierte Bereiche.
 *
 * Bewusst getrennt von `isPrivateOrReservedHost`: Dort werden IPv6-Literale in der
 * URL pauschal blockiert (konservativ, da in der Praxis nicht gebraucht). Bei
 * DNS-Antworten würde das jede Dual-Stack-Domain fälschlich sperren — hier wird
 * deshalb gezielt auf die tatsächlich privaten IPv6-Bereiche geprüft.
 */
function isPrivateIpAddress(address: string): boolean {
  const addr = address.toLowerCase().replace(/^\[|\]$/g, '');

  const ipv4Match = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);
    if (a === 10) return true;                          // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16
    if (a === 169 && b === 254) return true;            // 169.254.0.0/16 (Cloud-Metadaten)
    if (a === 127) return true;                         // 127.0.0.0/8
    if (a === 0) return true;                           // 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true;  // 100.64.0.0/10 (CGNAT)
    if (a >= 224) return true;                          // Multicast + reserviert
    return false;
  }

  if (addr.includes(':')) {
    if (addr === '::1' || addr === '::') return true;             // Loopback / unspecified
    if (/^f[cd][0-9a-f]{2}:/.test(addr)) return true;             // fc00::/7 (Unique Local)
    if (/^fe[89ab][0-9a-f]:/.test(addr)) return true;             // fe80::/10 (Link-Local)
    if (addr.startsWith('ff')) return true;                        // Multicast
    // IPv4-mapped (::ffff:a.b.c.d) auf die IPv4-Regeln zurückführen
    const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (mapped) return isPrivateIpAddress(mapped[1]);
    return false;
  }

  return false;
}

/**
 * Prüft, ob ein Hostname per DNS auf eine private/reservierte Adresse zeigt.
 *
 * Die reine String-Prüfung in `isPrivateOrReservedHost` reicht nicht: Ein völlig
 * unverdächtiger öffentlicher Name kann auf 169.254.169.254 (Cloud-Metadaten) oder
 * ins interne Netz auflösen. Hier werden ALLE A/AAAA-Records geprüft; ist einer davon
 * privat, wird die URL abgelehnt.
 *
 * Fehlgeschlagene Auflösung → `true` (blockieren), damit im Zweifel nicht gecrawlt wird.
 */
export async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // IP-Literale müssen nicht aufgelöst werden.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return isPrivateIpAddress(host);
  }

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.length === 0) return true;
    return records.some((r) => isPrivateIpAddress(r.address));
  } catch {
    return true;
  }
}

/**
 * Vollständige URL-Prüfung inkl. DNS-Auflösung. Für alles verwenden, was
 * anschließend tatsächlich abgerufen wird (Crawl-Ziele, Sitemap-Einträge, Redirects).
 */
export async function sanitizeUrlWithDns(input: string): Promise<string | null> {
  const sanitized = sanitizeUrl(input);
  if (!sanitized) return null;

  const { hostname } = new URL(sanitized);
  if (await resolvesToPrivateAddress(hostname)) {
    return null;
  }
  return sanitized;
}
