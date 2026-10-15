/**
 * AdTech-, B2B-Intent- und Utility-Regeln aus dem ObservePoint-Gap-Abgleich
 * (docs/library-research/02-rule-proposals.json). Signale sind auf Host + Pfad verankert;
 * reine Cookie-Sync-Regeln ohne Script-Beleg sind in der Konfidenz gedeckelt.
 * jsGlobals aus den Vorschlägen fehlen bewusst: python/js_probes.js liefert dafür keine Probes.
 */
import type { DetectionRule } from '../customDetectors.js';
import { host } from './ruleHelpers.js';

export const ADTECH_B2B_RULES: DetectionRule[] = [
  // ── Tag Management / Utilities ──
  {
    name: 'Google Tag (gtag.js)',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/googletagmanager\.com\/gtag\/js\?id=(G|AW|DC|GT)-/],
      requests: [/googletagmanager\.com\/gtag\/(js|destination)\b/, /googletagmanager\.com\/td\?/],
      // Conversion-Linker-Cookie jedes gtag-/GTM-Setups (vorher fälschlich Google Ads).
      cookies: ['_gcl_au'],
    },
  },
  {
    name: 'Google Fonts',
    categories: ['Other'],
    patterns: {
      requests: [/fonts\.googleapis\.com\/css2?\?/, /fonts\.gstatic\.com\/s\//],
      html: [/fonts\.googleapis\.com\/css/],
    },
  },
  {
    name: 'Font Awesome',
    categories: ['CSS Framework'],
    patterns: {
      scriptSrc: [/kit\.fontawesome\.com\/[0-9a-f]+\.js/],
      requests: [/(^|\/\/)(use|ka-f)\.fontawesome\.com\//, /bootstrapcdn\.com\/font-awesome\//],
      html: [/(use|kit)\.fontawesome\.com/, /font-awesome(\.min)?\.css/],
    },
  },
  {
    name: 'Google Maps JavaScript API',
    categories: ['Other'],
    patterns: { scriptSrc: [/maps\.googleapis\.com\/maps\/api\/js/] },
  },
  {
    name: 'Moment.js',
    categories: ['JavaScript Framework'],
    patterns: { scriptSrc: [/(^|\/)moment(-with-locales)?(\.min)?\.js(\?|$)/] },
  },

  // ── Identity / 3rd Party Data (B2B-Intent) ──
  {
    name: 'Tapad (Experian)',
    categories: ['DMP'],
    maxConfidence: 70,
    patterns: {
      requests: [/(^|\/\/)pixel\.tapad\.com\/idsync\//, /(^|\/\/)tag\.tapad\.com\//],
      cookies: ['TapAd_DID', 'TapAd_TS', 'TapAd_3WAY_SYNCS'],
    },
  },
  {
    name: 'ZoomInfo (WebSights)',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/(^|\/\/)js\.zi-scripts\.com\/zi-tag\.js/],
      requests: [/(^|\/\/)ws\.zoominfo\.com\/pixel\//],
      cookies: ['_zitok'],
    },
  },
  {
    name: '6sense',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/(^|\/\/)j\.6sc\.co\/(6si\.min\.js|j\/)/],
      requests: [/(^|\/\/)(b|c)\.6sc\.co\//, /(^|\/\/)epsilon\.6sense\.com\//],
      cookies: ['_gd_visitor', '_gd_session', '_gd_svisitor'],
    },
  },
  {
    name: 'Demandbase',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/(^|\/\/)(tag|scripts)\.demandbase\.com\//],
      requests: [/(^|\/\/)api\.company-target\.com\/api\/v\d\/ip\.json/],
    },
  },
  {
    name: 'Bombora',
    categories: ['DMP'],
    maxConfidence: 70,
    patterns: { requests: [/(^|[\/.])ml314\.com\/((ut|c|im)sync\.ashx|tag\.aspx)/] },
  },
  {
    name: 'G2 Buyer Intent',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/(^|\/\/)tracking(-api)?\.g2(crowd)?\.com\/attribution_tracking\/conversions\/\d+\.js/],
    },
  },
  {
    name: 'Madison Logic',
    categories: ['DMP'],
    maxConfidence: 70,
    patterns: { requests: [/(^|\/\/)s\.ml-attr\.com\/getuid/] },
  },
  {
    name: 'Dun & Bradstreet Audience',
    categories: ['DMP'],
    maxConfidence: 70,
    patterns: {
      requests: [/(^|\/\/)(ecf|api\d+)\.d41\.co\/sync\//],
      cookies: ['D41ID'],
    },
  },

  // ── Advertising ──
  {
    name: 'BidSwitch',
    categories: ['Advertising'],
    maxConfidence: 70,
    patterns: {
      requests: [/(^|\/\/)x\.bidswitch\.net\/(ul_cb\/)?syncd?\b/],
      cookies: ['tuuid', 'tuuid_lu'],
    },
  },
  {
    name: 'StackAdapt',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/(^|\/\/)tags\.srv\.stackadapt\.com\/events\.js/],
      requests: [/(^|\/\/)tags\.srv\.stackadapt\.com\/saq_pxl/],
      cookies: ['sa-user-id', 'sa-user-id-v2', 'sa-user-id-v3'],
    },
  },
  {
    name: 'LiveIntent',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/(^|\/\/)b-code\.liadm\.com\//],
      requests: [/(^|\/\/)i\.liadm\.com\/s\/\d+/],
      cookies: ['_li_ss', 'lidid', '_lc2_fpi'],
    },
  },
  {
    name: 'Claritas (Barometric / ArtsAI)',
    categories: ['Advertising'],
    patterns: { requests: [/(^|[\/.])trkn\.us\/pixel\/conv\//, /(^|[\/.])arttrk\.com\/pixel\//] },
  },
  {
    // Cookie „suid“ ist zu generisch und wird nicht übernommen.
    name: 'Simpli.fi',
    categories: ['Advertising'],
    patterns: { requests: [/(^|\/\/)(tag|i|um)\.simpli\.fi\//] },
  },
  {
    name: 'Spotify Ad Analytics (Podsights)',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/(^|\/\/)pixel\.byspotify\.com\/ping\.min\.js/, /(^|\/\/)cdn\.pdst\.fm\/ping\.min\.js/],
      requests: [/(^|\/\/)pixels\.spotify\.com\/v1\/ingest/],
      cookies: ['__spdt', '__pdst'],
    },
  },
  {
    name: 'Yahoo! JAPAN Ads',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/(^|\/\/)s\.yimg\.jp\/images\/listing\/tool\/cv\/ytag\.js/],
      requests: [/(^|\/\/)b\d+\.yahoo\.co\.jp\/pagead\/conversion\//],
      cookies: ['_yjsu_yjad'],
    },
  },
  {
    // Cookie „ssi“ ist zu generisch und wird nicht übernommen.
    name: 'Basis (Centro / SiteScout)',
    categories: ['Advertising'],
    patterns: {
      requests: [/(^|\/\/)pixel(-sync)?\.sitescout\.com\//],
      cookies: ['_ssuma'],
    },
  },
  {
    name: 'Dstillery',
    categories: ['Advertising'],
    patterns: { requests: [/(^|\/\/)(idpix|action)\.media6degrees\.com\/orbserv\//, /(^|\/\/)action\.dstillery\.com\/orbserv\//] },
  },
  {
    name: 'RTB House',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/(^|\/\/)tags\.creativecdn\.com\/[A-Za-z0-9]+\.js/],
      cookies: ['__rtbh.lid', '__rtbh.uid'],
    },
  },
  {
    name: 'LINE Tag',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/(^|\/\/)d\.line-scdn\.net\/n\/line_tag\/public\/release\/v\d\/lt\.js/],
      requests: [/(^|\/\/)tr\.line\.me\/tag\.gif/],
      cookies: ['__lt__cid', '__lt__sid'],
    },
  },
  {
    name: 'Adara',
    categories: ['Advertising'],
    patterns: { requests: [/(^|\/\/)tag\.yieldoptimizer\.com\/ps\/ps/] },
  },
  {
    name: 'MNTN (Mountain)',
    categories: ['Advertising'],
    patterns: { requests: [/(^|\/\/)dx\.mountain\.com\/spx/] },
  },
  {
    name: 'Sojern',
    categories: ['Advertising'],
    patterns: { requests: [/(^|\/\/)(pixel|beacon)\.sojern\.com\//] },
  },
  {
    name: 'Viant Adelphic',
    categories: ['Advertising'],
    patterns: { requests: [/(^|\/\/)ad\.ipredictive\.com\/d\/track\//] },
  },
  {
    name: 'Nextdoor Pixel',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/(^|\/\/)ads\.nextdoor\.com\/public\/pixel\/ndp\.js/],
      requests: [/(^|\/\/)flask\.nextdoor\.com\/pixel/],
      cookies: ['ndp_session_id'],
    },
  },

  // ── Consent ──
  {
    name: 'HubSpot Cookie Banner',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/(^|\/\/)js(-[a-z]{2}\d)?\.hs-banner\.com\/(v2\/)?\d+\/banner\.js/],
      cookies: ['__hs_cookie_cat_pref', '__hs_opt_out'],
    },
  },
  {
    name: 'Securiti Consent',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/(^|\/\/)cdn-prod(\.eu)?\.securiti\.ai\/consent\/cookie-consent-sdk/],
      cookies: ['__privaci_cookie_consent_uuid', '__privaci_cookie_consents'],
    },
  },

  // ── Analytics / Measurement ──
  {
    name: 'Siteimprove Analytics',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/(^|[\/.])siteimproveanalytics\.com\/js\/siteanalyze_\d+\.js/],
      requests: [/\.siteimproveanalytics\.io\/image\.aspx/],
      cookies: ['nmstat'],
    },
  },
  {
    name: 'Branch',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/(^|\/\/)cdn\.branch\.io\/branch-latest\.min\.js/],
      requests: [/(^|\/\/)api2?\.branch\.io\/v1\/(pageview|open)/],
    },
  },
  {
    name: 'TVSquared (Innovid)',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/(^|\/\/)collector-\d+\.(us\.)?tvsquared\.com\/tv2track\.js/],
      requests: [/(^|\/\/)collector-\d+\.(us\.)?tvsquared\.com\/tv2track\.php/],
      cookies: ['_tq_id.'],
    },
  },
  {
    name: 'iSpot.tv',
    categories: ['Analytics'],
    patterns: { requests: [/(^|\/\/)pt\.ispot\.tv\/v2\//] },
  },
  {
    name: 'Nielsen Digital Measurement (DCR/DAR)',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [host('imrworldwide.com')],
      requests: [/(^|\/\/)(secure-[a-z]{2}\.)?imrworldwide\.com\/(cgi-bin\/m\?|v60\.js)/],
      cookies: ['IMRID'],
    },
  },
];
