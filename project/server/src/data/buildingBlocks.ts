/**
 * EAA-kompatible "Building Blocks" (Solution Categories) und Insight-Regeln.
 *
 * Reihenfolge und Insight-Texte folgen dem EAA-Datensatz
 * (OneAdobe/eaa-ea-automation → datasets/EAA_Automation_Source.xlsx, Sheet "Insights Logic"),
 * erweitert um Blöcke, die TSA zusätzlich erkennt (CDP, DAM, Consent, Search, Support).
 */
import type { ConsistencyCode } from '../types/parity.js';

export const BUILDING_BLOCKS = [
  'CMS',
  'DAM',
  'E-Commerce',
  'Analytics',
  'Tag Management',
  'Personalization & Optimization',
  'Campaign Orchestration',
  'CDP',
  'DMP',
  'Profile Resolution',
  '3rd Party Data',
  'Advertising',
  'Consent Management',
  'Digital Signature',
  'Search',
  'Customer Support',
] as const;

export type BuildingBlock = (typeof BUILDING_BLOCKS)[number];

/** TSA-Detection-Kategorie → Building Block. Nicht gelistete Kategorien landen in "Other Technologies". */
const CATEGORY_TO_BLOCK: Record<string, BuildingBlock> = {
  CMS: 'CMS',
  DAM: 'DAM',
  eCommerce: 'E-Commerce',
  Payments: 'E-Commerce',
  Analytics: 'Analytics',
  CRO: 'Analytics',
  'Tag Management': 'Tag Management',
  'Personalization & Optimization': 'Personalization & Optimization',
  'ESP/Marketing Automation': 'Campaign Orchestration',
  'Push Notifications': 'Campaign Orchestration',
  CRM: 'Campaign Orchestration',
  CDP: 'CDP',
  DMP: 'DMP',
  Advertising: 'Advertising',
  'Consent Management': 'Consent Management',
  Search: 'Search',
  'Customer Support': 'Customer Support',
};

/** Namensbasierte Overrides, wo die TSA-Kategorie nicht der EAA-Semantik entspricht. */
const NAME_TO_BLOCK: Array<[RegExp, BuildingBlock]> = [
  [/Experience Cloud Identity Service|\bECID\b/i, 'Profile Resolution'],
  [/^LiveRamp$|Unified ID 2\.0|^ID5$|Lotame Panorama ID|Tapad|Neustar/i, 'Profile Resolution'],
  [/Demandbase|Bombora|Eyeota|Oracle Data Cloud|Clearbit|ZoomInfo/i, '3rd Party Data'],
  [/Adobe Sign|DocuSign|Acrobat Sign/i, 'Digital Signature'],
];

export function isAdobeSolution(name: string): boolean {
  return /\badobe\b|marketo|magento|\bAEM\b|omniture|typekit/i.test(name);
}

/** Liefert alle Building Blocks einer Technologie (Mehrfachzuordnung möglich, z. B. CDP + Analytics). */
export function buildingBlocksFor(name: string, categories: string[]): BuildingBlock[] {
  for (const [re, block] of NAME_TO_BLOCK) {
    if (re.test(name)) return [block];
  }
  const blocks = new Set<BuildingBlock>();
  for (const c of categories) {
    const b = CATEGORY_TO_BLOCK[c];
    if (b) blocks.add(b);
  }
  return [...blocks];
}

interface InsightRule {
  block: BuildingBlock;
  code: ConsistencyCode;
  /** Nur bei code 1: Lösung (Regex gegen den TSA-Namen). */
  solution?: RegExp;
  text: string;
}

