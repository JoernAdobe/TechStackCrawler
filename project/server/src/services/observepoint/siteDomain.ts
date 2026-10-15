const MULTI_PART_TLD = /\.(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/i;

/** Registrierbare Domain (eTLD+1, vereinfacht) einer URL oder eines Hosts. */
export function siteDomain(urlOrHost?: string): string | undefined {
  if (!urlOrHost) return undefined;
  let host: string;
  try {
    host = new URL(urlOrHost.includes('://') ? urlOrHost : `https://${urlOrHost}`).hostname;
  } catch {
    return undefined;
  }
  const parts = host.toLowerCase().replace(/\.$/, '').split('.');
  return parts.slice(MULTI_PART_TLD.test(host) ? -3 : -2).join('.');
}

export function isSameSite(host: string | undefined, site: string | undefined): boolean {
  if (!host || !site) return false;
  return siteDomain(host) === site;
}
