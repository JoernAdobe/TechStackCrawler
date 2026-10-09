async () => {
  // Read-only probes for well-known vendor globals. Values are short strings (version, IDs or "present").
  const w = window;
  const out = {};
  const put = (key, value) => {
    if (value === undefined || value === null || value === false || value === '') return;
    out[key] = String(value).slice(0, 300);
  };
  const tryPut = (key, fn) => {
    try {
      put(key, fn());
    } catch (e) {
      /* ignore */
    }
  };
  const resolve = (path) => path.split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), w);

  tryPut('adobe.appmeasurement', () => {
    const list = (w.s_c_il || []).filter((o) => o && o._c === 's');
    const s = list[0] || (w.s && typeof w.s.t === 'function' ? w.s : null);
    return s ? s.version || 'present' : undefined;
  });
  tryPut('adobe.reportSuites', () => {
    const list = (w.s_c_il || []).filter((o) => o && o._c === 's' && o.account);
    return [...new Set(list.map((o) => o.account))].join(',');
  });
  tryPut('adobe.visitor', () => (w.Visitor && typeof w.Visitor.getInstance === 'function' ? w.Visitor.version || 'present' : undefined));
  tryPut('adobe.alloy', () => (Array.isArray(w.__alloyNS) && w.__alloyNS.length ? w.__alloyNS.join(',') : undefined));
  tryPut('adobe.launch', () => (w._satellite && w._satellite.buildInfo ? w._satellite.buildInfo.turbineVersion || 'present' : undefined));
  tryPut('adobe.launch.property', () => w._satellite && w._satellite.property && w._satellite.property.name);
  tryPut('adobe.launch.env', () => w._satellite && w._satellite.environment && w._satellite.environment.stage);
  tryPut('adobe.dtm', () => (w._satellite && !w._satellite.buildInfo && w._satellite.buildDate ? 'present' : undefined));
  tryPut('adobe.target', () => (w.adobe && w.adobe.target ? w.adobe.target.VERSION || 'present' : undefined));
  tryPut('adobe.dil', () => (w.DIL && typeof w.DIL.create === 'function' ? w.DIL.version || 'present' : undefined));
  tryPut('adobe.aem', () => (w.Granite || w.CQ ? 'present' : undefined));
  tryPut('adobe.eds', () => (w.hlx && typeof w.hlx === 'object' ? 'present' : undefined));
  tryPut('google.gtm', () => Object.keys(w.google_tag_manager || {}).filter((k) => /^GTM-/.test(k)).join(','));
  tryPut('google.tags', () => Object.keys(w.google_tag_manager || {}).filter((k) => /^(G|AW|DC)-/.test(k)).join(','));

  // [probe key, global path, optional version path]
  const simple = [
    ['marketo.munchkin', 'Munchkin'],
    ['tealium.utag', 'utag', 'utag.cfg.v'],
    ['segment', 'analytics.VERSION', 'analytics.VERSION'],
    ['optimizely', 'optimizely'],
    ['vwo', '_vwo_code'],
    ['hotjar', 'hj'],
    ['contentsquare', 'CS_CONF'],
    ['quantummetric', 'QuantumMetricAPI'],
    ['dynamicyield', 'DYO'],
    ['bloomreach.exponea', 'exponea'],
    ['emarsys', 'ScarabQueue'],
    ['salesforce.interactions', 'SalesforceInteractions'],
    ['evergage', 'Evergage'],
    ['braze', 'braze'],
    ['klaviyo', 'klaviyo'],
    ['onetrust', 'OneTrust'],
    ['cookiebot', 'Cookiebot'],
    ['usercentrics', 'UC_UI'],
    ['didomi', 'Didomi'],
    ['trustarc', 'truste'],
    ['qualtrics', 'QSI'],
    ['medallia', 'KAMPYLE_ONSITE_SDK'],
    ['intercom', 'Intercom'],
    ['zendesk', 'zE'],
    ['liveperson', 'lpTag'],
    ['salesforce.chat', 'embedded_svc'],
    ['drift', 'drift'],
    ['dynatrace', 'dtrum'],
    ['newrelic', 'NREUM'],
    ['datadog', 'DD_RUM'],
    ['shopify', 'Shopify.shop'],
    ['nextjs', '__NEXT_DATA__', 'next.version'],
    ['nuxt', '__NUXT__'],
    ['vue', 'Vue', 'Vue.version'],
    ['jquery', 'jQuery.fn.jquery', 'jQuery.fn.jquery'],
    ['gatsby', '___gatsby'],
    ['matomo', 'Matomo'],
    ['etracker', '_etracker'],
    ['snowplow', 'GlobalSnowplowNamespace'],
    ['mixpanel', 'mixpanel.__loaded'],
    ['amplitude', 'amplitude'],
    ['heap', 'heap.appid'],
    ['fullstory', '_fs_namespace'],
    ['mparticle', 'mParticle'],
    ['clarity', 'clarity'],
    ['meta.fbq', 'fbq'],
    ['tiktok', 'ttq'],
    ['linkedin', '_linkedin_partner_id'],
    ['pinterest', 'pintrk'],
    ['bing.uet', 'UET'],
    ['criteo', 'criteo_q'],
    ['hubspot', '_hsq'],
    ['piano', 'pa.sendEvent'],
  ];
  for (const [key, path, versionPath] of simple) {
    tryPut(key, () => {
      if (resolve(path) == null) return undefined;
      const version = versionPath ? resolve(versionPath) : undefined;
      return typeof version === 'string' || typeof version === 'number' ? version : 'present';
    });
  }

  if (out['adobe.alloy']) {
    try {
      const fn = w[w.__alloyNS[0]];
      const info = await Promise.race([
        fn('getLibraryInfo'),
        new Promise((resolveTimeout) => setTimeout(resolveTimeout, 1000)),
      ]);
      put('adobe.alloy.version', info && info.libraryInfo && info.libraryInfo.version);
    } catch (e) {
      /* ignore */
    }
  }
  return out;
}