/** Portiert aus EAA "Insights Logic" (44 Regeln) + Ergänzungen für TSA-Blöcke. */
const INSIGHT_RULES: InsightRule[] = [
  // CMS
  { block: 'CMS', code: 1, solution: /^WordPress$/i, text: 'Use of WordPress may create customization and scale limitations that affect both personalization and team efficiency; limited ecommerce capabilities.' },
  { block: 'CMS', code: 1, solution: /Adobe Experience Manager/i, text: 'Using both AEM Sites and Assets accelerates content velocity, may enable seamless authoring and help to ensure a consistent customer experience.' },
  { block: 'CMS', code: 1, solution: /Sitecore/i, text: 'Sitecore offers only basic reporting capabilities and lacks native content creation tooling, making content velocity and consistency difficult at scale.' },
  { block: 'CMS', code: 0, text: 'Follow up with customer or account team. No CMS limits content velocity, content standardization, and team efficiency.' },
  { block: 'CMS', code: -1, text: 'Not using a CMS solution consistently limits content velocity, standardization, and makes it harder for non-IT team members to systematically update content.' },
  { block: 'CMS', code: -2, text: 'Using different CMS solutions limits consistency of brand experience across digital properties.' },
  { block: 'CMS', code: 2, text: 'Multiple CMS solutions on the same property increase maintenance cost and fragment the authoring experience.' },
  // Tag Management
  { block: 'Tag Management', code: 1, solution: /Google Tag Manager/i, text: 'GTM is deployed, which can negatively impact change velocity, data consistency, and reusability.' },
  { block: 'Tag Management', code: 1, solution: /Tealium/i, text: 'Tealium has some limitations in terms of Adobe integrations.' },
  { block: 'Tag Management', code: 1, solution: /Ensighten/i, text: 'Although Ensighten supports Adobe Analytics, it provides limited automation, interfering with team efficiency.' },
  { block: 'Tag Management', code: 1, solution: /Dynamic Tag Management|DTM/i, text: 'Adobe DTM is end-of-life – there is an opportunity to upgrade to Adobe Experience Platform Tags (Launch) and the Web SDK.' },
  { block: 'Tag Management', code: 1, solution: /Adobe Experience Platform Tags|Adobe Launch|\(Launch\)/i, text: 'Adobe Experience Platform Tags (Launch) is an open-architected system that integrates smoothly with other analytics tools; no potential issues.' },
  { block: 'Tag Management', code: 0, text: 'No tag management slows content velocity, makes it harder for the marketing team to implement changes without IT support, and limits accuracy of analytics data.' },
  { block: 'Tag Management', code: -1, text: 'Inconsistent deployment of tag management solution may inhibit the identification of a common user profile across devices.' },
  { block: 'Tag Management', code: -2, text: 'Tag management discrepancy may cause tag deployment inefficiencies and slow deployment velocity. May limit consistency across sites and create disparate data sets, limiting personalization and a comprehensive user profile.' },
  { block: 'Tag Management', code: 2, text: 'Multiple tag managers on the same property duplicate tags, slow page load and create governance gaps.' },
  // DMP
  { block: 'DMP', code: 1, solution: /Audience Manager/i, text: 'Using AAM creates opportunities to share user data and enhance segmentation strategies – evaluate the migration path to Real-Time CDP.' },
  { block: 'DMP', code: 1, solution: /Krux/i, text: 'Krux has strong segment creation/management and privacy capabilities, but limitations in custom reporting and mobile tracking (cookie-based).' },
  { block: 'DMP', code: 1, solution: /BlueKai/i, text: 'BlueKai features limited functionality for cross-device identification and publisher use cases.' },
  { block: 'DMP', code: 0, text: 'Lack of DMP leads to no 360-degree customer view, limited ability to target/personalize content, and limited ROI on paid media.' },
  { block: 'DMP', code: -1, text: 'Not consistently deploying a DMP can lead to differences in data captured across properties/teams, which may increase silos and limit the creation of a truly 360-degree customer view.' },
  { block: 'DMP', code: -2, text: 'Using different DMP solutions may lead to limited audience / data sharing, which inhibits 360-degree customer view, personalization, and cross-sell / up-sell opportunities.' },
  { block: 'DMP', code: 2, text: 'Using different DMP solutions may lead to limited audience / data sharing, which inhibits 360-degree customer view, personalization, and cross-sell / up-sell opportunities.' },
  // Analytics
  { block: 'Analytics', code: 1, solution: /^Google Analytics/i, text: 'Google Analytics may not deliver the full spectrum of digital capabilities (anomaly detection, alerts, contribution analysis, detailed segment reporting) needed as companies grow.' },
  { block: 'Analytics', code: 1, solution: /^Adobe Analytics$|Customer Journey Analytics/i, text: 'Consistent use of one analytics tool throughout the site allows for full customer journey tracking, and eliminates potential data silos / mistrust issues.' },
  { block: 'Analytics', code: 0, text: 'Lack of analytics solution may limit the insights gathered from onsite user behaviors.' },
  { block: 'Analytics', code: -1, text: 'Inconsistent deployment of analytics solutions may limit breadth of data captured from onsite activities.' },
  { block: 'Analytics', code: -2, text: 'Different analytics solutions across properties prevent a single view of the customer journey and make cross-brand reporting unreliable.' },
  { block: 'Analytics', code: 2, text: 'Using multiple analytics solutions may produce data mistrust, which damages data integrity and org willingness to be data-driven, unless specific use cases for multiple analytics solutions exist.' },
  // Personalization & Optimization
  { block: 'Personalization & Optimization', code: 1, solution: /^Optimizely$/i, text: 'Optimizely provides primarily rules-based targeting, not ML-based, which limits the scale of personalization.' },
  { block: 'Personalization & Optimization', code: 1, solution: /Certona/i, text: 'Certona has no server-side optimization capabilities and limited testing scope; no multi-armed bandit testing, limiting optimization speed.' },
  { block: 'Personalization & Optimization', code: 1, solution: /Monetate/i, text: 'Monetate provides limited out-of-the-box testing features, no pre-defined segments outside retail and limited automation (e.g. auto-allocate).' },
  { block: 'Personalization & Optimization', code: 1, solution: /Maxymiser/i, text: 'Maxymiser offers limited features and customization.' },
  { block: 'Personalization & Optimization', code: 1, solution: /Adobe Target/i, text: 'Consistent deployment of Adobe Target allows for a consistent optimization and personalization strategy, as well as cross-team knowledge sharing and consistent UX.' },
  { block: 'Personalization & Optimization', code: 0, text: 'Lack of a personalization/optimization solution presents a missed opportunity to implement A/B and multivariate testing, deploy personalization at scale and target content based on audience and intent.' },
  { block: 'Personalization & Optimization', code: -1, text: 'Inconsistent use of personalization limits cross-sell/up-sell, cross-team knowledge sharing and UX consistency.' },
  { block: 'Personalization & Optimization', code: -2, text: 'Different optimization tools across properties prevent sharing of winning experiences and audiences.' },
  { block: 'Personalization & Optimization', code: 2, text: 'Multiple personalization/optimization solutions may hinder hand-off of winning results and may cause performance issues by conflicting with each other, unless specific use cases for each exist.' },
  // Campaign Orchestration
  { block: 'Campaign Orchestration', code: 1, solution: /Eloqua/i, text: "Oracle Eloqua is easy to use for email but weak for offline channels (direct mail, POS, call center) and limited in workflow scalability." },
  { block: 'Campaign Orchestration', code: 1, solution: /Mailchimp/i, text: 'Use of a point solution may limit personalization / cross-channel coordination, and lead to data latency issues.' },
  { block: 'Campaign Orchestration', code: 1, solution: /Adobe Campaign|Journey Optimizer|Marketo/i, text: 'Adobe orchestration is in place, with significant opportunity to integrate with other solutions and personalize offers with targeted assets.' },
  { block: 'Campaign Orchestration', code: 0, text: 'No campaign orchestration solution may result in a fragmented campaign profile and hinder effective segmentation, targeting and ad suppression.' },
  { block: 'Campaign Orchestration', code: -1, text: 'Inconsistent campaign tooling across properties fragments consent, profiles and reporting.' },
  { block: 'Campaign Orchestration', code: -2, text: 'Different campaign tools across properties prevent coordinated cross-brand journeys and suppression.' },
  { block: 'Campaign Orchestration', code: 2, text: 'Several orchestration tools on one property risk over-messaging and inconsistent customer profiles.' },
  // Profile Resolution
  { block: 'Profile Resolution', code: 1, solution: /Experience Cloud Identity|ECID/i, text: 'Adobe Experience Cloud ID tracking is deployed across the site, which supports the creation of a unified profile across devices.' },
  { block: 'Profile Resolution', code: 0, text: 'No identity resolution signal detected – cross-device and cross-channel profile stitching is likely limited.' },
  // 3rd Party Data
  { block: '3rd Party Data', code: 0, text: 'Not using 3rd party data sources / visitor ID resolution may limit customers from collecting complete user profiles, limiting personalization opportunities.' },
  { block: '3rd Party Data', code: -1, text: 'Not using a 3rd party data source consistently to enrich data may limit customers from collecting complete user profiles, limiting personalization opportunities.' },
  // CDP (TSA-Erweiterung)
  { block: 'CDP', code: 1, solution: /Real-Time CDP|Experience Platform Web SDK/i, text: 'Adobe Experience Platform is in use – opportunity to expand into Journey Optimizer, CJA and AI-driven audiences.' },
  { block: 'CDP', code: 0, text: 'No CDP detected – real-time profile unification and activation across channels is likely limited (Real-Time CDP opportunity).' },
  { block: 'CDP', code: 2, text: 'Multiple CDP/customer data tools on one property suggest overlapping profile stores and data duplication.' },
  { block: 'CDP', code: -2, text: 'Different CDPs across properties prevent a unified customer profile across brands.' },
  // Consent (TSA-Erweiterung)
  { block: 'Consent Management', code: 0, text: 'No consent management platform detected – check GDPR/TTDSG compliance and its impact on data collection.' },
  { block: 'Consent Management', code: -2, text: 'Different consent platforms across properties make consent signals hard to propagate into a central profile.' },
];

const GENERIC_BY_CODE: Record<ConsistencyCode, string> = {
  1: 'One solution is consistently deployed.',
  2: 'Multiple solutions are deployed on the same property – check for overlap and conflicting data.',
  [-1]: 'One solution is used, but not consistently across all properties.',
  [-2]: 'Different solutions are used on different properties.',
  0: 'No solution identified.',
};

/** Liefert die Insight-Texte für einen Building Block + Code (spezifische Lösungsregeln zuerst). */
export function insightsFor(block: string, code: ConsistencyCode, solutions: string[]): string[] {
  const out: string[] = [];
  if (code === 1 || code === 2) {
    for (const s of solutions) {
      const rule = INSIGHT_RULES.find((r) => r.block === block && r.code === 1 && r.solution?.test(s));
      if (rule) out.push(rule.text);
    }
  }
  const generic = INSIGHT_RULES.find((r) => r.block === block && r.code === code && !r.solution);
  if (generic && !(code === 1 && out.length)) out.push(generic.text);
  if (out.length === 0 && code !== 1) out.push(GENERIC_BY_CODE[code]);
  return [...new Set(out)];
}
