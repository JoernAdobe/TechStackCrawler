import type { ScrapedData } from './scraper.js';

export interface DetectedTech {
  name: string;
  categories: string[];
  confidence: number;
  version?: string;
}

interface DetectionRule {
  name: string;
  categories: string[];
  patterns: {
    html?: RegExp[];
    scriptSrc?: RegExp[];
    cookies?: string[];
    headers?: Record<string, RegExp>;
    meta?: Record<string, RegExp>;
  };
}

const rules: DetectionRule[] = [
  // ── CMS ──────────────────────────────────────────────
  {
    name: 'Adobe Experience Manager',
    categories: ['CMS'],
    patterns: {
      html: [/\/etc\.clientlibs\//, /cq[-:]template/, /jcr:content/, /\/content\/dam\//],
      cookies: ['cq-authoring-mode', 'cq-dam-path'],
      scriptSrc: [/\/etc\.clientlibs\//, /granite\.js/],
    },
  },
  {
    name: 'Sitecore',
    categories: ['CMS'],
    patterns: {
      html: [/sitecore/i, /__sc_/, /sc_site/],
      cookies: ['SC_ANALYTICS_GLOBAL_COOKIE', 'sitecore'],
    },
  },
  {
    name: 'Contentful',
    categories: ['CMS'],
    patterns: {
      html: [/contentful/i, /ctfassets\.net/],
      scriptSrc: [/contentful/],
    },
  },
  {
    name: 'Sanity',
    categories: ['CMS'],
    patterns: {
      html: [/sanity\.io/, /cdn\.sanity\.io/],
    },
  },
  // ── eCommerce ────────────────────────────────────────
  {
    name: 'Adobe Commerce (Magento)',
    categories: ['eCommerce'],
    patterns: {
      html: [/Magento/, /magento/i, /mage\//, /requirejs-config.*Magento/],
      scriptSrc: [/mage\//, /static\/version/],
      cookies: ['PHPSESSID', 'form_key', 'mage-cache', 'mage-messages'],
    },
  },
  {
    name: 'Salesforce Commerce Cloud',
    categories: ['eCommerce'],
    patterns: {
      html: [/demandware\.net/, /demandware\.store/],
      scriptSrc: [/demandware/],
    },
  },
  {
    name: 'SAP Commerce Cloud (Hybris)',
    categories: ['eCommerce'],
    patterns: {
      html: [/hybris/i, /_ui\/responsive/, /acceleratorservices/],
    },
  },
  {
    name: 'Oracle Commerce Cloud',
    categories: ['eCommerce'],
    patterns: {
      html: [/oracle\.com.*commerce/i, /ccstore/],
    },
  },
  // ── DMP ──────────────────────────────────────────────
  {
    name: 'Adobe Audience Manager',
    categories: ['DMP'],
    patterns: {
      html: [/demdex\.net/, /dpm\.demdex\.net/],
      scriptSrc: [/demdex\.net/, /dil\.js/],
      cookies: ['demdex', 'dextp', 'dst'],
    },
  },
  {
    name: 'Oracle BlueKai',
    categories: ['DMP'],
    patterns: {
      html: [/bluekai\.com/, /bkrtx\.com/],
      scriptSrc: [/bluekai\.com/, /bkrtx\.com/],
    },
  },
  {
    name: 'Lotame',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/lotame\.com/, /crwdcntrl\.net/],
    },
  },
  // ── CDP ──────────────────────────────────────────────
  {
    name: 'Adobe Real-Time CDP',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/alloy\.js/, /launchpad\.adobedc\.net/],
      html: [/adobedc\.net/],
      cookies: ['AMCV_', 'adobe_mc'],
    },
  },
  {
    name: 'Segment',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/cdn\.segment\.com/, /cdn\.segment\.io/],
      html: [/analytics\.identify/, /analytics\.track/],
    },
  },
  {
    name: 'Tealium',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/tags\.tiqcdn\.com/, /tealium/],
    },
  },
  {
    name: 'mParticle',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/mparticle\.com/],
    },
  },
  // ── Analytics ────────────────────────────────────────
  {
    name: 'Adobe Analytics',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/omtrdc\.net/, /AppMeasurement/, /assets\.adobedtm\.com/],
      html: [/s_account/, /omniture/i, /sc\.omtrdc\.net/],
      cookies: ['s_vi', 's_sq', 's_cc', 's_fid', 's_ecid', 'AMCV_'],
    },
  },
  {
    name: 'Adobe Experience Platform Web SDK',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/alloy\.js/, /launch-.*\.adobedtm\.com/],
      html: [/alloy\(/, /adobedc\.net/],
      cookies: ['AMCV_', 'adobe_mc'],
    },
  },
  // ── Personalization & Optimization ───────────────────
  {
    name: 'Adobe Target',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/tt\.omtrdc\.net/, /at\.js/],
      html: [/mboxCreate/, /adobe\.target/, /mbox/],
      cookies: ['mbox', 'AMCV_'],
    },
  },
  {
    name: 'Optimizely',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/cdn\.optimizely\.com/],
    },
  },
  {
    name: 'VWO',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/dev\.visualwebsiteoptimizer\.com/, /vwo_code/],
    },
  },
  {
    name: 'Dynamic Yield',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/dynamicyield\.com/, /dy-api/],
    },
  },
  // ── DAM ──────────────────────────────────────────────
  {
    name: 'Adobe Experience Manager Assets',
    categories: ['DAM'],
    patterns: {
      html: [/\/content\/dam\//, /assets\.adobe\.com/],
      scriptSrc: [/assets\.adobe\.com/],
    },
  },
  {
    name: 'Bynder',
    categories: ['DAM'],
    patterns: {
      html: [/bynder\.com/, /bynder/i],
    },
  },
  {
    name: 'Canto',
    categories: ['DAM'],
    patterns: {
      html: [/canto\.com/, /cantoglobal/],
    },
  },
  // ── CRM ──────────────────────────────────────────────
  {
    name: 'Salesforce',
    categories: ['CRM'],
    patterns: {
      html: [/force\.com/, /salesforce\.com/],
      scriptSrc: [/force\.com/],
    },
  },
  {
    name: 'Microsoft Dynamics',
    categories: ['CRM'],
    patterns: {
      html: [/dynamics\.com/, /msdyncrm/],
    },
  },
  {
    name: 'HubSpot CRM',
    categories: ['CRM'],
    patterns: {
      scriptSrc: [/js\.hs-scripts\.com/, /js\.hubspot\.com/],
      html: [/hubspot/i],
    },
  },
  // ── ESP / Marketing Automation ───────────────────────
  {
    name: 'Adobe Marketo Engage',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/munchkin\.marketo\.net/, /mktoForms/],
      html: [/mktoForm/, /marketo/i, /munchkin/i],
      cookies: ['_mkto_'],
    },
  },
  {
    name: 'Salesforce Marketing Cloud',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/exacttarget\.com/, /salesforce-mc/],
      html: [/exacttarget/i],
    },
  },
  {
    name: 'Eloqua',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/eloqua\.com/, /elqtrack/],
      html: [/eloqua/i, /elqTrack/],
    },
  },
  {
    name: 'Pardot',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/pardot\.com/, /pi\.pardot/],
      html: [/pardot/i],
    },
  },
  {
    name: 'Klaviyo',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/klaviyo\.com/, /static\.klaviyo/],
    },
  },
  // ── EDW / Data ───────────────────────────────────────
  {
    name: 'Snowflake',
    categories: ['EDW'],
    patterns: {
      html: [/snowflake/i],
    },
  },
  // ── Tag Management ───────────────────────────────────
  {
    name: 'Adobe Experience Platform Launch',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/assets\.adobedtm\.com/, /launch-.*\.min\.js/],
      cookies: ['_sdsat', 'AMCV_'],
    },
  },
  {
    name: 'Google Tag Manager',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/googletagmanager\.com/],
      html: [/GTM-[A-Z0-9]+/],
    },
  },
  // ── Advertising / Tracking ───────────────────────────
  {
    name: 'Adobe Advertising Cloud',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/everesttech\.net/],
      html: [/everesttech\.net/],
      cookies: ['everest_g_v2', 'everest_session_v2'],
    },
  },
  {
    name: 'Adobe Fonts (Typekit)',
    categories: ['Other'],
    patterns: {
      scriptSrc: [/use\.typekit\.net/, /p\.typekit\.net/],
      html: [/typekit\.net/, /fonts\.adobe\.com/],
    },
  },
  {
    name: 'Adobe Sign',
    categories: ['Other'],
    patterns: {
      scriptSrc: [/echosign\.com/, /acrobat\.com/],
      html: [/adobe\.com\/sign/, /echosign\.com/],
    },
  },
  {
    name: 'Google Ads',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/googleads\.g\.doubleclick\.net/, /pagead2\.googlesyndication/],
      cookies: ['_gcl_au', '_gcl_dc', '_gac_'], // _gac_ = prefix für _gac_GB-xxx
    },
  },
  {
    name: 'Facebook Pixel',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/connect\.facebook\.net/],
      html: [/fbq\(/, /facebook\.com\/tr/],
      cookies: ['_fbp', '_fbc', 'fr'],
    },
  },
  {
    name: 'Tealium',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/tiqcdn\.com/, /tealium\.com/],
      html: [/utag\.js/, /tealium/i],
      cookies: ['utag_main', 'utag_env'],
    },
  },
  {
    name: 'Google Analytics',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/google-analytics\.com/, /googletagmanager\.com/],
      html: [/UA-\d+-\d+/, /G-[A-Z0-9]+/],
      cookies: ['_ga', '_gid', '_gat'],
    },
  },
  {
    name: 'LinkedIn Insight Tag',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/snap\.licdn\.com/],
      html: [/linkedin\.com\/insight/],
      cookies: ['li_sugr', 'bcookie'],
    },
  },
  {
    name: 'Twitter Pixel',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/static\.ads-twitter\.com/],
      html: [/twq\(/],
      cookies: ['personalization_id'],
    },
  },
  {
    name: 'TikTok Pixel',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/analytics\.tiktok\.com/],
      html: [/ttq\.load/],
      cookies: ['tt_chain_token', 'tt_'],
    },
  },
  // ── Weitere Analytics ─────────────────────────────────
  {
    name: 'Mixpanel',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/mixpanel\.com/],
      cookies: ['mp_'],
    },
  },
  {
    name: 'Hotjar',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/hotjar\.com/],
      cookies: ['_hjSessionUser_', '_hjSession_', '_hjAbsoluteSessionInProgress'],
    },
  },
  {
    name: 'Heap',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/heap\.io/],
      cookies: ['_hp2_'],
    },
  },
  {
    name: 'FullStory',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/fullstory\.com/],
      cookies: ['_fs_'],
    },
  },
  {
    name: 'Amplitude',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/amplitude\.com/],
      cookies: ['amp_'],
    },
  },
  {
    name: 'Piwik/Matomo',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/matomo|piwik/],
      cookies: ['_pk_'],
    },
  },
  {
    name: 'Segment',
    categories: ['Analytics', 'Tag Management'],
    patterns: {
      scriptSrc: [/segment\.com/, /cdn\.segment\.com/],
      cookies: ['_sctr', '_scid'],
    },
  },
  // ── Weitere Advertising ──────────────────────────────
  {
    name: 'Pinterest Tag',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/pintrk|pinterest\.com/],
      cookies: ['_pinterest_sess', '_pin_'],
    },
  },
  {
    name: 'Snapchat Pixel',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/sc-static\.net/],
      cookies: ['_scid'],
    },
  },
  {
    name: 'Criteo',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/criteo\.net/],
      cookies: ['cto_bid', 'cto_bundle'],
    },
  },
  {
    name: 'Taboola',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/taboola\.com/],
      cookies: ['_taboola'],
    },
  },
  {
    name: 'Outbrain',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/outbrain\.com/],
      cookies: ['_ob_'],
    },
  },
  {
    name: 'Microsoft Advertising (Bing)',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/bat\.bing\.com/],
      cookies: ['_uetsid', '_uetvid'],
    },
  },
  {
    name: 'Amazon Advertising',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/amazon-adsystem\.com/],
      cookies: ['_amzn_'],
    },
  },
  // ── Marketing Automation / ESP ────────────────────────
  {
    name: 'HubSpot',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/hubspot\.com/, /js\.hs-scripts\.com/],
      cookies: ['_hssc', '_hssrc', 'hubspotutk'],
    },
  },
  {
    name: 'Marketo',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/marketo\.com/],
      cookies: ['_mkto_'],
    },
  },
  {
    name: 'Pardot',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/pardot\.com/],
      cookies: ['_pardot'],
    },
  },
  {
    name: 'Klaviyo',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/klaviyo\.com/],
      cookies: ['__kla'],
    },
  },
  {
    name: 'Braze',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/braze\.com/],
      cookies: ['_ab'],
    },
  },
  {
    name: 'ActiveCampaign',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/activehosted\.com/],
      cookies: ['_ac_'],
    },
  },
  {
    name: 'Mailchimp',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/mailchimp\.com/],
      cookies: ['_mc'],
    },
  },
  // ── A/B Testing / Personalization ────────────────────
  {
    name: 'Optimizely',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/optimizely\.com/],
      cookies: ['_opt_'],
    },
  },
  {
    name: 'VWO',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/vwo\.com/],
      cookies: ['_vwo'],
    },
  },
  {
    name: 'AB Tasty',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/abtasty\.com/],
      cookies: ['_abtasty'],
    },
  },
  // ── Consent / CMP ────────────────────────────────────
  {
    name: 'Cookiebot',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/consent\.cookiebot\.com/],
      cookies: ['CookieConsent'],
    },
  },
  {
    name: 'OneTrust',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/onetrust\.com/],
      cookies: ['OptanonAlertBoxConsent', 'OptanonConsent'],
    },
  },
  {
    name: 'Quantcast',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/quantserve\.com/],
      cookies: ['_dpm_'],
    },
  },
  // ── Support / Chat ────────────────────────────────────
  {
    name: 'Intercom',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/intercom\.io/],
      cookies: ['_intercom'],
    },
  },
  {
    name: 'Drift',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/drift\.com/],
      cookies: ['_drift'],
    },
  },
  {
    name: 'Zendesk',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/zendesk\.com/],
      cookies: ['_zendesk'],
    },
  },
  {
    name: 'LiveChat',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/livechatinc\.com/],
      cookies: ['__lc_'],
    },
  },
  {
    name: 'Crisp',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/crisp\.chat/],
      cookies: ['_crisp'],
    },
  },
  // ── Session Replay / Behavior Analytics ─────────────────
  {
    name: 'Smartlook',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/smartlook\.com/],
      cookies: ['SL_C_', 'SMARTLOOK'],
    },
  },
  {
    name: 'Lucky Orange',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/luckyorange\.com/],
      cookies: ['_lo_uid', '_lo_rid', '_lo_v', '__lotl', '__lotr'],
    },
  },
  {
    name: 'LogRocket',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/logrocket\.com/],
      cookies: ['_lr_'],
    },
  },
  {
    name: 'Mouseflow',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/mouseflow\.com/],
      cookies: ['mf_'],
    },
  },
  {
    name: 'Microsoft Clarity',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/clarity\.ms/],
      cookies: ['_clck', '_clsk'],
    },
  },
  {
    name: 'Pendo',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/pendo\.io/],
      cookies: ['_pendo_'],
    },
  },
  {
    name: 'Gainsight',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/gainsight\.com/],
      cookies: ['_gs_'],
    },
  },
  {
    name: 'UserVoice',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/uservoice\.com/],
      cookies: ['uv_'],
    },
  },
  // ── Weitere Advertising / Ad Tech ──────────────────────
  {
    name: 'Adform',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/adform\.net/],
      cookies: ['TPC', 'GCM', 'CM14'],
    },
  },
  {
    name: 'AdRoll',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/adroll\.com/],
      cookies: ['__ar_v4', '__adroll'],
    },
  },
  {
    name: 'The Trade Desk',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/adsrvr\.org/],
      cookies: ['_tt_'],
    },
  },
  {
    name: 'MediaMath',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/mathtag\.com/, /mediamath\.com/],
      cookies: ['mmapi'],
    },
  },
  {
    name: 'LiveRamp',
    categories: ['Advertising', 'DMP'],
    patterns: {
      scriptSrc: [/rlcdn\.com/, /liveramp\.com/],
      cookies: ['_lr_', 'lr_env'],
    },
  },
  {
    name: 'Permutive',
    categories: ['DMP', 'Advertising'],
    patterns: {
      scriptSrc: [/permutive\.com/],
      cookies: ['_permutive'],
    },
  },
  {
    name: 'Reddit Pixel',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/reddit\.com\/static\/ads/],
      cookies: ['_rdt_uuid', '_rdt_em', '_rdt'],
    },
  },
  {
    name: 'Quora Pixel',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/quora\.com/],
      cookies: ['_qca'],
    },
  },
  {
    name: 'Yahoo/Verizon Advertising',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/ads\.yahoo\.com/, /verizonmedia\.com/],
      cookies: ['B', 'AO'],
    },
  },
  {
    name: 'Plista',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/plista\.com/],
      cookies: ['_plista'],
    },
  },
  {
    name: 'Revcontent',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/revcontent\.com/],
      cookies: ['rcid'],
    },
  },
  {
    name: 'TripleLift',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/triplelift\.com/],
      cookies: ['_tl_'],
    },
  },
  {
    name: 'Sharethrough',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/sharethrough\.com/],
      cookies: ['_st_'],
    },
  },
  {
    name: 'Nativo',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/nativo\.com/],
      cookies: ['_nat_'],
    },
  },
  {
    name: 'Media.net',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/media\.net/],
      cookies: ['_med_'],
    },
  },
  // ── Affiliate Marketing ────────────────────────────────
  {
    name: 'Awin',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/awin1\.com/, /awin\.com/],
      cookies: ['awin'],
    },
  },
  {
    name: 'Commission Junction (CJ)',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/cj\.com/, /commissionjunction/],
      cookies: ['cjevent', 'cj_'],
    },
  },
  {
    name: 'ShareASale',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/shareasale\.com/],
      cookies: ['__ss', '__ss_ref'],
    },
  },
  {
    name: 'Impact',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/impact\.com/],
      cookies: ['impact_'],
    },
  },
  // ── Surveys / Feedback ─────────────────────────────────
  {
    name: 'Qualtrics',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/qualtrics\.com/],
      cookies: ['QSI'],
    },
  },
  {
    name: 'SurveyMonkey',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/surveymonkey\.com/],
      cookies: ['_sm'],
    },
  },
  {
    name: 'Typeform',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/typeform\.com/],
      cookies: ['_tf_'],
    },
  },
  // ── Weitere CMP / Consent ──────────────────────────────
  {
    name: 'Usercentrics',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/usercentrics\.com/],
      cookies: ['uc_'],
    },
  },
  {
    name: 'Sourcepoint',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/sourcepoint\.com/],
      cookies: ['_sp_'],
    },
  },
  {
    name: 'Didomi',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/didomi\.io/],
      cookies: ['didomi_token'],
    },
  },
  {
    name: 'TrustArc',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/trustarc\.com/],
      cookies: ['notice_'],
    },
  },
  {
    name: 'Iubenda',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/iubenda\.com/],
      cookies: ['_iub_'],
    },
  },
  {
    name: 'CookieYes',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/cookieyes\.com/],
      cookies: ['cookieyes-consent'],
    },
  },
  // ── Weitere Support / Chat ─────────────────────────────
  {
    name: 'Freshdesk',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/freshdesk\.com/],
      cookies: ['_fw'],
    },
  },
  {
    name: 'Tidio',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/tidio\.co/],
      cookies: ['tidio'],
    },
  },
  {
    name: 'Tawk.to',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/tawk\.to/],
      cookies: ['tawk_'],
    },
  },
  {
    name: 'Olark',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/olark\.com/],
      cookies: ['olark'],
    },
  },
  // ── Weitere ESP / Email ────────────────────────────────
  {
    name: 'Iterable',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/iterable\.com/],
      cookies: ['iterableEndUserId'],
    },
  },
  {
    name: 'Customer.io',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/customer\.io/],
      cookies: ['cio_'],
    },
  },
  {
    name: 'Sendinblue (Brevo)',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/sendinblue\.com/, /brevo\.com/],
      cookies: ['sib_'],
    },
  },
  {
    name: 'ConvertKit',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/convertkit\.com/],
      cookies: ['ck_subscriber_id'],
    },
  },
  {
    name: 'Drip',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/drip\.com/],
      cookies: ['_drip_'],
    },
  },
  // ── Weitere A/B Testing ────────────────────────────────
  {
    name: 'Kameleoon',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/kameleoon\.com/],
      cookies: ['_kameleoon'],
    },
  },
  {
    name: 'Monetate',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/monetate\.net/],
      cookies: ['_mt_'],
    },
  },
  {
    name: 'Dynamic Yield',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/dynamicyield\.com/],
      cookies: ['_dy_'],
    },
  },
];

