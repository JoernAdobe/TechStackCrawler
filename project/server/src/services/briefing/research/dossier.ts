/**
 * Register-Dossier: verifizierte Stammdaten (Wikipedia, Wikidata, SEC EDGAR, GLEIF) als
 * Textblock für jeden Abschnitts-Prompt. Die URLs werden als zitierfähige Quellen ins Ledger eingetragen.
 */
import type { SourceLedger } from './ledger.js';
import type { CompanyProfile } from './company.js';
import type { SecFigure } from './registries.js';

const fmtMoney = (n: number, cur = 'USD') => {
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? `${(n / 1e9).toFixed(2)} bn` : abs >= 1e6 ? `${(n / 1e6).toFixed(1)} m` : String(n);
  return `${cur} ${s}`;
};

const fig = (f?: SecFigure) => (f ? `${fmtMoney(f.value)} (FY ending ${f.periodEnd}, ${f.form ?? 'annual report'})` : 'n/a');

export function secCitationUrl(cik: string): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=10-K`;
}

/** Trägt die Registerquellen ins Ledger ein und liefert den Dossier-Text (leer, wenn nichts gefunden). */
export function buildDossier(profile: CompanyProfile, ledger: SourceLedger): string {
  const lines: string[] = [];
  const { wikipedia: wp, wikidata: wd, sec, gleif } = profile;

  if (wp) {
    ledger.record({ url: wp.url, title: `${wp.title} – Wikipedia`, publisher: 'Wikipedia', date: wp.date, kind: 'reference', text: wp.extract });
    lines.push(`Wikipedia (${wp.url}, ${wp.date ?? 'n.d.'}): ${wp.extract}`);
  }
  if (wd) {
    ledger.record({ url: wd.url, title: `${wd.label ?? profile.companyName} – Wikidata`, publisher: 'Wikidata', date: wd.date, kind: 'reference' });
    const facts = [
      wd.founded && `founded ${wd.founded}`,
      wd.headquarters && `headquarters ${wd.headquarters}`,
      wd.employees && `employees ${wd.employees.value.toLocaleString('en-US')}${wd.employees.asOf ? ` (as of ${wd.employees.asOf})` : ''}`,
      wd.ceo && `CEO ${wd.ceo}`,
      wd.revenue && `revenue ${fmtMoney(wd.revenue.amount, wd.revenue.currency)}${wd.revenue.asOf ? ` (${wd.revenue.asOf})` : ''}`,
      wd.exchanges.length && `listed: ${wd.exchanges.map((e) => `${e.exchange}${e.ticker ? `: ${e.ticker}` : ''}`).join(', ')}`,
      wd.isin && `ISIN ${wd.isin}`,
      wd.lei && `LEI ${wd.lei}`,
      wd.website && `official website ${wd.website}`,
    ].filter(Boolean);
    if (facts.length) lines.push(`Wikidata ${wd.qid} (${wd.url}; community-maintained, verify recency): ${facts.join('; ')}.`);
  }
  if (sec) {
    const url = secCitationUrl(sec.cik);
    ledger.record({ url, title: `${sec.entityName ?? profile.companyName} – SEC EDGAR filings`, publisher: 'U.S. SEC (EDGAR)', date: sec.date, kind: 'reference' }, [sec.url]);
    lines.push(
      `SEC EDGAR XBRL company facts (${url}, ${sec.date ?? 'n.d.'}): revenue ${fig(sec.revenue)}; prior year ${fig(sec.revenuePrior)}; net income ${fig(sec.netIncome)}; prior year ${fig(sec.netIncomePrior)}.`,
    );
  }
  if (gleif) {
    ledger.record({ url: gleif.url, title: `${gleif.legalName} – GLEIF LEI record`, publisher: 'GLEIF', date: gleif.date, kind: 'reference' });
    lines.push(
      `GLEIF LEI ${gleif.lei} (${gleif.url}): legal name "${gleif.legalName}", legal seat ${[gleif.legalCity, gleif.legalCountry].filter(Boolean).join(', ') || 'n/a'}, HQ ${[gleif.hqCity, gleif.hqCountry].filter(Boolean).join(', ') || 'n/a'}, status ${gleif.status ?? 'n/a'}${gleif.parentName ? `, ultimate parent "${gleif.parentName}"` : ''}.`,
    );
  }
  if (!lines.length) return '';
  return [
    `Verified registry dossier for ${profile.companyName} (domain ${profile.domain}). These URLs are citable sources (independent unless the URL is client-owned):`,
    ...lines.map((l) => `- ${l}`),
  ].join('\n');
}
