import type { OpFindingSeverity, OpFindingTheme, OpLaunchBuild, OpTagVersion, OpUpgradeOpportunity } from '../../types/parity.js';

/**
 * Datengetriebene Upgrade-Regeln für Tag-Versionen aus ObservePoint.
 * Eine Regel greift, wenn ein Tag (Name-Regex) mit passender Version gefunden wird und kein
 * "Nachfolger"-Tag (unlessPresent) im Run gefeuert hat. `{version}` im Text wird ersetzt.
 */
export interface VersionRule {
  id: string;
  tag: RegExp;
  /** Version muss passen; fehlt sie, reicht die Präsenz des Tags. */
  version?: RegExp;
  /** Höchste Major-Version, die noch als veraltet gilt (z. B. jQuery < 3). */
  maxMajor?: number;
  unlessPresent?: RegExp;
  title: string;
  recommendation: string;
  severity: OpFindingSeverity;
  theme: OpFindingTheme;
  adobeProducts: string[];
}

/** Tag-Namen, die den Adobe Web SDK (alloy) bzw. Edge Network belegen. */
export const WEB_SDK_TAG = /adobe experience platform \(aep\)|adobe web sdk|\balloy\b/i;

export const VERSION_RULES: VersionRule[] = [
  {
    id: 'appmeasurement-to-websdk',
    tag: /^adobe analytics$/i,
    version: /^(JS-|H\.|AppMeasurement)/i,
    unlessPresent: WEB_SDK_TAG,
    title: 'AppMeasurement → Web SDK',
    recommendation:
      'Adobe Analytics still runs on AppMeasurement ({version}). Migrating to the Web SDK / Edge Network unlocks Real-Time CDP, AJO and CJA from one data stream.',
    severity: 'medium',
    theme: 'web-sdk',
    adobeProducts: ['Adobe Experience Platform Web SDK', 'Adobe Customer Journey Analytics'],
  },
  {
    id: 'atjs-to-websdk',
    tag: /^adobe target$/i,
    version: /^[12]\./,
    unlessPresent: WEB_SDK_TAG,
    title: 'at.js → Web SDK',
    recommendation:
      'Adobe Target is delivered via at.js {version}. Moving to the Web SDK enables same-page and next-page edge personalization with RTCDP audiences.',
    severity: 'medium',
    theme: 'web-sdk',
    adobeProducts: ['Adobe Experience Platform Web SDK', 'Adobe Target', 'Adobe Real-Time CDP'],
  },
  {
    id: 'ua-sunset',
    tag: /google universal analytics/i,
    title: 'Universal Analytics still active',
    recommendation:
      'Google Universal Analytics was sunset in 2023 but still fires – dead data and duplicate tracking. Consolidate measurement on one platform (CJA).',
    severity: 'high',
    theme: 'analytics',
    adobeProducts: ['Adobe Customer Journey Analytics', 'Adobe Experience Platform Web SDK'],
  },
  {
    id: 'dtm-sunset',
    tag: /^adobe dtm/i,
    title: 'Adobe DTM still in use',
    recommendation: 'Dynamic Tag Management reached end of life in 2020 – migrate to Adobe Experience Platform Tags and the Web SDK.',
    severity: 'high',
    theme: 'tag-governance',
    adobeProducts: ['Adobe Experience Platform Tags', 'Adobe Experience Platform Web SDK'],
  },
  {
    id: 'legacy-jquery',
    tag: /jquery/i,
    maxMajor: 2,
    title: 'Legacy jQuery',
    recommendation: 'jQuery {version} is end-of-life and a known security/performance risk – modernize the front end (e.g. AEM Edge Delivery Services).',
    severity: 'low',
    theme: 'performance',
    adobeProducts: ['Adobe Experience Manager Sites'],
  },
  {
    id: 'legacy-visitor-api',
    tag: /adobe experience cloud id|adobe visitor id/i,
    unlessPresent: WEB_SDK_TAG,
    title: 'Visitor API (ECID service)',
    recommendation: 'The standalone Visitor API {version} is replaced by identity handling in the Web SDK.',
    severity: 'low',
    theme: 'web-sdk',
    adobeProducts: ['Adobe Experience Platform Web SDK'],
  },
];

/** Launch-Builds älter als dieser Wert gelten als vernachlässigte Property. */
export const STALE_LAUNCH_DAYS = 365;

function major(version: string): number | undefined {
  const m = /(\d+)/.exec(version);
  return m ? Number.parseInt(m[1]!, 10) : undefined;
}

function fill(text: string, version: string): string {
  return text.replace('{version}', version || 'unknown version');
}

export function deriveUpgrades(
  versions: OpTagVersion[],
  presentTags: string[],
  launch?: OpLaunchBuild,
  rules: VersionRule[] = VERSION_RULES,
): OpUpgradeOpportunity[] {
  const out: OpUpgradeOpportunity[] = [];
  for (const rule of rules) {
    if (rule.unlessPresent && presentTags.some((t) => rule.unlessPresent!.test(t))) continue;
    const withVersion = versions.filter((v) => rule.tag.test(v.tag));
    let hit: { version: string } | undefined;
    if (rule.version || rule.maxMajor !== undefined) {
      const v = withVersion.find((x) => {
        if (rule.version && !rule.version.test(x.version)) return false;
        if (rule.maxMajor !== undefined) {
          const m = major(x.version);
          if (m === undefined || m > rule.maxMajor) return false;
        }
        return true;
      });
      if (v) hit = { version: v.version };
    } else if (withVersion.length || presentTags.some((t) => rule.tag.test(t))) {
      hit = { version: withVersion[0]?.version ?? '' };
    }
    if (!hit) continue;
    const tagName = withVersion[0]?.tag ?? presentTags.find((t) => rule.tag.test(t)) ?? '';
    out.push({
      id: rule.id,
      title: rule.title,
      evidence: `${tagName}${hit.version ? ` ${hit.version}` : ''} detected by ObservePoint`,
      recommendation: fill(rule.recommendation, hit.version),
      severity: rule.severity,
      theme: rule.theme,
      adobeProducts: rule.adobeProducts,
    });
  }
  if (launch?.buildAgeDays !== undefined && launch.buildAgeDays > STALE_LAUNCH_DAYS) {
    out.push({
      id: 'stale-launch-build',
      title: 'Stale Adobe Tags (Launch) build',
      evidence: `Last Launch build ${launch.buildDate?.slice(0, 10)} (${launch.buildAgeDays} days before the run)`,
      recommendation:
        'The Tags property has not been published for over a year – a sign of a neglected implementation. Good moment for a tag governance review and Web SDK migration.',
      severity: 'low',
      theme: 'tag-governance',
      adobeProducts: ['Adobe Experience Platform Tags', 'Adobe Experience Platform Web SDK'],
    });
  }
  return out;
}
