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
  // ═══════════════════════════════════════════════════════
  // ██  CMS  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Adobe Experience Manager',
    categories: ['CMS'],
    patterns: {
      html: [/\/etc\.clientlibs\//, /cq[-:]template/, /jcr:content/, /\/content\/dam\//, /crx\/de/],
      cookies: ['cq-authoring-mode', 'cq-dam-path'],
      scriptSrc: [/\/etc\.clientlibs\//, /granite\.js/],
    },
  },
  {
    name: 'WordPress',
    categories: ['CMS'],
    patterns: {
      html: [/wp-content\//, /wp-includes\//, /wp-json\//],
      scriptSrc: [/wp-content\//, /wp-includes\//],
      meta: { generator: /WordPress/i },
    },
  },
  {
    name: 'Drupal',
    categories: ['CMS'],
    patterns: {
      html: [/Drupal\.settings/, /drupal\.js/, /sites\/default\/files/],
      scriptSrc: [/drupal\.js/, /sites\/all\//],
      meta: { generator: /Drupal/i },
      headers: { 'x-drupal-cache': /.*/, 'x-generator': /Drupal/ },
    },
  },
  {
    name: 'Joomla',
    categories: ['CMS'],
    patterns: {
      html: [/\/media\/jui\//, /\/components\/com_/],
      meta: { generator: /Joomla/i },
      cookies: ['joomla_user_state'],
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
  {
    name: 'Strapi',
    categories: ['CMS'],
    patterns: {
      html: [/strapi/i, /uploads\/.*_strapi/],
    },
  },
  {
    name: 'Prismic',
    categories: ['CMS'],
    patterns: {
      html: [/prismic\.io/, /cdn\.prismic\.io/],
      scriptSrc: [/prismic\.io/],
    },
  },
  {
    name: 'Ghost',
    categories: ['CMS'],
    patterns: {
      html: [/ghost\.org/, /ghost\/api/],
      meta: { generator: /Ghost/i },
    },
  },
  {
    name: 'Squarespace',
    categories: ['CMS'],
    patterns: {
      html: [/squarespace\.com/, /static\.squarespace\.com/],
      scriptSrc: [/squarespace\.com/],
    },
  },
  {
    name: 'Wix',
    categories: ['CMS'],
    patterns: {
      html: [/wix\.com/, /wixstatic\.com/, /static\.parastorage\.com/],
      scriptSrc: [/wix\.com/, /parastorage\.com/],
    },
  },
  {
    name: 'Webflow',
    categories: ['CMS'],
    patterns: {
      html: [/webflow\.com/, /uploads-ssl\.webflow\.com/],
      scriptSrc: [/webflow\.com/],
      meta: { generator: /Webflow/i },
    },
  },
  {
    name: 'TYPO3',
    categories: ['CMS'],
    patterns: {
      html: [/typo3\//, /typo3conf\//, /typo3temp\//],
      meta: { generator: /TYPO3/i },
      cookies: ['fe_typo_user'],
    },
  },
  {
    name: 'Kentico',
    categories: ['CMS'],
    patterns: {
      html: [/kentico/i, /CMSPages\//],
      meta: { generator: /Kentico/i },
    },
  },
  {
    name: 'Umbraco',
    categories: ['CMS'],
    patterns: {
      html: [/umbraco/i],
      meta: { generator: /Umbraco/i },
    },
  },
  {
    name: 'Storyblok',
    categories: ['CMS'],
    patterns: {
      html: [/storyblok\.com/, /a\.storyblok\.com/],
      scriptSrc: [/storyblok\.com/],
    },
  },
  {
    name: 'DatoCMS',
    categories: ['CMS'],
    patterns: {
      html: [/datocms-assets\.com/, /datocms\.com/],
    },
  },
  {
    name: 'Contentstack',
    categories: ['CMS'],
    patterns: {
      html: [/contentstack\.io/, /contentstack\.com/],
      scriptSrc: [/contentstack\.io/],
    },
  },
  {
    name: 'Bloomreach CMS',
    categories: ['CMS'],
    patterns: {
      html: [/bloomreach\.io/, /bloomreach\.com/, /brxm\.io/],
      scriptSrc: [/bloomreach/],
    },
  },
  {
    name: 'Magnolia',
    categories: ['CMS'],
    patterns: {
      html: [/magnolia/, /\.magnolia\//, /magnoliaPublic/],
    },
  },
  {
    name: 'Craft CMS',
    categories: ['CMS'],
    patterns: {
      html: [/craftcms\.com/],
      meta: { generator: /Craft CMS/i },
      headers: { 'x-powered-by': /Craft CMS/ },
    },
  },
  {
    name: 'HubSpot CMS',
    categories: ['CMS'],
    patterns: {
      html: [/hs-sites\.com/, /hubspot\.net\/hub\//],
      scriptSrc: [/js\.hubspot\.com/],
    },
  },
  {
    name: 'Sitefinity',
    categories: ['CMS'],
    patterns: {
      html: [/sitefinity/i, /Telerik\.Web/],
      meta: { generator: /Sitefinity/i },
    },
  },
  {
    name: 'Episerver / Optimizely CMS',
    categories: ['CMS'],
    patterns: {
      html: [/EPiServer/i, /episerver/i],
      meta: { generator: /EPiServer/i },
    },
  },
  {
    name: 'Contao',
    categories: ['CMS'],
    patterns: {
      html: [/contao/i, /system\/modules\//],
      meta: { generator: /Contao/i },
    },
  },
  {
    name: 'Agility CMS',
    categories: ['CMS'],
    patterns: {
      html: [/agilitycms\.com/],
    },
  },
  {
    name: 'Builder.io',
    categories: ['CMS'],
    patterns: {
      html: [/builder\.io/, /cdn\.builder\.io/],
      scriptSrc: [/builder\.io/],
    },
  },
  {
    name: 'Kontent.ai (Kentico Kontent)',
    categories: ['CMS'],
    patterns: {
      html: [/kontent\.ai/, /deliver\.kontent\.ai/],
    },
  },
  {
    name: 'Netlify CMS / Decap CMS',
    categories: ['CMS'],
    patterns: {
      html: [/netlify-cms/, /decapcms/],
      scriptSrc: [/netlify-cms/, /decapcms/],
    },
  },
  {
    name: 'Directus',
    categories: ['CMS'],
    patterns: {
      html: [/directus\.io/, /directus\.app/],
    },
  },
  {
    name: 'Payload CMS',
    categories: ['CMS'],
    patterns: {
      html: [/payloadcms\.com/],
    },
  },
  {
    name: 'Tridion',
    categories: ['CMS'],
    patterns: {
      html: [/tridion/i, /sdl\.com/],
    },
  },
  {
    name: 'CoreMedia',
    categories: ['CMS'],
    patterns: {
      html: [/coremedia/i, /\/blueprint\/servlet\//],
    },
  },
  {
    name: 'FirstSpirit',
    categories: ['CMS'],
    patterns: {
      html: [/firstspirit/i, /e-spirit\.com/],
    },
  },
  {
    name: 'Pimcore',
    categories: ['CMS'],
    patterns: {
      html: [/pimcore/i],
      headers: { 'x-powered-by': /pimcore/i },
    },
  },
  {
    name: 'Cockpit CMS',
    categories: ['CMS'],
    patterns: {
      html: [/getcockpit\.com/],
    },
  },
  {
    name: 'Butter CMS',
    categories: ['CMS'],
    patterns: {
      html: [/buttercms\.com/, /cdn\.buttercms\.com/],
    },
  },
  {
    name: 'Hygraph (GraphCMS)',
    categories: ['CMS'],
    patterns: {
      html: [/hygraph\.com/, /graphcms\.com/, /media\.graphassets\.com/],
    },
  },
  {
    name: 'Keystone.js',
    categories: ['CMS'],
    patterns: {
      html: [/keystonejs\.com/],
    },
  },
  {
    name: 'Plone',
    categories: ['CMS'],
    patterns: {
      html: [/plone/i, /portal_css/],
      meta: { generator: /Plone/i },
    },
  },
  {
    name: 'Neos CMS',
    categories: ['CMS'],
    patterns: {
      html: [/neos\.io/, /neos-nodetypes/],
      meta: { generator: /Neos/i },
    },
  },
  {
    name: 'ProcessWire',
    categories: ['CMS'],
    patterns: {
      html: [/processwire/i],
      meta: { generator: /ProcessWire/i },
    },
  },
  {
    name: 'Concrete CMS',
    categories: ['CMS'],
    patterns: {
      html: [/concrete5/, /concretecms/i],
      meta: { generator: /concrete/i },
    },
  },
  {
    name: 'Silverstripe',
    categories: ['CMS'],
    patterns: {
      html: [/silverstripe/i],
      meta: { generator: /SilverStripe/i },
    },
  },
  {
    name: 'October CMS',
    categories: ['CMS'],
    patterns: {
      html: [/octobercms/i],
    },
  },
  {
    name: 'Statamic',
    categories: ['CMS'],
    patterns: {
      html: [/statamic/i],
      meta: { generator: /Statamic/i },
    },
  },
  {
    name: 'Weebly',
    categories: ['CMS'],
    patterns: {
      html: [/weebly\.com/, /editmysite\.com/],
      scriptSrc: [/weebly\.com/],
    },
  },
  {
    name: 'Duda',
    categories: ['CMS'],
    patterns: {
      html: [/duda\.co/, /multiscreensite\.com/],
      scriptSrc: [/duda\.co/],
    },
  },
  {
    name: 'Framer',
    categories: ['CMS'],
    patterns: {
      html: [/framer\.com/, /framerusercontent\.com/],
      scriptSrc: [/framer\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  eCommerce  ██
  // ═══════════════════════════════════════════════════════
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
    name: 'Shopify',
    categories: ['eCommerce'],
    patterns: {
      html: [/cdn\.shopify\.com/, /shopify\.com/, /myshopify\.com/],
      scriptSrc: [/cdn\.shopify\.com/],
      cookies: ['_shopify_s', '_shopify_y', 'cart_sig'],
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
  {
    name: 'WooCommerce',
    categories: ['eCommerce'],
    patterns: {
      html: [/woocommerce/i, /wc-block/, /wc-cart/],
      scriptSrc: [/woocommerce/],
      cookies: ['woocommerce_cart_hash', 'woocommerce_items_in_cart'],
    },
  },
  {
    name: 'BigCommerce',
    categories: ['eCommerce'],
    patterns: {
      html: [/bigcommerce\.com/, /cdn11\.bigcommerce/],
      scriptSrc: [/bigcommerce\.com/],
      cookies: ['SHOP_SESSION_TOKEN'],
    },
  },
  {
    name: 'PrestaShop',
    categories: ['eCommerce'],
    patterns: {
      html: [/prestashop/i, /modules\/ps_/],
      meta: { generator: /PrestaShop/i },
      cookies: ['PrestaShop-'],
    },
  },
  {
    name: 'Shopware',
    categories: ['eCommerce'],
    patterns: {
      html: [/shopware/i, /shopware\.com/],
      scriptSrc: [/shopware/],
      cookies: ['shopware_'],
    },
  },
  {
    name: 'Commercetools',
    categories: ['eCommerce'],
    patterns: {
      html: [/commercetools\.com/],
      scriptSrc: [/commercetools/],
    },
  },
  {
    name: 'Spryker',
    categories: ['eCommerce'],
    patterns: {
      html: [/spryker/i],
    },
  },
  {
    name: 'VTEX',
    categories: ['eCommerce'],
    patterns: {
      html: [/vtex\.com/, /vteximg\.com/],
      scriptSrc: [/vtex\.com/],
      cookies: ['VtexIdclientAutCookie'],
    },
  },
  {
    name: 'Elastic Path',
    categories: ['eCommerce'],
    patterns: {
      html: [/elasticpath\.com/],
    },
  },
  {
    name: 'Oxid eShop',
    categories: ['eCommerce'],
    patterns: {
      html: [/oxid/i, /oxid-esales/],
    },
  },
  {
    name: 'Gambio',
    categories: ['eCommerce'],
    patterns: {
      html: [/gambio/i],
      meta: { generator: /Gambio/i },
    },
  },
  {
    name: 'JTL-Shop',
    categories: ['eCommerce'],
    patterns: {
      html: [/jtl-shop/i, /jtl-software/i],
    },
  },
  {
    name: 'Plentymarkets',
    categories: ['eCommerce'],
    patterns: {
      html: [/plentymarkets/i],
    },
  },
  {
    name: 'Saleor',
    categories: ['eCommerce'],
    patterns: {
      html: [/saleor\.io/],
    },
  },
  {
    name: 'Medusa',
    categories: ['eCommerce'],
    patterns: {
      html: [/medusajs\.com/],
    },
  },
  {
    name: 'Volusion',
    categories: ['eCommerce'],
    patterns: {
      html: [/volusion\.com/],
      scriptSrc: [/volusion\.com/],
    },
  },
  {
    name: 'Ecwid',
    categories: ['eCommerce'],
    patterns: {
      html: [/ecwid\.com/, /app\.ecwid\.com/],
      scriptSrc: [/ecwid\.com/],
    },
  },
  {
    name: 'Squarespace Commerce',
    categories: ['eCommerce'],
    patterns: {
      html: [/squarespace\.com.*commerce/],
    },
  },
  {
    name: 'OpenCart',
    categories: ['eCommerce'],
    patterns: {
      html: [/opencart/i, /catalog\/view/],
    },
  },
  {
    name: 'nopCommerce',
    categories: ['eCommerce'],
    patterns: {
      html: [/nopcommerce/i],
      meta: { generator: /nopCommerce/i },
    },
  },
  {
    name: 'Swell Commerce',
    categories: ['eCommerce'],
    patterns: {
      html: [/swell\.is/, /swell\.store/],
    },
  },
  {
    name: 'Nacelle',
    categories: ['eCommerce'],
    patterns: {
      html: [/nacelle\.com/],
    },
  },
  {
    name: 'Kibo Commerce',
    categories: ['eCommerce'],
    patterns: {
      html: [/kibocommerce\.com/, /mozu\.com/],
    },
  },
  {
    name: 'Salesforce B2B Commerce',
    categories: ['eCommerce'],
    patterns: {
      html: [/cloudcraze/i, /b2b-commerce/],
    },
  },
  {
    name: 'Wix eCommerce',
    categories: ['eCommerce'],
    patterns: {
      html: [/wixstores/i, /wix\.com.*stores/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  DMP  ██
  // ═══════════════════════════════════════════════════════
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
  {
    name: 'Permutive',
    categories: ['DMP', 'Advertising'],
    patterns: {
      scriptSrc: [/permutive\.com/],
      cookies: ['_permutive'],
    },
  },
  {
    name: 'LiveRamp',
    categories: ['DMP', 'Advertising'],
    patterns: {
      scriptSrc: [/rlcdn\.com/, /liveramp\.com/],
      cookies: ['_lr_', 'lr_env'],
    },
  },
  {
    name: 'Eyeota',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/eyeota\.com/],
    },
  },
  {
    name: 'Oracle Data Cloud',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/addthis\.com/, /oracleinfinity\.io/],
      cookies: ['oracleinfinity'],
    },
  },
  {
    name: 'Nielsen DMP',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/imrworldwide\.com/, /nielsen\.com/],
      cookies: ['IMRID'],
    },
  },
  {
    name: 'Salesforce DMP (Krux)',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/krux\.net/, /krxd\.net/],
      cookies: ['_kuid_'],
    },
  },
  {
    name: 'Neustar (TransUnion)',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/agkn\.com/, /neustar\.biz/],
    },
  },
  {
    name: 'Weborama',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/weborama\.com/, /weborama\.fr/],
    },
  },
  {
    name: 'ID5',
    categories: ['DMP'],
    patterns: {
      scriptSrc: [/id5-sync\.com/],
      cookies: ['id5_'],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  CDP  ██
  // ═══════════════════════════════════════════════════════
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
    categories: ['CDP', 'Analytics', 'Tag Management'],
    patterns: {
      scriptSrc: [/cdn\.segment\.com/, /cdn\.segment\.io/, /segment\.com/],
      html: [/analytics\.identify/, /analytics\.track/],
      cookies: ['_sctr', '_scid'],
    },
  },
  {
    name: 'Tealium AudienceStream',
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
  {
    name: 'Treasure Data',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/treasuredata\.com/, /td\.js/],
      cookies: ['_td'],
    },
  },
  {
    name: 'Rudderstack',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/rudderstack\.com/, /cdn\.rudderlabs\.com/],
    },
  },
  {
    name: 'Lytics',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/lytics\.io/],
      cookies: ['seerid'],
    },
  },
  {
    name: 'Bloomreach Engagement (Exponea)',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/exponea\.com/, /bloomreach\.com/],
      cookies: ['__exponea'],
    },
  },
  {
    name: 'ActionIQ',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/actioniq\.com/],
    },
  },
  {
    name: 'Zeotap',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/zeotap\.com/],
    },
  },
  {
    name: 'BlueConic',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/blueconic\.net/, /blueconic\.com/],
      cookies: ['_bc_'],
    },
  },
  {
    name: 'Amperity',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/amperity\.com/],
    },
  },
  {
    name: 'Simon Data',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/simondata\.com/],
    },
  },
  {
    name: 'Hightouch',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/hightouch\.io/, /hightouch\.com/],
    },
  },
  {
    name: 'Census',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/getcensus\.com/],
    },
  },
  {
    name: 'Optimove',
    categories: ['CDP', 'ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/optimove\.net/, /optimove\.com/],
      cookies: ['optimove_'],
    },
  },
  {
    name: 'Twilio Engage',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/twilio\.com.*segment/],
    },
  },
  {
    name: 'Insider CDP',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/useinsider\.com/],
      cookies: ['ins_'],
    },
  },
  {
    name: 'Mixpanel CDP',
    categories: ['CDP'],
    patterns: {
      scriptSrc: [/mixpanel\.com/],
      cookies: ['mp_'],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Analytics  ██
  // ═══════════════════════════════════════════════════════
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
  {
    name: 'Adobe Customer Journey Analytics',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/adobedc\.net/],
      html: [/cja\.adobe\.com/],
    },
  },
  {
    name: 'Google Analytics (Universal)',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/google-analytics\.com\/analytics\.js/],
      html: [/UA-\d+-\d+/],
      cookies: ['_ga', '_gid', '_gat'],
    },
  },
  {
    name: 'Google Analytics 4',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/googletagmanager\.com\/gtag/],
      html: [/G-[A-Z0-9]+/, /gtag\(.*config/],
      cookies: ['_ga_'],
    },
  },
  {
    name: 'Mixpanel',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/mixpanel\.com/, /cdn\.mxpnl\.com/],
      cookies: ['mp_'],
    },
  },
  {
    name: 'Hotjar',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/hotjar\.com/, /static\.hotjar\.com/],
      cookies: ['_hjSessionUser_', '_hjSession_', '_hjAbsoluteSessionInProgress'],
    },
  },
  {
    name: 'Heap',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/heap\.io/, /heapanalytics\.com/],
      cookies: ['_hp2_'],
    },
  },
  {
    name: 'FullStory',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/fullstory\.com/, /fullstory\.com\/s\/fs\.js/],
      cookies: ['_fs_'],
    },
  },
  {
    name: 'Amplitude',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/amplitude\.com/, /cdn\.amplitude\.com/],
      cookies: ['amp_'],
    },
  },
  {
    name: 'Piwik / Matomo',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/matomo/, /piwik/],
      cookies: ['_pk_'],
    },
  },
  {
    name: 'Plausible',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/plausible\.io/],
    },
  },
  {
    name: 'Fathom',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/usefathom\.com/, /cdn\.usefathom\.com/],
    },
  },
  {
    name: 'Simple Analytics',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/simpleanalytics\.com/],
    },
  },
  {
    name: 'Umami',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/umami\.is/],
      html: [/data-website-id/],
    },
  },
  {
    name: 'GoatCounter',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/goatcounter\.com/],
    },
  },
  {
    name: 'Countly',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/countly/],
      cookies: ['cly_'],
    },
  },
  {
    name: 'Chartbeat',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/chartbeat\.com/, /static\.chartbeat\.com/],
      cookies: ['_cb', '_chartbeat'],
    },
  },
  {
    name: 'Comscore',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/scorecardresearch\.com/, /comscore\.com/],
      cookies: ['_comscore'],
    },
  },
  {
    name: 'Snowplow',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/snowplow/, /sp\.js/],
      cookies: ['_sp_'],
    },
  },
  {
    name: 'PostHog',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/posthog\.com/, /app\.posthog\.com/],
      cookies: ['ph_'],
    },
  },
  {
    name: 'Kissmetrics',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/kissmetrics\.com/, /i\.kissmetrics\.com/],
      cookies: ['km_'],
    },
  },
  {
    name: 'Woopra',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/woopra\.com/],
      cookies: ['wooTracker'],
    },
  },
  {
    name: 'Clicky',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/static\.getclicky\.com/],
      cookies: ['_clicky'],
    },
  },
  {
    name: 'Yandex Metrica',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/mc\.yandex\.ru/, /metrika/],
      cookies: ['_ym_'],
    },
  },
  {
    name: 'Baidu Analytics',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/hm\.baidu\.com/],
      cookies: ['Hm_lvt_', 'Hm_lpvt_'],
    },
  },
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
      cookies: ['_lo_uid', '_lo_rid'],
    },
  },
  {
    name: 'LogRocket',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/logrocket\.com/, /cdn\.logrocket\.io/],
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
      scriptSrc: [/pendo\.io/, /cdn\.pendo\.io/],
      cookies: ['_pendo_'],
    },
  },
  {
    name: 'Gainsight PX',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/gainsight\.com/, /aptrinsic\.com/],
      cookies: ['_gs_'],
    },
  },
  {
    name: 'Crazy Egg',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/crazyegg\.com/],
      cookies: ['_ceir', 'is_returning'],
    },
  },
  {
    name: 'Contentsquare',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/contentsquare\.net/, /contentsquare\.com/],
      cookies: ['_cs_'],
    },
  },
  {
    name: 'Quantum Metric',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/quantummetric\.com/],
      cookies: ['QuantumMetric'],
    },
  },
  {
    name: 'Medallia / Decibel',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/medallia\.com/, /decibelinsight\.net/, /kampyle\.com/],
      cookies: ['_mdig', 'da_lid'],
    },
  },
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
    categories: ['Analytics', 'Forms'],
    patterns: {
      scriptSrc: [/typeform\.com/],
      cookies: ['_tf_'],
    },
  },
  {
    name: 'Piano Analytics (AT Internet)',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/tag\.aticdn\.net/, /piano\.io/],
      cookies: ['_pcid', 'atuserid'],
    },
  },
  {
    name: 'etracker',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/etracker\.com/, /etracker\.de/],
      cookies: ['et_'],
    },
  },
  {
    name: 'Webtrekk / Mapp Intelligence',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/webtrekk\.net/, /mapp\.com/, /wt-eu02\.net/],
      cookies: ['wt_'],
    },
  },
  {
    name: 'Econda',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/econda/],
      cookies: ['emos_'],
    },
  },
  {
    name: 'INFOnline / IVW',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/ioam\.de/, /iocnt\.net/],
    },
  },
  {
    name: 'Indicative',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/indicative\.com/],
    },
  },
  {
    name: 'Keen IO',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/keen\.io/],
    },
  },
  {
    name: 'Oribi',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/oribi\.io/],
    },
  },
  {
    name: 'Pirsch',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/pirsch\.io/],
    },
  },
  {
    name: 'Splitbee',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/splitbee\.io/],
    },
  },
  {
    name: 'Cabin Analytics',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/withcabin\.com/],
    },
  },
  {
    name: 'Panelbear / Cronitor',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/panelbear\.com/, /cronitor\.io/],
    },
  },
  {
    name: 'Open Web Analytics',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/openwebanalytics/],
      cookies: ['owa_'],
    },
  },
  {
    name: 'StatCounter',
    categories: ['Analytics'],
    patterns: {
      scriptSrc: [/statcounter\.com/],
      cookies: ['is_unique'],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Personalization & Optimization  ██
  // ═══════════════════════════════════════════════════════
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
      scriptSrc: [/cdn\.optimizely\.com/, /optimizely\.com/],
      cookies: ['optimizelyEndUserId'],
    },
  },
  {
    name: 'VWO',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/dev\.visualwebsiteoptimizer\.com/, /vwo_code/, /vwo\.com/],
      cookies: ['_vwo'],
    },
  },
  {
    name: 'Dynamic Yield',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/dynamicyield\.com/, /dy-api/],
      cookies: ['_dy_'],
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
    name: 'Algonomy (RichRelevance)',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/richrelevance\.com/, /algonomy\.com/],
      cookies: ['rrSession'],
    },
  },
  {
    name: 'Nosto',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/nosto\.com/, /connect\.nosto\.com/],
      cookies: ['_nosto'],
    },
  },
  {
    name: 'Coveo',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/coveo\.com/, /platform\.cloud\.coveo\.com/],
      cookies: ['coveo_'],
    },
  },
  {
    name: 'Qubit',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/qubit\.com/],
      cookies: ['_qubitTracker'],
    },
  },
  {
    name: 'Evergage / Salesforce Interaction Studio',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/evergage\.com/],
      cookies: ['_evga_'],
    },
  },
  {
    name: 'Certona',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/certona\.net/, /res-x\.com/],
    },
  },
  {
    name: 'Insider',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/useinsider\.com/, /insnw\.net/],
      cookies: ['ins_'],
    },
  },
  {
    name: 'Convert',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/convert\.com/],
      cookies: ['_conv_'],
    },
  },
  {
    name: 'Google Optimize',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/optimize\.google\.com/],
      cookies: ['_gaexp'],
    },
  },
  {
    name: 'LaunchDarkly',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/launchdarkly\.com/],
      cookies: ['ld_'],
    },
  },
  {
    name: 'Split.io',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/split\.io/],
    },
  },
  {
    name: 'Flagsmith',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/flagsmith\.com/],
    },
  },
  {
    name: 'ConfigCat',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/configcat\.com/],
    },
  },
  {
    name: 'Statsig',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/statsig\.com/],
    },
  },
  {
    name: 'GrowthBook',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/growthbook\.io/],
    },
  },
  {
    name: 'Unleash',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/getunleash\.io/],
    },
  },
  {
    name: 'Conductrics',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/conductrics\.com/],
    },
  },
  {
    name: 'SiteSpect',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/sitespect\.com/],
    },
  },
  {
    name: 'Emarsys Personalization',
    categories: ['Personalization & Optimization'],
    patterns: {
      scriptSrc: [/emarsys\.com/, /scarab\.js/],
      cookies: ['scarab.'],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  DAM  ██
  // ═══════════════════════════════════════════════════════
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
      html: [/bynder\.com/],
      scriptSrc: [/bynder\.com/],
    },
  },
  {
    name: 'Canto',
    categories: ['DAM'],
    patterns: {
      html: [/canto\.com/, /cantoglobal/],
    },
  },
  {
    name: 'Cloudinary',
    categories: ['DAM'],
    patterns: {
      html: [/res\.cloudinary\.com/],
      scriptSrc: [/cloudinary\.com/],
    },
  },
  {
    name: 'Imgix',
    categories: ['DAM'],
    patterns: {
      html: [/\.imgix\.net/],
    },
  },
  {
    name: 'Widen',
    categories: ['DAM'],
    patterns: {
      html: [/widen\.net/, /widen\.com/],
    },
  },
  {
    name: 'Aprimo',
    categories: ['DAM'],
    patterns: {
      html: [/aprimo\.com/],
    },
  },
  {
    name: 'Brandfolder',
    categories: ['DAM'],
    patterns: {
      html: [/brandfolder\.com/],
    },
  },
  {
    name: 'MediaValet',
    categories: ['DAM'],
    patterns: {
      html: [/mediavalet\.com/],
    },
  },
  {
    name: 'Frontify',
    categories: ['DAM'],
    patterns: {
      html: [/frontify\.com/],
    },
  },
  {
    name: 'Celum',
    categories: ['DAM'],
    patterns: {
      html: [/celum\.com/],
    },
  },
  {
    name: 'Picturepark',
    categories: ['DAM'],
    patterns: {
      html: [/picturepark\.com/],
    },
  },
  {
    name: 'Filerobot (Scaleflex)',
    categories: ['DAM'],
    patterns: {
      html: [/filerobot\.com/, /scaleflex\.com/],
      scriptSrc: [/filerobot\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  CRM  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Salesforce',
    categories: ['CRM'],
    patterns: {
      html: [/force\.com/, /salesforce\.com/, /lightning\.force\.com/],
      scriptSrc: [/force\.com/],
    },
  },
  {
    name: 'Microsoft Dynamics 365',
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
  {
    name: 'Zoho CRM',
    categories: ['CRM'],
    patterns: {
      html: [/zoho\.com/, /zohocdn\.com/],
      scriptSrc: [/zoho\.com/],
      cookies: ['ZCAMPAIGN_CSRF_TOKEN'],
    },
  },
  {
    name: 'Pipedrive',
    categories: ['CRM'],
    patterns: {
      scriptSrc: [/pipedrive\.com/],
    },
  },
  {
    name: 'Freshsales',
    categories: ['CRM'],
    patterns: {
      scriptSrc: [/freshsales\.io/],
    },
  },
  {
    name: 'SugarCRM',
    categories: ['CRM'],
    patterns: {
      html: [/sugarcrm/i],
    },
  },
  {
    name: 'SAP CRM',
    categories: ['CRM'],
    patterns: {
      html: [/sap\.com.*crm/i],
    },
  },
  {
    name: 'Oracle CX Sales (Siebel)',
    categories: ['CRM'],
    patterns: {
      html: [/siebel/i],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  ESP / Marketing Automation  ██
  // ═══════════════════════════════════════════════════════
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
    name: 'Adobe Journey Optimizer',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/adobedc\.net/],
      html: [/journey-optimizer/, /ajo\.adobe/],
    },
  },
  {
    name: 'Adobe Campaign',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      html: [/adobecampaign/, /neolane/i],
      cookies: ['nllastdelid'],
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
      cookies: ['_pardot'],
    },
  },
  {
    name: 'Klaviyo',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/klaviyo\.com/, /static\.klaviyo/],
      cookies: ['__kla'],
    },
  },
  {
    name: 'HubSpot Marketing',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/hubspot\.com/, /js\.hs-scripts\.com/],
      cookies: ['_hssc', '_hssrc', 'hubspotutk'],
    },
  },
  {
    name: 'Braze',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/braze\.com/, /sdk\.iad-\d+\.braze\.com/],
      cookies: ['_ab'],
    },
  },
  {
    name: 'ActiveCampaign',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/activehosted\.com/, /activecampaign\.com/],
      cookies: ['_ac_'],
    },
  },
  {
    name: 'Mailchimp',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/mailchimp\.com/, /chimpstatic\.com/],
      cookies: ['_mc'],
    },
  },
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
      scriptSrc: [/customer\.io/, /customerioforms\.com/],
      cookies: ['cio_'],
    },
  },
  {
    name: 'Brevo (Sendinblue)',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/sendinblue\.com/, /brevo\.com/],
      cookies: ['sib_'],
    },
  },
  {
    name: 'ConvertKit (Kit)',
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
      scriptSrc: [/drip\.com/, /getdrip\.com/],
      cookies: ['_drip_'],
    },
  },
  {
    name: 'Emarsys',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/emarsys\.com/],
    },
  },
  {
    name: 'Dotdigital',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/dotdigital\.com/, /dmpt\.co/],
      cookies: ['dm_'],
    },
  },
  {
    name: 'Listrak',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/listrak\.com/],
      cookies: ['_ltk'],
    },
  },
  {
    name: 'Sailthru',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/sailthru\.com/],
      cookies: ['sailthru_'],
    },
  },
  {
    name: 'Responsys',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/responsys\.net/],
      cookies: ['_ri_'],
    },
  },
  {
    name: 'Selligent',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/selligent\.com/],
    },
  },
  {
    name: 'Omnisend',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/omnisend\.com/, /omnisnippet/],
      cookies: ['omnisend'],
    },
  },
  {
    name: 'Ortto (Autopilot)',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/autopilotapp\.com/, /ortto\.com/],
      cookies: ['_ap_'],
    },
  },
  {
    name: 'Acoustic (Silverpop)',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/acoustic\.com/, /silverpop\.com/],
    },
  },
  {
    name: 'Constant Contact',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/constantcontact\.com/],
      cookies: ['_ctct_'],
    },
  },
  {
    name: 'Campaign Monitor',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/createsend\.com/, /campaignmonitor\.com/],
    },
  },
  {
    name: 'GetResponse',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/getresponse\.com/],
      cookies: ['_gr_'],
    },
  },
  {
    name: 'AWeber',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/aweber\.com/],
    },
  },
  {
    name: 'SendGrid',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      html: [/sendgrid\.net/],
    },
  },
  {
    name: 'Ometria',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/ometria\.com/],
      cookies: ['_ometria'],
    },
  },
  {
    name: 'Maropost',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/maropost\.com/],
    },
  },
  {
    name: 'MoEngage',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/moengage\.com/],
      cookies: ['moe_'],
    },
  },
  {
    name: 'CleverTap',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/clevertap\.com/, /clevertap-prod\.com/],
      cookies: ['WZRK_'],
    },
  },
  {
    name: 'WebEngage',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/webengage\.com/],
      cookies: ['_webengage'],
    },
  },
  {
    name: 'Pushwoosh',
    categories: ['ESP/Marketing Automation', 'Push Notifications'],
    patterns: {
      scriptSrc: [/pushwoosh\.com/],
    },
  },
  {
    name: 'OneSignal',
    categories: ['ESP/Marketing Automation', 'Push Notifications'],
    patterns: {
      scriptSrc: [/onesignal\.com/],
      cookies: ['onesignal'],
    },
  },
  {
    name: 'Airship',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/urbanairship\.com/, /airship\.com/],
    },
  },
  {
    name: 'Leanplum',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/leanplum\.com/],
    },
  },
  {
    name: 'Cordial',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/cordial\.com/],
    },
  },
  {
    name: 'Attentive',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/attentivemobile\.com/, /attn\.tv/],
      cookies: ['__attentive_'],
    },
  },
  {
    name: 'Postscript',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/postscript\.io/],
    },
  },
  {
    name: 'Yotpo SMS',
    categories: ['ESP/Marketing Automation'],
    patterns: {
      scriptSrc: [/smsbump\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Tag Management  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Adobe Experience Platform Tags (Launch)',
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
      scriptSrc: [/googletagmanager\.com\/gtm\.js/],
      html: [/GTM-[A-Z0-9]+/],
    },
  },
  {
    name: 'Tealium iQ',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/tiqcdn\.com/, /tealium\.com/],
      html: [/utag\.js/, /tealium/i],
      cookies: ['utag_main', 'utag_env'],
    },
  },
  {
    name: 'Ensighten',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/ensighten\.com/],
      cookies: ['Bootstrapper'],
    },
  },
  {
    name: 'Signal (BrightTag)',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/btstatic\.com/, /signal\.co/],
    },
  },
  {
    name: 'Commanders Act (TagCommander)',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/tagcommander\.com/, /commandersact\.com/],
      cookies: ['tc_'],
    },
  },
  {
    name: 'Piwik Pro Tag Manager',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/piwik\.pro\/tag/],
    },
  },
  {
    name: 'Qubit (now Coveo)',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/qubit\.com/, /d3c3cq33003psk\.cloudfront\.net/],
    },
  },
  {
    name: 'Matomo Tag Manager',
    categories: ['Tag Management'],
    patterns: {
      scriptSrc: [/matomo.*container/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Consent / CMP  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Cookiebot',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/consent\.cookiebot\.com/],
      cookies: ['CookieConsent'],
    },
  },
  {
    name: 'OneTrust',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/onetrust\.com/, /optanon/],
      cookies: ['OptanonAlertBoxConsent', 'OptanonConsent'],
    },
  },
  {
    name: 'Usercentrics',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/usercentrics\.com/, /usercentrics\.eu/],
      cookies: ['uc_'],
    },
  },
  {
    name: 'Sourcepoint',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/sourcepoint\.com/],
      cookies: ['_sp_'],
    },
  },
  {
    name: 'Didomi',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/didomi\.io/],
      cookies: ['didomi_token'],
    },
  },
  {
    name: 'TrustArc',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/trustarc\.com/],
      cookies: ['notice_'],
    },
  },
  {
    name: 'Iubenda',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/iubenda\.com/],
      cookies: ['_iub_'],
    },
  },
  {
    name: 'CookieYes',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/cookieyes\.com/],
      cookies: ['cookieyes-consent'],
    },
  },
  {
    name: 'Quantcast Choice',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/quantcast\.com\/choice/],
      cookies: ['_dpm_'],
    },
  },
  {
    name: 'Cookie Information',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/cookieinformation\.com/],
      cookies: ['CookieInformationConsent'],
    },
  },
  {
    name: 'Complianz',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/complianz/],
      cookies: ['cmplz_'],
    },
  },
  {
    name: 'Osano',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/osano\.com/],
      cookies: ['osano_'],
    },
  },
  {
    name: 'Consentmanager.net',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/consentmanager\.net/],
      cookies: ['cmpro'],
    },
  },
  {
    name: 'Klaro',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/klaro/],
      cookies: ['klaro'],
    },
  },
  {
    name: 'Termly',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/termly\.io/],
    },
  },
  {
    name: 'CookieScript',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/cookie-script\.com/],
      cookies: ['CookieScriptConsent'],
    },
  },
  {
    name: 'CookieFirst',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/cookiefirst\.com/],
      cookies: ['cookiefirst'],
    },
  },
  {
    name: 'Borlabs Cookie',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/borlabs/],
      cookies: ['borlabs-cookie'],
    },
  },
  {
    name: 'Civic Cookie Control',
    categories: ['Consent Management'],
    patterns: {
      scriptSrc: [/civiccomputing\.com/],
      cookies: ['CookieControl'],
    },
  },
  {
    name: 'GDPR Cookie Compliance',
    categories: ['Consent Management'],
    patterns: {
      cookies: ['moove_gdpr_popup'],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Advertising / Ad Tech  ██
  // ═══════════════════════════════════════════════════════
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
    name: 'Google Ads',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/googleads\.g\.doubleclick\.net/, /pagead2\.googlesyndication/],
      cookies: ['_gcl_au', '_gcl_dc', '_gac_'],
    },
  },
  {
    name: 'Google Ad Manager (DFP / DoubleClick)',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/securepubads\.g\.doubleclick\.net/],
      html: [/googletag/, /gpt\.js/],
    },
  },
  {
    name: 'Google AdSense',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/pagead2\.googlesyndication\.com/],
      html: [/adsbygoogle/],
    },
  },
  {
    name: 'Facebook / Meta Pixel',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/connect\.facebook\.net/],
      html: [/fbq\(/, /facebook\.com\/tr/],
      cookies: ['_fbp', '_fbc'],
    },
  },
  {
    name: 'Meta Conversions API',
    categories: ['Advertising'],
    patterns: {
      html: [/graph\.facebook\.com.*events/],
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
    name: 'Twitter / X Pixel',
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
      cookies: ['tt_chain_token'],
    },
  },
  {
    name: 'Pinterest Tag',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/pintrk/, /ct\.pinterest\.com/],
      cookies: ['_pinterest_sess'],
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
    name: 'Reddit Pixel',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/alb\.reddit\.com/, /reddit\.com\/static\/ads/],
      cookies: ['_rdt_uuid'],
    },
  },
  {
    name: 'Quora Pixel',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/quora\.com\/_\/ad/],
      cookies: ['_qca'],
    },
  },
  {
    name: 'Microsoft Advertising (Bing UET)',
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
  {
    name: 'Criteo',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/criteo\.net/, /criteo\.com/],
      cookies: ['cto_bid', 'cto_bundle'],
    },
  },
  {
    name: 'Taboola',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/taboola\.com/, /cdn\.taboola\.com/],
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
    name: 'Adform',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/adform\.net/],
      cookies: ['TPC', 'GCM'],
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
    name: 'DoubleVerify',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/doubleverify\.com/, /dvtag\.com/],
    },
  },
  {
    name: 'IAS (Integral Ad Science)',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/adsafeprotected\.com/, /iasds01\.com/],
    },
  },
  {
    name: 'MOAT (Oracle)',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/moatads\.com/],
    },
  },
  {
    name: 'Flashtalking',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/flashtalking\.com/],
    },
  },
  {
    name: 'Sizmek',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/sizmek\.com/],
    },
  },
  {
    name: 'Yahoo Advertising',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/ads\.yahoo\.com/, /verizonmedia\.com/],
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
    },
  },
  {
    name: 'TripleLift',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/triplelift\.com/],
    },
  },
  {
    name: 'Sharethrough',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/sharethrough\.com/],
    },
  },
  {
    name: 'Nativo',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/nativo\.com/],
    },
  },
  {
    name: 'Media.net',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/media\.net/],
    },
  },
  {
    name: 'Index Exchange',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/indexww\.com/, /indexexchange\.com/],
    },
  },
  {
    name: 'PubMatic',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/pubmatic\.com/],
    },
  },
  {
    name: 'OpenX',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/openx\.net/],
    },
  },
  {
    name: 'AppNexus / Xandr',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/adnxs\.com/, /appnexus\.com/],
    },
  },
  {
    name: 'Magnite (Rubicon)',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/rubiconproject\.com/, /magnite\.com/],
    },
  },
  {
    name: 'Teads',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/teads\.tv/],
    },
  },
  {
    name: 'Smart AdServer (Equativ)',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/smartadserver\.com/],
    },
  },
  {
    name: 'Sovrn',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/sovrn\.com/, /lijit\.com/],
    },
  },
  {
    name: 'GumGum',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/gumgum\.com/],
    },
  },
  {
    name: 'Yieldmo',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/yieldmo\.com/],
    },
  },
  {
    name: 'Amazon Publisher Services',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/aps\.amazon\.com/, /c\.amazon-adsystem\.com\/aax2/],
    },
  },
  {
    name: 'Prebid.js',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/prebid/],
      html: [/pbjs\.que/, /pbjs\.setConfig/],
    },
  },
  {
    name: 'Google Publisher Tag (GPT)',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/securepubads\.g\.doubleclick\.net\/tag\/js\/gpt\.js/],
      html: [/googletag\.pubads/],
    },
  },
  {
    name: 'Quantcast',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/quantserve\.com/],
      cookies: ['__qca'],
    },
  },
  {
    name: 'Kevel (Adzerk)',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/adzerk\.net/, /kevel\.co/],
    },
  },
  {
    name: 'Carbon Ads',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/carbonads\.com/, /cdn\.carbonads\.com/],
    },
  },
  {
    name: 'BuySellAds',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/buysellads\.com/],
    },
  },
  {
    name: 'Conversant',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/conversant\.com/, /dotomi\.com/],
    },
  },
  {
    name: 'SpotX / Magnite Video',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/spotxchange\.com/, /spotx\.tv/],
    },
  },
  {
    name: 'Verizon Media / Oath',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/oath\.com/, /adtech\.advertising\.com/],
    },
  },
  {
    name: 'Lotame Panorama ID',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/lotame\.com.*panorama/],
    },
  },
  {
    name: 'Unified ID 2.0',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/prod\.uidapi\.com/, /unifiedid/],
    },
  },

  // ── Affiliate Marketing ──────────────────────────────
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
      cookies: ['cjevent'],
    },
  },
  {
    name: 'ShareASale',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/shareasale\.com/],
      cookies: ['__ss'],
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
  {
    name: 'Rakuten Advertising',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/rakuten\.com/, /linksynergy\.com/],
    },
  },
  {
    name: 'Tradedoubler',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/tradedoubler\.com/],
      cookies: ['TD_'],
    },
  },
  {
    name: 'Partnerize',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/partnerize\.com/, /prf\.hn/],
    },
  },
  {
    name: 'Admitad',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/admitad\.com/],
    },
  },
  {
    name: 'PartnerStack',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/partnerstack\.com/],
    },
  },
  {
    name: 'Refersion',
    categories: ['Advertising'],
    patterns: {
      scriptSrc: [/refersion\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Customer Support / Chat  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Intercom',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/intercom\.io/, /intercomcdn\.com/],
      cookies: ['intercom-'],
    },
  },
  {
    name: 'Drift',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/drift\.com/, /js\.driftt\.com/],
      cookies: ['_drift'],
    },
  },
  {
    name: 'Zendesk',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/zendesk\.com/, /zdassets\.com/],
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
  {
    name: 'Freshdesk / Freshchat',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/freshdesk\.com/, /freshchat\.com/, /wchat\.freshchat\.com/],
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
      scriptSrc: [/tawk\.to/, /embed\.tawk\.to/],
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
  {
    name: 'UserVoice',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/uservoice\.com/],
      cookies: ['uv_'],
    },
  },
  {
    name: 'Salesforce Live Agent / Messaging',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/liveagent\.salesforce/, /salesforceliveagent\.com/],
    },
  },
  {
    name: 'Genesys',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/genesys\.com/, /mypurecloud\.com/],
    },
  },
  {
    name: 'Chatwoot',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/chatwoot\.com/],
    },
  },
  {
    name: 'HelpScout Beacon',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/helpscout\.net/, /beacon-v2\.helpscout\.net/],
    },
  },
  {
    name: 'Ada',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/ada\.support/],
    },
  },
  {
    name: 'Gorgias',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/gorgias\.chat/, /gorgias\.io/],
    },
  },
  {
    name: 'LivePerson',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/liveperson\.net/, /lpcdn\.net/],
    },
  },
  {
    name: 'Kustomer',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/kustomerapp\.com/],
    },
  },
  {
    name: 'Gladly',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/gladly\.com/],
    },
  },
  {
    name: 'Dixa',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/dixa\.io/],
    },
  },
  {
    name: 'Front',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/frontapp\.com/],
    },
  },
  {
    name: 'Kommunicate',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/kommunicate\.io/],
    },
  },
  {
    name: 'Freshworks (Neo)',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/freshworks\.com/],
    },
  },
  {
    name: 'Kayako',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/kayako\.com/],
    },
  },
  {
    name: 'Userlike',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/userlike\.com/],
    },
  },
  {
    name: 'Botpress',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/botpress\.com/, /cdn\.botpress\.cloud/],
    },
  },
  {
    name: 'Voiceflow',
    categories: ['Customer Support'],
    patterns: {
      scriptSrc: [/voiceflow\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Search  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Algolia',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/algolia\.net/, /algoliasearch/, /algolia\.com/],
      html: [/algolia/i],
    },
  },
  {
    name: 'Elasticsearch',
    categories: ['Search'],
    patterns: {
      html: [/elasticsearch/i],
    },
  },
  {
    name: 'Coveo Search',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/coveo\.com/],
    },
  },
  {
    name: 'Bloomreach Discovery',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/brcdn\.com/],
    },
  },
  {
    name: 'Constructor.io',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/constructor\.io/],
    },
  },
  {
    name: 'Searchspring',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/searchspring\.net/],
    },
  },
  {
    name: 'Klevu',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/klevu\.com/],
    },
  },
  {
    name: 'Swiftype',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/swiftype\.com/],
    },
  },
  {
    name: 'Doofinder',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/doofinder\.com/],
    },
  },
  {
    name: 'Attraqt / Crownpeak',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/attraqt\.com/, /crownpeak\.com/],
    },
  },
  {
    name: 'Typesense',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/typesense/],
    },
  },
  {
    name: 'MeiliSearch',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/meilisearch/],
    },
  },
  {
    name: 'Lucidworks / Fusion',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/lucidworks\.com/],
    },
  },
  {
    name: 'Yext',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/yext\.com/, /yextpages\.net/],
    },
  },
  {
    name: 'Sajari',
    categories: ['Search'],
    patterns: {
      scriptSrc: [/sajari\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Social & UGC / Reviews  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Facebook SDK',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/connect\.facebook\.net\/.*sdk/],
      html: [/fb-root/, /facebook\.com\/plugins/],
    },
  },
  {
    name: 'Twitter / X Widgets',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/platform\.twitter\.com/],
      html: [/twitter-timeline/],
    },
  },
  {
    name: 'Instagram Embed',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/instagram\.com\/embed/],
      html: [/instagram-media/],
    },
  },
  {
    name: 'YouTube Embed',
    categories: ['Social'],
    patterns: {
      html: [/youtube\.com\/embed/, /youtube-nocookie\.com\/embed/],
    },
  },
  {
    name: 'Vimeo Embed',
    categories: ['Social'],
    patterns: {
      html: [/player\.vimeo\.com/],
      scriptSrc: [/vimeo\.com/],
    },
  },
  {
    name: 'Bazaarvoice',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/bazaarvoice\.com/, /bvapi\.com/],
      cookies: ['BVBRANDID', 'BVSID'],
    },
  },
  {
    name: 'Yotpo',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/yotpo\.com/],
      html: [/yotpo-widget/],
    },
  },
  {
    name: 'Trustpilot',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/trustpilot\.com/, /widget\.trustpilot\.com/],
      html: [/trustpilot-widget/],
    },
  },
  {
    name: 'Feefo',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/feefo\.com/],
    },
  },
  {
    name: 'PowerReviews',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/powerreviews\.com/],
    },
  },
  {
    name: 'Disqus',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/disqus\.com/],
      html: [/disqus_thread/],
    },
  },
  {
    name: 'AddThis',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/addthis\.com/],
      cookies: ['__atuvc'],
    },
  },
  {
    name: 'ShareThis',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/sharethis\.com/],
      cookies: ['__sharethis_'],
    },
  },
  {
    name: 'Stamped.io',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/stamped\.io/],
    },
  },
  {
    name: 'Judge.me',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/judge\.me/],
    },
  },
  {
    name: 'Loox',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/loox\.io/],
    },
  },
  {
    name: 'Okendo',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/okendo\.io/],
    },
  },
  {
    name: 'Reviews.io',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/reviews\.io/],
    },
  },
  {
    name: 'Ekomi',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/ekomi\.com/],
    },
  },
  {
    name: 'Trusted Shops',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/trustedshops\.com/],
      cookies: ['trustedshops_'],
    },
  },
  {
    name: 'ProvenExpert',
    categories: ['Social'],
    patterns: {
      scriptSrc: [/provenexpert\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Payments  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Stripe',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/js\.stripe\.com/],
      html: [/stripe\.com/],
    },
  },
  {
    name: 'PayPal',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/paypal\.com/, /paypalobjects\.com/],
      html: [/paypal\.com/],
    },
  },
  {
    name: 'Adyen',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/adyen\.com/],
      html: [/adyen/i],
    },
  },
  {
    name: 'Braintree',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/braintree-api\.com/, /braintreegateway\.com/],
    },
  },
  {
    name: 'Square',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/squareup\.com/, /square\.site/],
    },
  },
  {
    name: 'Klarna',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/klarna\.com/],
      html: [/klarna/i],
    },
  },
  {
    name: 'Afterpay / Clearpay',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/afterpay\.com/, /clearpay\.com/],
    },
  },
  {
    name: 'Mollie',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/mollie\.com/],
      html: [/mollie/i],
    },
  },
  {
    name: 'Worldpay',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/worldpay\.com/],
    },
  },
  {
    name: 'Checkout.com',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/checkout\.com/],
    },
  },
  {
    name: 'Apple Pay',
    categories: ['Payments'],
    patterns: {
      html: [/apple-pay/, /ApplePaySession/],
      scriptSrc: [/applepay/],
    },
  },
  {
    name: 'Google Pay',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/pay\.google\.com/],
      html: [/google-pay/, /gpay/],
    },
  },
  {
    name: 'Amazon Pay',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/amazonpayments\.com/, /static-na\.payments-amazon\.com/],
    },
  },
  {
    name: 'Shop Pay (Shopify)',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/shop\.app/, /shopify\.com.*shop-pay/],
    },
  },
  {
    name: 'Sezzle',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/sezzle\.com/],
    },
  },
  {
    name: 'Affirm',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/affirm\.com/],
    },
  },
  {
    name: 'Recurly',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/recurly\.com/],
    },
  },
  {
    name: 'Chargebee',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/chargebee\.com/],
    },
  },
  {
    name: 'Paddle',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/paddle\.com/, /cdn\.paddle\.com/],
    },
  },
  {
    name: 'Razorpay',
    categories: ['Payments'],
    patterns: {
      scriptSrc: [/razorpay\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Hosting / Infrastructure / CDN  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Cloudflare',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { server: /cloudflare/i, 'cf-ray': /.*/ },
      scriptSrc: [/cdnjs\.cloudflare\.com/],
      cookies: ['__cf_bm', '__cflb', 'cf_clearance'],
    },
  },
  {
    name: 'Akamai',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { server: /AkamaiGHost/i, 'x-akamai-transformed': /.*/ },
      cookies: ['ak_bmsc', 'bm_sv', 'bm_sz'],
    },
  },
  {
    name: 'Fastly',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { 'x-served-by': /cache-/, via: /varnish/, 'x-fastly-request-id': /.*/ },
    },
  },
  {
    name: 'AWS CloudFront',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { 'x-amz-cf-id': /.*/, via: /CloudFront/, server: /CloudFront/ },
    },
  },
  {
    name: 'Google Cloud CDN',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { via: /google/, server: /gws/ },
    },
  },
  {
    name: 'Azure CDN',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { 'x-azure-ref': /.*/, server: /Microsoft/ },
    },
  },
  {
    name: 'Netlify',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { server: /Netlify/, 'x-nf-request-id': /.*/ },
    },
  },
  {
    name: 'Vercel',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { server: /Vercel/, 'x-vercel-id': /.*/ },
    },
  },
  {
    name: 'Heroku',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { via: /heroku/, 'x-heroku': /.*/ },
    },
  },
  {
    name: 'Fly.io',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { 'fly-request-id': /.*/, server: /Fly/ },
    },
  },
  {
    name: 'Railway',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { 'x-railway-request-id': /.*/ },
    },
  },
  {
    name: 'Render',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { 'x-render-origin-server': /.*/ },
    },
  },
  {
    name: 'KeyCDN',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { server: /KeyCDN/ },
    },
  },
  {
    name: 'StackPath / MaxCDN',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { 'x-hw': /.*/, server: /NetDNA/ },
    },
  },
  {
    name: 'Sucuri',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { server: /Sucuri/, 'x-sucuri-id': /.*/ },
    },
  },
  {
    name: 'Incapsula / Imperva',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { 'x-iinfo': /.*/, 'x-cdn': /Incapsula/ },
      cookies: ['incap_ses_', 'visid_incap_'],
    },
  },
  {
    name: 'Edgio / Layer0',
    categories: ['CDN/Infrastructure'],
    patterns: {
      headers: { 'x-0-status': /.*/, server: /layer0|edgio/i },
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  JavaScript Frameworks  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'React',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/data-reactroot/, /data-reactid/, /__NEXT_DATA__/, /react-app/],
      scriptSrc: [/react\.production\.min/, /react-dom/],
    },
  },
  {
    name: 'Next.js',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/__NEXT_DATA__/, /_next\/static/],
      scriptSrc: [/_next\//],
      headers: { 'x-powered-by': /Next\.js/ },
    },
  },
  {
    name: 'Vue.js',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/data-v-[a-f0-9]+/, /v-cloak/, /data-server-rendered/],
      scriptSrc: [/vue\.runtime/, /vue\.min\.js/, /vue\.global/],
    },
  },
  {
    name: 'Nuxt.js',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/__NUXT__/, /nuxt/, /_nuxt\//],
      scriptSrc: [/_nuxt\//],
    },
  },
  {
    name: 'Angular',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/ng-version/, /ng-app/, /\[ngClass\]/, /\*ngIf/],
      scriptSrc: [/angular/, /zone\.js/],
    },
  },
  {
    name: 'Svelte / SvelteKit',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/svelte-[a-z0-9]+/, /__sveltekit/],
      scriptSrc: [/svelte/],
    },
  },
  {
    name: 'Gatsby',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/___gatsby/, /gatsby-image/],
      scriptSrc: [/gatsby/],
    },
  },
  {
    name: 'Remix',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/__remix/, /remix-run/],
    },
  },
  {
    name: 'Astro',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/astro-/, /data-astro/],
      meta: { generator: /Astro/i },
    },
  },
  {
    name: 'Ember.js',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/data-ember-action/, /ember-view/],
      scriptSrc: [/ember/],
    },
  },
  {
    name: 'jQuery',
    categories: ['JavaScript Framework'],
    patterns: {
      scriptSrc: [/jquery\.min\.js/, /jquery-\d/, /code\.jquery\.com/],
    },
  },
  {
    name: 'Alpine.js',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/x-data/, /x-bind/, /x-on:/, /@click/],
      scriptSrc: [/alpine/],
    },
  },
  {
    name: 'HTMX',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/hx-get/, /hx-post/, /hx-trigger/],
      scriptSrc: [/htmx/],
    },
  },
  {
    name: 'Backbone.js',
    categories: ['JavaScript Framework'],
    patterns: {
      scriptSrc: [/backbone\.min\.js/, /backbone-/],
    },
  },
  {
    name: 'Preact',
    categories: ['JavaScript Framework'],
    patterns: {
      scriptSrc: [/preact/],
    },
  },
  {
    name: 'Stimulus (Hotwire)',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/data-controller/, /data-action/],
      scriptSrc: [/stimulus/, /hotwire/],
    },
  },
  {
    name: 'Turbo (Hotwire)',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/data-turbo/, /turbo-frame/],
      scriptSrc: [/turbo/],
    },
  },
  {
    name: 'Qwik',
    categories: ['JavaScript Framework'],
    patterns: {
      html: [/q:container/, /qwik/],
    },
  },
  {
    name: 'Solid.js',
    categories: ['JavaScript Framework'],
    patterns: {
      scriptSrc: [/solid-js/],
    },
  },
  {
    name: 'Lit',
    categories: ['JavaScript Framework'],
    patterns: {
      scriptSrc: [/lit-html/, /lit-element/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  CSS Frameworks  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Bootstrap',
    categories: ['CSS Framework'],
    patterns: {
      html: [/class="[^"]*\bcontainer\b[^"]*".*class="[^"]*\brow\b[^"]*"/, /class="[^"]*\bcol-[a-z]+-\d/],
      scriptSrc: [/bootstrap\.min\.js/, /bootstrap\.bundle/],
    },
  },
  {
    name: 'Tailwind CSS',
    categories: ['CSS Framework'],
    patterns: {
      html: [/class="[^"]*\bflex\b[^"]*\bitems-center\b/, /class="[^"]*\bbg-\w+-\d{3}\b/],
    },
  },
  {
    name: 'Foundation',
    categories: ['CSS Framework'],
    patterns: {
      html: [/class="[^"]*\bsmall-\d+\b[^"]*\bcolumns?\b/],
      scriptSrc: [/foundation\.min\.js/],
    },
  },
  {
    name: 'Materialize CSS',
    categories: ['CSS Framework'],
    patterns: {
      scriptSrc: [/materialize\.min\.js/],
      html: [/class="[^"]*materialize/],
    },
  },
  {
    name: 'Bulma',
    categories: ['CSS Framework'],
    patterns: {
      html: [/class="[^"]*\bcolumns\b[^"]*".*class="[^"]*\bcolumn\b/, /class="[^"]*\bhero\b[^"]*\bis-/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Other Adobe Products  ██
  // ═══════════════════════════════════════════════════════
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
    name: 'Adobe Workfront',
    categories: ['Other'],
    patterns: {
      html: [/workfront\.com/, /attask\.com/],
    },
  },
  {
    name: 'Adobe GenStudio',
    categories: ['Other'],
    patterns: {
      html: [/genstudio\.adobe/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Push Notifications  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'PushEngage',
    categories: ['Push Notifications'],
    patterns: {
      scriptSrc: [/pushengage\.com/],
    },
  },
  {
    name: 'Webpushr',
    categories: ['Push Notifications'],
    patterns: {
      scriptSrc: [/webpushr\.com/],
    },
  },
  {
    name: 'iZooto',
    categories: ['Push Notifications'],
    patterns: {
      scriptSrc: [/izooto\.com/],
    },
  },
  {
    name: 'WonderPush',
    categories: ['Push Notifications'],
    patterns: {
      scriptSrc: [/wonderpush\.com/],
    },
  },
  {
    name: 'VWO Engage (PushCrew)',
    categories: ['Push Notifications'],
    patterns: {
      scriptSrc: [/pushcrew\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Accessibility  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'AccessiBe',
    categories: ['Accessibility'],
    patterns: {
      scriptSrc: [/accessibe\.com/, /acsbapp\.com/],
    },
  },
  {
    name: 'AudioEye',
    categories: ['Accessibility'],
    patterns: {
      scriptSrc: [/audioeye\.com/],
    },
  },
  {
    name: 'UserWay',
    categories: ['Accessibility'],
    patterns: {
      scriptSrc: [/userway\.org/],
    },
  },
  {
    name: 'EqualWeb',
    categories: ['Accessibility'],
    patterns: {
      scriptSrc: [/equalweb\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Security  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'reCAPTCHA',
    categories: ['Security'],
    patterns: {
      scriptSrc: [/google\.com\/recaptcha/, /gstatic\.com\/recaptcha/],
      html: [/g-recaptcha/, /grecaptcha/],
    },
  },
  {
    name: 'hCaptcha',
    categories: ['Security'],
    patterns: {
      scriptSrc: [/hcaptcha\.com/],
      html: [/h-captcha/],
    },
  },
  {
    name: 'Cloudflare Turnstile',
    categories: ['Security'],
    patterns: {
      scriptSrc: [/challenges\.cloudflare\.com\/turnstile/],
      html: [/cf-turnstile/],
    },
  },
  {
    name: 'Arkose Labs (FunCaptcha)',
    categories: ['Security'],
    patterns: {
      scriptSrc: [/arkoselabs\.com/, /funcaptcha\.com/],
    },
  },
  {
    name: 'PerimeterX / HUMAN',
    categories: ['Security'],
    patterns: {
      scriptSrc: [/perimeterx\.net/, /px-cdn\.net/],
      cookies: ['_px_'],
    },
  },
  {
    name: 'Kasada',
    categories: ['Security'],
    patterns: {
      scriptSrc: [/kasada\.io/],
    },
  },
  {
    name: 'DataDome',
    categories: ['Security'],
    patterns: {
      cookies: ['datadome'],
      scriptSrc: [/datadome\.co/],
    },
  },
  {
    name: 'Shape Security (F5)',
    categories: ['Security'],
    patterns: {
      scriptSrc: [/shape\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Video / Media  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Wistia',
    categories: ['Video'],
    patterns: {
      scriptSrc: [/wistia\.com/, /fast\.wistia\.com/],
      html: [/wistia_embed/],
    },
  },
  {
    name: 'Vidyard',
    categories: ['Video'],
    patterns: {
      scriptSrc: [/vidyard\.com/, /play\.vidyard\.com/],
    },
  },
  {
    name: 'Brightcove',
    categories: ['Video'],
    patterns: {
      scriptSrc: [/brightcove\.com/, /brightcovecdn\.com/],
      html: [/brightcove-player/],
    },
  },
  {
    name: 'JW Player',
    categories: ['Video'],
    patterns: {
      scriptSrc: [/jwplayer\.com/, /jwpcdn\.com/],
      html: [/jwplayer/],
    },
  },
  {
    name: 'Kaltura',
    categories: ['Video'],
    patterns: {
      scriptSrc: [/kaltura\.com/],
    },
  },
  {
    name: 'Cloudflare Stream',
    categories: ['Video'],
    patterns: {
      html: [/videodelivery\.net/, /cloudflarestream\.com/],
    },
  },
  {
    name: 'Mux',
    categories: ['Video'],
    patterns: {
      html: [/mux\.com/, /stream\.mux\.com/],
      scriptSrc: [/mux\.com/],
    },
  },
  {
    name: 'SproutVideo',
    categories: ['Video'],
    patterns: {
      scriptSrc: [/sproutvideo\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Scheduling / Booking  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Calendly',
    categories: ['Scheduling'],
    patterns: {
      scriptSrc: [/calendly\.com/],
      html: [/calendly-inline-widget/],
    },
  },
  {
    name: 'Chili Piper',
    categories: ['Scheduling'],
    patterns: {
      scriptSrc: [/chilipiper\.com/],
    },
  },
  {
    name: 'HubSpot Meetings',
    categories: ['Scheduling'],
    patterns: {
      html: [/meetings\.hubspot\.com/],
    },
  },
  {
    name: 'Acuity Scheduling',
    categories: ['Scheduling'],
    patterns: {
      scriptSrc: [/acuityscheduling\.com/],
    },
  },
  {
    name: 'Cal.com',
    categories: ['Scheduling'],
    patterns: {
      scriptSrc: [/cal\.com/],
      html: [/cal-embed/],
    },
  },
  {
    name: 'SavvyCal',
    categories: ['Scheduling'],
    patterns: {
      scriptSrc: [/savvycal\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Forms / Lead Capture  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'JotForm',
    categories: ['Forms'],
    patterns: {
      scriptSrc: [/jotform\.com/],
      html: [/jotform/],
    },
  },
  {
    name: 'Gravity Forms',
    categories: ['Forms'],
    patterns: {
      html: [/gform_wrapper/, /gravityforms/],
    },
  },
  {
    name: 'Formstack',
    categories: ['Forms'],
    patterns: {
      scriptSrc: [/formstack\.com/],
    },
  },
  {
    name: 'Unbounce',
    categories: ['Forms'],
    patterns: {
      scriptSrc: [/unbounce\.com/],
      html: [/ubembed/],
    },
  },
  {
    name: 'Instapage',
    categories: ['Forms'],
    patterns: {
      scriptSrc: [/instapage\.com/],
    },
  },
  {
    name: 'Leadpages',
    categories: ['Forms'],
    patterns: {
      scriptSrc: [/leadpages\.net/, /leadpages\.com/],
    },
  },
  {
    name: 'OptinMonster',
    categories: ['Forms'],
    patterns: {
      scriptSrc: [/optinmonster\.com/, /opmnstr\.com/],
    },
  },
  {
    name: 'Sumo',
    categories: ['Forms'],
    patterns: {
      scriptSrc: [/sumo\.com/, /load\.sumo\.com/],
    },
  },
  {
    name: 'Privy',
    categories: ['Forms'],
    patterns: {
      scriptSrc: [/privy\.com/],
    },
  },
  {
    name: 'Justuno',
    categories: ['Forms'],
    patterns: {
      scriptSrc: [/justuno\.com/],
    },
  },
  {
    name: 'WPForms',
    categories: ['Forms'],
    patterns: {
      html: [/wpforms-container/, /wpforms/],
    },
  },
  {
    name: 'Tally',
    categories: ['Forms'],
    patterns: {
      scriptSrc: [/tally\.so/],
    },
  },
  {
    name: 'Fillout',
    categories: ['Forms'],
    patterns: {
      scriptSrc: [/fillout\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Popups / Notifications / CRO  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Wisepops',
    categories: ['CRO'],
    patterns: {
      scriptSrc: [/wisepops\.com/],
    },
  },
  {
    name: 'Hello Bar',
    categories: ['CRO'],
    patterns: {
      scriptSrc: [/hellobar\.com/],
    },
  },
  {
    name: 'Sleeknote',
    categories: ['CRO'],
    patterns: {
      scriptSrc: [/sleeknote\.com/],
    },
  },
  {
    name: 'OptiMonk',
    categories: ['CRO'],
    patterns: {
      scriptSrc: [/optimonk\.com/],
    },
  },
  {
    name: 'Proof / UseProof',
    categories: ['CRO'],
    patterns: {
      scriptSrc: [/useproof\.com/],
    },
  },
  {
    name: 'FOMO',
    categories: ['CRO'],
    patterns: {
      scriptSrc: [/fomo\.com/],
    },
  },
  {
    name: 'Nudgify',
    categories: ['CRO'],
    patterns: {
      scriptSrc: [/nudgify\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  EDW / Data Warehouse  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'Snowflake',
    categories: ['EDW'],
    patterns: {
      html: [/snowflakecomputing\.com/],
    },
  },

  // ═══════════════════════════════════════════════════════
  // ██  Performance Monitoring  ██
  // ═══════════════════════════════════════════════════════
  {
    name: 'New Relic',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/newrelic\.com/, /nr-data\.net/],
      cookies: ['NRBA_SESSION'],
    },
  },
  {
    name: 'Datadog RUM',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/datadoghq\.com/, /dd_rum/],
    },
  },
  {
    name: 'Dynatrace',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/dynatrace\.com/, /ruxitagentjs/],
      cookies: ['dtCookie', 'dtSa', 'rxvt'],
    },
  },
  {
    name: 'SpeedCurve',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/speedcurve\.com/],
    },
  },
  {
    name: 'Sentry',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/sentry\.io/, /browser\.sentry-cdn\.com/],
    },
  },
  {
    name: 'Bugsnag',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/bugsnag\.com/],
    },
  },
  {
    name: 'Raygun',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/raygun\.com/],
    },
  },
  {
    name: 'Elastic APM',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/elastic-apm/],
    },
  },
  {
    name: 'AppDynamics',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/appdynamics\.com/, /eum-appdynamics/],
    },
  },
  {
    name: 'Instana',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/instana\.io/],
    },
  },
  {
    name: 'Catchpoint',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/catchpoint\.com/],
    },
  },
  {
    name: 'mPulse (Akamai)',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/mpulse/, /go-mpulse\.net/],
    },
  },
  {
    name: 'Pingdom RUM',
    categories: ['Performance'],
    patterns: {
      scriptSrc: [/pingdom\.net/],
    },
  },
];

export function customDetect(scraped: ScrapedData): DetectedTech[] {
  const seen = new Set<string>();
  const detected: DetectedTech[] = [];

  for (const rule of rules) {
    // Deduplicate by name (first match wins)
    if (seen.has(rule.name)) continue;

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
      seen.add(rule.name);
      detected.push({
        name: rule.name,
        categories: rule.categories,
        confidence: 80,
      });
    }
  }

  return detected;
}