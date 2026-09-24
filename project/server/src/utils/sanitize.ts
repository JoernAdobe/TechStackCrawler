import { lookup } from 'dns/promises';

function isPrivateOrReservedHost(hostname: string): boolean {
  // Trailing Dot (FQDN-Schreibweise "localhost.") entfernen, sonst greifen die Namensregeln nicht.
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');

  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;

  // IPv4-Literale. Dezimal-/Oktal-/Hex-Schreibweisen (2130706433, 0x7f.1, 0177.0.0.1, 127.1)
  // normalisiert der WHATWG-URL-Parser bereits zu dotted-quad — hier kommt also die
  // kanonische Form an und wird mit denselben Regeln wie DNS-Antworten geprüft.
  const v4 = parseIPv4(h);
  if (v4) return isPrivateIPv4(v4);

  // Rein numerische / hex-artige Hosts, die kein gültiges IPv4 ergeben, nie zulassen.
  if (/^(0x[0-9a-f]*|\d+)(\.(0x[0-9a-f]*|\d+))*$/.test(h)) return true;

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

/** Parst eine dotted-quad-IPv4 strikt (nur Dezimal, 0–255) in 4 Oktette. */
function parseIPv4(addr: string): number[] | null {
  const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const octets = m.slice(1).map(Number);
  return octets.every((o) => o <= 255) ? octets : null;
}

/**
 * Expandiert eine IPv6-Adresse (inkl. `::`-Kompression und eingebettetem IPv4-Suffix)
 * in 8 16-Bit-Gruppen. Zonen-IDs (`%eth0`) werden ignoriert.
 */
function parseIPv6(addr: string): number[] | null {
  let a = addr.split('%')[0];
  const embedded = a.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embedded) {
    const v4 = parseIPv4(embedded[2]);
    if (!v4) return null;
    a =
      embedded[1] +
      ((v4[0] << 8) | v4[1]).toString(16) +
      ':' +
      ((v4[2] << 8) | v4[3]).toString(16);
  }
  const parts = a.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (parts.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(parts.length === 2 ? missing : 0).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return nums.some(Number.isNaN) ? null : nums;
}

function isPrivateIPv4(o: number[]): boolean {
  const [a, b, c] = o;
  if (a === 0) return true;                               // 0.0.0.0/8
  if (a === 10) return true;                              // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true;      // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true;                             // 127.0.0.0/8
  if (a === 169 && b === 254) return true;                // 169.254.0.0/16 (Cloud-Metadaten)
  if (a === 172 && b >= 16 && b <= 31) return true;       // 172.16.0.0/12
  if (a === 192 && b === 0 && c === 0) return true;       // 192.0.0.0/24 (IETF)
  if (a === 192 && b === 0 && c === 2) return true;       // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 88 && c === 99) return true;     // 192.88.99.0/24 (6to4-Relay)
  if (a === 192 && b === 168) return true;                // 192.168.0.0/16
  if (a === 198 && (b === 18 || b === 19)) return true;   // 198.18.0.0/15 (Benchmark)
  if (a === 198 && b === 51 && c === 100) return true;    // 198.51.100.0/24 (TEST-NET-2)
  if (a === 203 && b === 0 && c === 113) return true;     // 203.0.113.0/24 (TEST-NET-3)
  if (a >= 224) return true;                              // 224/4 Multicast, 240/4 reserviert, Broadcast
  return false;
}

function isPrivateIPv6(g: number[]): boolean {
  const allZero = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);

  if (allZero(0, 8)) return true;                                   // :: (unspecified)
  if (allZero(0, 7) && g[7] === 1) return true;                     // ::1 (Loopback)
  const embeddedV4 = (hi: number, lo: number) => [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff];
  if (allZero(0, 5) && g[5] === 0xffff) return isPrivateIPv4(embeddedV4(g[6], g[7])); // ::ffff:0:0/96 (IPv4-mapped)
  if (allZero(0, 4) && g[4] === 0xffff && g[5] === 0) return true; // ::ffff:0:0:0/96 (IPv4-translated)
  if (allZero(0, 6)) return true;                                   // ::/96 (IPv4-compatible, deprecated)
  if (g[0] === 0x64 && g[1] === 0xff9b) return true;                // 64:ff9b::/96 NAT64 + 64:ff9b:1::/48
  if (g[0] === 0x100 && allZero(1, 4)) return true;                 // 100::/64 (Discard)
  if (g[0] === 0x2001 && g[1] === 0) return true;                   // 2001::/32 (Teredo)
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true;               // 2001:db8::/32 (Doku)
  if (g[0] === 0x2002) return isPrivateIPv4(embeddedV4(g[1], g[2])); // 2002::/16 (6to4, eingebettete IPv4)
  if ((g[0] & 0xfe00) === 0xfc00) return true;                      // fc00::/7 (Unique Local)
  if ((g[0] & 0xffc0) === 0xfe80) return true;                      // fe80::/10 (Link-Local)
  if ((g[0] & 0xffc0) === 0xfec0) return true;                      // fec0::/10 (Site-Local, deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true;                      // ff00::/8 (Multicast)
  return false;
}

/**
 * Prüft eine bereits aufgelöste IP-Adresse auf private/reservierte Bereiche.
 *
 * Bewusst getrennt von `isPrivateOrReservedHost`: Dort werden IPv6-Literale in der
 * URL pauschal blockiert (konservativ, da in der Praxis nicht gebraucht). Bei
 * DNS-Antworten würde das jede Dual-Stack-Domain fälschlich sperren — hier wird
 * deshalb gezielt auf die tatsächlich privaten IPv6-Bereiche geprüft.
 *
 * Nicht parsebare Eingaben gelten als privat (fail closed).
 */
export function isPrivateIpAddress(address: string): boolean {
  const addr = address.trim().toLowerCase().replace(/^\[|\]$/g, '');

  const v4 = parseIPv4(addr);
  if (v4) return isPrivateIPv4(v4);

  if (addr.includes(':')) {
    const v6 = parseIPv6(addr);
    return v6 ? isPrivateIPv6(v6) : true;
  }

  return true;
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

/**
 * Löst einen Hostnamen auf und liefert die Adressen NUR, wenn ALLE A/AAAA-Records
 * öffentlich sind; sonst `null`. Grundlage für IP-Pinning (siehe `safeFetch.ts`):
 * Der Aufrufer verbindet sich anschließend genau mit einer dieser geprüften Adressen,
 * statt den Namen erneut aufzulösen (DNS-Rebinding/TOCTOU).
 *
 * Fehlgeschlagene Auflösung → `null` (blockieren), damit im Zweifel nicht gecrawlt wird.
 */
export async function resolvePublicAddresses(hostname: string): Promise<ResolvedAddress[] | null> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // IP-Literale müssen nicht aufgelöst werden.
  if (parseIPv4(host)) {
    return isPrivateIpAddress(host) ? null : [{ address: host, family: 4 }];
  }
  if (host.includes(':')) {
    return isPrivateIpAddress(host) ? null : [{ address: host, family: 6 }];
  }

  try {
    const records = await lookup(host, { all: true, verbatim: true });
    if (records.length === 0) return null;
    if (records.some((r) => isPrivateIpAddress(r.address))) return null;
    return records.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
  } catch {
    return null;
  }
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
  return (await resolvePublicAddresses(hostname)) === null;
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