export function customDetect(scraped: ScrapedData): DetectedTech[] {
  const detected: DetectedTech[] = [];

  for (const rule of rules) {
    let matched = false;

    // Check HTML patterns
    if (!matched && rule.patterns.html) {
      matched = rule.patterns.html.some((re) => re.test(scraped.html));
    }

    // Check script source patterns
    if (!matched && rule.patterns.scriptSrc) {
      matched = rule.patterns.scriptSrc.some((re) =>
        scraped.scriptSrc.some((src) => re.test(src)),
      );
    }

    // Check cookie name patterns (exact match or prefix when name ends with _)
    if (!matched && rule.patterns.cookies) {
      const cookieKeys = Object.keys(scraped.cookies);
      matched = rule.patterns.cookies.some((name) => {
        if (name.endsWith('_')) {
          return cookieKeys.some((k) => k.startsWith(name.slice(0, -1)));
        }
        return name in scraped.cookies;
      });
    }

    // Check header patterns
    if (!matched && rule.patterns.headers) {
      for (const [header, re] of Object.entries(rule.patterns.headers)) {
        const headerKey = Object.keys(scraped.headers).find(
          (k) => k.toLowerCase() === header.toLowerCase(),
        );
        if (headerKey && scraped.headers[headerKey]?.some((v) => re.test(v))) {
          matched = true;
          break;
        }
      }
    }

    // Check meta tag patterns
    if (!matched && rule.patterns.meta) {
      for (const [metaName, re] of Object.entries(rule.patterns.meta)) {
        if (scraped.meta[metaName]?.some((v) => re.test(v))) {
          matched = true;
          break;
        }
      }
    }

    if (matched) {
      detected.push({
        name: rule.name,
        categories: rule.categories,
        confidence: 80,
      });
    }
  }

  return detected;
}
