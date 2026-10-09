/**
 * Laufzeit-Signale (Netzwerk-Beacons + JS-Globals) für bestehende Regeln in customDetectors.ts.
 *
 * Ein gefeuerter Beacon bzw. ein initialisiertes Vendor-Objekt ist ein deutlich stärkerer
 * Beleg als ein Script-Pfad oder ein HTML-Keyword – genau das, was Tag-Audit-Tools wie
 * ObservePoint auswerten. Die Namen müssen exakt einer Regel entsprechen (wird beim
 * Modul-Load geprüft).
 */
export interface SignalLayer {
  name: string;
  requests?: RegExp[];
  /** Probe-Key aus python/js_probes.js → Wert-Regex. */
  js?: Record<string, RegExp>;
}

const ANY = /./;

export const SIGNAL_LAYERS: SignalLayer[] = [
  // Tag Management / CDP
  { name: 'Tealium iQ', requests: [/tags\.tiqcdn\.com\/utag\//], js: { 'tealium.utag': ANY } },
  { name: 'Segment', requests: [/api\.segment\.(io|com)\/v1\//], js: { segment: ANY } },
  { name: 'mParticle', requests: [/\.mparticle\.com\/v\d\//], js: { mparticle: ANY } },
  { name: 'Bloomreach Engagement (Exponea)', requests: [/api\.exponea\.com\//], js: { 'bloomreach.exponea': ANY } },
  { name: 'Braze', requests: [/sdk\.[a-z0-9-]+\.braze\.(com|eu)\//], js: { braze: ANY } },
  { name: 'Klaviyo', requests: [/a\.klaviyo\.com\//], js: { klaviyo: ANY } },
  { name: 'Emarsys', requests: [/recommender\.scarabresearch\.com\//], js: { emarsys: ANY } },
  { name: 'HubSpot Marketing', requests: [/track\.hubspot\.com\/__pt?\.gif/], js: { hubspot: ANY } },

  // Analytics / Experience Analytics
  { name: 'Hotjar', requests: [/\.hotjar\.(com|io)\//], js: { hotjar: ANY } },
  { name: 'Contentsquare', requests: [/\.contentsquare\.net\//], js: { contentsquare: ANY } },
  { name: 'Quantum Metric', requests: [/\.quantummetric\.com\//], js: { quantummetric: ANY } },
  { name: 'Medallia / Decibel', requests: [/\.kampyle\.com\//, /\.decibelinsight\.net\//], js: { medallia: ANY } },
  { name: 'Qualtrics', requests: [/siteintercept\.qualtrics\.com\//], js: { qualtrics: ANY } },
  { name: 'Mixpanel', requests: [/api(-eu)?\.mixpanel\.com\/(track|engage)/], js: { mixpanel: ANY } },
  { name: 'Amplitude', requests: [/api2?\.amplitude\.com\//, /api\.eu\.amplitude\.com\//], js: { amplitude: ANY } },
  { name: 'Heap', requests: [/heapanalytics\.com\/h\?/], js: { heap: ANY } },
  { name: 'FullStory', requests: [/rs\.fullstory\.com\/rec\//], js: { fullstory: ANY } },
  { name: 'Microsoft Clarity', requests: [/\.clarity\.ms\/collect/], js: { clarity: ANY } },
  { name: 'Snowplow', requests: [/\/com\.snowplowanalytics\.snowplow\/tp2/], js: { snowplow: ANY } },
  { name: 'Piwik / Matomo', requests: [/\/matomo\.php\?/, /\/piwik\.php\?/], js: { matomo: ANY } },
  { name: 'etracker', requests: [/\.etracker\.(com|de)\//], js: { etracker: ANY } },
  { name: 'Piano Analytics (AT Internet)', requests: [/\.xiti\.com\/hit\.xiti/, /\.pa-cd\.com\/event/], js: { piano: ANY } },

  // Personalization & Optimization
  { name: 'Optimizely', requests: [/logx\.optimizely\.com\//], js: { optimizely: ANY } },
  { name: 'VWO', requests: [/dev\.visualwebsiteoptimizer\.com\//], js: { vwo: ANY } },
  { name: 'Dynamic Yield', requests: [/\.dynamicyield\.com\//], js: { dynamicyield: ANY } },
  {
    name: 'Evergage / Salesforce Interaction Studio',
    requests: [/\.evergage\.com\//, /\.evgnet\.com\//],
    js: { evergage: ANY, 'salesforce.interactions': ANY },
  },

  // Consent
  { name: 'OneTrust', requests: [/cdn\.cookielaw\.org\//, /\.onetrust\.com\//], js: { onetrust: ANY } },
  { name: 'Cookiebot', requests: [/consent\.cookiebot\.(com|eu)\//], js: { cookiebot: ANY } },
  { name: 'Usercentrics', requests: [/\.usercentrics\.eu\//], js: { usercentrics: ANY } },
  { name: 'Didomi', requests: [/sdk\.privacy-center\.org\//, /api\.privacy-center\.org\//], js: { didomi: ANY } },
  { name: 'TrustArc', requests: [/consent\.trustarc\.com\//], js: { trustarc: ANY } },

  // Advertising (gefeuerte Pixel)
  { name: 'Facebook / Meta Pixel', requests: [/facebook\.com\/tr\/?\?/], js: { 'meta.fbq': ANY } },
  { name: 'LinkedIn Insight Tag', requests: [/px\.ads\.linkedin\.com\//], js: { linkedin: ANY } },
  { name: 'TikTok Pixel', requests: [/analytics\.tiktok\.com\/api\//], js: { tiktok: ANY } },
  { name: 'Microsoft Advertising (Bing UET)', requests: [/bat\.bing\.com\/action\//], js: { 'bing.uet': ANY } },
  { name: 'Pinterest Tag', requests: [/ct\.pinterest\.com\//], js: { pinterest: ANY } },
  { name: 'Criteo', requests: [/\.criteo\.(com|net)\//], js: { criteo: ANY } },
  { name: 'Google Ads', requests: [/googleads\.g\.doubleclick\.net\/pagead\/(viewthrough)?conversion/, /google\.com\/pagead\/1p-conversion/], js: { 'google.tags': /(^|,)AW-/ } },

  // Customer Support
  { name: 'Intercom', requests: [/api-iam\.intercom\.io\//], js: { intercom: ANY } },
  { name: 'Zendesk', requests: [/\.zdassets\.com\//, /\.zendesk\.com\/embeddable/], js: { zendesk: ANY } },
  { name: 'LivePerson', requests: [/\.liveperson\.net\//, /\.lpsnmedia\.net\//], js: { liveperson: ANY } },
  { name: 'Salesforce Live Agent / Messaging', requests: [/\.my\.salesforce-scrt\.com\//, /\.salesforceliveagent\.com\//], js: { 'salesforce.chat': ANY } },
  { name: 'Drift', requests: [/\.drift\.com\//, /\.driftt\.com\//], js: { drift: ANY } },

  // Performance / RUM
  { name: 'Dynatrace', requests: [/\/rb_bf[0-9a-z]+\?/, /bf\.dynatrace\.com\//], js: { dynatrace: ANY } },
  { name: 'New Relic', requests: [/bam(-cell)?\.(eu01\.)?nr-data\.net\//], js: { newrelic: ANY } },
  { name: 'Datadog RUM', requests: [/browser-intake-[a-z0-9-]*datadoghq\.(com|eu)\//], js: { datadog: ANY } },

  // Commerce / Frameworks
  { name: 'Shopify', js: { shopify: ANY } },
  { name: 'Next.js', js: { nextjs: ANY } },
  { name: 'Nuxt.js', js: { nuxt: ANY } },
  { name: 'Vue.js', js: { vue: ANY } },
  { name: 'jQuery', js: { jquery: ANY } },
  { name: 'Gatsby', js: { gatsby: ANY } },
];
