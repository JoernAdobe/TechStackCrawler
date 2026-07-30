/**
 * Deterministische Competitor → Adobe Displacement Knowledge Base.
 *
 * Wird in den Analyse-Prompt als Ground-Truth injiziert: Sobald einer dieser
 * Wettbewerber erkannt wird, soll das Modell die zugehörige Adobe-Opportunity
 * NICHT frei improvisieren, sondern auf diesem Mapping aufsetzen. Das macht
 * TechCase-Sektion 04 (Proposed Solutions) reproduzierbar und belastbar.
 *
 * `competitor` wird case-insensitiv als Teilstring gegen die erkannten
 * Technologie-Namen gematcht (customDetectors verwendet i. d. R. genau diese
 * Produktnamen).
 */

export interface DisplacementEntry {
  /** Teilstring, der gegen erkannte Technologie-Namen gematcht wird. */
  competitor: string;
  /** TechCase-/Analyse-Kategorie (informativ). */
  category: string;
  /** Empfohlenes Adobe-Produkt (bzw. -Kombination). */
  adobeProduct: string;
  /** Warum Adobe hier verdrängt/ergänzt (Klartext, geschäftsorientiert). */
  displacementRationale: string;
  /** Die zentrale Fähigkeit, die den Unterschied macht. */
  keyCapability: string;
}

export const DISPLACEMENT_MAP: DisplacementEntry[] = [
  // ── CMS ──
  { competitor: 'Sitecore', category: 'CMS', adobeProduct: 'Adobe Experience Manager (AEM) Sites',
    displacementRationale: 'Sitecore ties content, personalization and hosting into a costly, hard-to-upgrade stack; AEM offers cloud-native delivery with a lower maintenance burden.',
    keyCapability: 'Headless + visual authoring with built-in workflows and cloud auto-scaling.' },
  { competitor: 'Contentful', category: 'CMS', adobeProduct: 'Adobe Experience Manager (AEM) Sites',
    displacementRationale: 'Contentful is headless-only and needs many bolt-ons for personalization and assets; AEM unifies content, assets and personalization in one platform.',
    keyCapability: 'Content + DAM + personalization in one, without stitching third-party tools.' },
  { competitor: 'Contentstack', category: 'CMS', adobeProduct: 'Adobe Experience Manager (AEM) Sites',
    displacementRationale: 'Contentstack lacks native asset management and on-page personalization that enterprise teams need; AEM provides both natively.',
    keyCapability: 'Integrated authoring, DAM and personalization.' },
  { competitor: 'WordPress', category: 'CMS', adobeProduct: 'Adobe Experience Manager (AEM) Sites',
    displacementRationale: 'WordPress relies on many plugins that add security and maintenance risk and rarely scale to enterprise governance; AEM gives governed, enterprise-grade authoring.',
    keyCapability: 'Enterprise governance, approval workflows and scalable multi-site management.' },
  { competitor: 'Drupal', category: 'CMS', adobeProduct: 'Adobe Experience Manager (AEM) Sites',
    displacementRationale: 'Drupal needs heavy custom development and integrations for personalization and assets; AEM delivers these out of the box.',
    keyCapability: 'Out-of-the-box personalization and asset management.' },
  { competitor: 'Optimizely', category: 'CMS', adobeProduct: 'Adobe Experience Manager (AEM) Sites',
    displacementRationale: 'Optimizely CMS (formerly Episerver) fragments content, testing and commerce across modules; AEM consolidates delivery with tighter Adobe integrations.',
    keyCapability: 'Unified experience delivery across web and app channels.' },
  { competitor: 'TYPO3', category: 'CMS', adobeProduct: 'Adobe Experience Manager (AEM) Sites',
    displacementRationale: 'TYPO3 requires specialised developers and lacks native personalization/DAM; AEM lowers dependency on niche skills.',
    keyCapability: 'Business-user authoring with native personalization.' },
  { competitor: 'Acquia', category: 'CMS', adobeProduct: 'Adobe Experience Manager (AEM) Sites',
    displacementRationale: 'Acquia builds on Drupal and still needs multiple add-ons; AEM offers a single integrated Experience Cloud.',
    keyCapability: 'Single integrated stack across content, assets and data.' },

  // ── eCommerce ──
  { competitor: 'Salesforce Commerce', category: 'eCommerce', adobeProduct: 'Adobe Commerce',
    displacementRationale: 'Salesforce Commerce Cloud (Demandware) is a closed SaaS with limited customization and revenue-share pricing; Adobe Commerce gives flexible B2B/B2C control.',
    keyCapability: 'Open, extensible commerce with strong B2B and native AEM integration.' },
  { competitor: 'Demandware', category: 'eCommerce', adobeProduct: 'Adobe Commerce',
    displacementRationale: 'Demandware limits deep customization and carries GMV-based fees; Adobe Commerce offers ownership and flexibility.',
    keyCapability: 'Full catalog and checkout control without revenue-share fees.' },
  { competitor: 'Hybris', category: 'eCommerce', adobeProduct: 'Adobe Commerce',
    displacementRationale: 'SAP Commerce (Hybris) is heavy and expensive to run; Adobe Commerce is faster to implement with lower total cost.',
    keyCapability: 'Faster time-to-market with a modern, cloud-native commerce core.' },
  { competitor: 'Shopify', category: 'eCommerce', adobeProduct: 'Adobe Commerce',
    displacementRationale: 'Shopify constrains complex catalogs, B2B and enterprise workflows; Adobe Commerce scales to sophisticated requirements.',
    keyCapability: 'Advanced B2B, multi-store and complex catalog support.' },
  { competitor: 'commercetools', category: 'eCommerce', adobeProduct: 'Adobe Commerce',
    displacementRationale: 'commercetools is API-only and needs a full front-end and integration build; Adobe Commerce provides a complete, extensible platform.',
    keyCapability: 'Complete commerce platform plus native content and personalization.' },
  { competitor: 'BigCommerce', category: 'eCommerce', adobeProduct: 'Adobe Commerce',
    displacementRationale: 'BigCommerce limits enterprise customization; Adobe Commerce offers deeper control and Adobe Experience Cloud integration.',
    keyCapability: 'Enterprise extensibility and unified Adobe experience.' },

  // ── CDP ──
  { competitor: 'Segment', category: 'CDP', adobeProduct: 'Adobe Real-Time CDP',
    displacementRationale: 'Segment is primarily an event pipeline without real-time activation and enterprise governance; Real-Time CDP unifies profiles and activates them live.',
    keyCapability: 'Real-time unified profiles with built-in activation and governance.' },
  { competitor: 'Tealium', category: 'CDP', adobeProduct: 'Adobe Real-Time CDP',
    displacementRationale: 'Tealium centers on tag management with a bolt-on CDP; Real-Time CDP is a native profile and segmentation engine tied to Adobe activation.',
    keyCapability: 'Native real-time segmentation feeding Adobe channels directly.' },
  { competitor: 'mParticle', category: 'CDP', adobeProduct: 'Adobe Real-Time CDP',
    displacementRationale: 'mParticle focuses on mobile data collection; Real-Time CDP adds enterprise-scale profile stitching and cross-channel activation.',
    keyCapability: 'Cross-channel identity resolution at enterprise scale.' },
  { competitor: 'Treasure Data', category: 'CDP', adobeProduct: 'Adobe Real-Time CDP',
    displacementRationale: 'Treasure Data requires heavy configuration and lacks tight Adobe activation; Real-Time CDP is turnkey within Experience Cloud.',
    keyCapability: 'Turnkey profiles with direct Adobe channel activation.' },

  // ── DMP ──
  { competitor: 'BlueKai', category: 'DMP', adobeProduct: 'Adobe Audience Manager / Real-Time CDP',
    displacementRationale: 'Oracle BlueKai is being wound down and relies on third-party cookies; Adobe moves audiences to a first-party, future-proof foundation.',
    keyCapability: 'First-party audience management resilient to cookie deprecation.' },
  { competitor: 'Lotame', category: 'DMP', adobeProduct: 'Adobe Real-Time CDP',
    displacementRationale: 'Lotame depends on third-party data; Real-Time CDP shifts the strategy to owned first-party profiles.',
    keyCapability: 'First-party data strategy with real-time activation.' },

  // ── Analytics ──
  { competitor: 'Google Analytics', category: 'Analytics', adobeProduct: 'Adobe Analytics / Customer Journey Analytics',
    displacementRationale: 'GA4 samples data, limits custom analysis and raises data-ownership and privacy questions; Adobe Analytics offers un-sampled, flexible, cross-channel analysis.',
    keyCapability: 'Un-sampled, cross-channel analysis with full data ownership.' },
  { competitor: 'Mixpanel', category: 'Analytics', adobeProduct: 'Adobe Customer Journey Analytics',
    displacementRationale: 'Mixpanel is product-analytics only; CJA analyses the full omni-channel journey including offline data.',
    keyCapability: 'Omni-channel journey analysis across online and offline touchpoints.' },
  { competitor: 'Amplitude', category: 'Analytics', adobeProduct: 'Adobe Customer Journey Analytics',
    displacementRationale: 'Amplitude focuses on digital product events; CJA stitches all channels onto one customer view.',
    keyCapability: 'Unified cross-channel customer view.' },

  // ── Personalization & Optimization ──
  { competitor: 'Optimizely Web', category: 'Personalization & Optimization', adobeProduct: 'Adobe Target',
    displacementRationale: 'Optimizely testing lives apart from your data and content platforms; Adobe Target uses shared Adobe profiles for AI-driven personalization.',
    keyCapability: 'AI-driven personalization powered by shared Adobe profiles.' },
  { competitor: 'VWO', category: 'Personalization & Optimization', adobeProduct: 'Adobe Target',
    displacementRationale: 'VWO is mainly A/B testing; Adobe Target adds automated 1:1 personalization at scale.',
    keyCapability: 'Automated 1:1 personalization (Auto-Target, Automated Personalization).' },
  { competitor: 'Dynamic Yield', category: 'Personalization & Optimization', adobeProduct: 'Adobe Target',
    displacementRationale: 'Dynamic Yield sits outside the Adobe data model and duplicates audiences; Adobe Target reuses Real-Time CDP audiences directly.',
    keyCapability: 'Direct reuse of Real-Time CDP audiences for personalization.' },
  { competitor: 'AB Tasty', category: 'Personalization & Optimization', adobeProduct: 'Adobe Target',
    displacementRationale: 'AB Tasty covers testing but lacks deep enterprise data integration; Adobe Target is native to Experience Cloud.',
    keyCapability: 'Native Experience Cloud personalization and testing.' },
  { competitor: 'Monetate', category: 'Personalization & Optimization', adobeProduct: 'Adobe Target',
    displacementRationale: 'Monetate is a separate personalization silo; Adobe Target consolidates testing and personalization on shared data.',
    keyCapability: 'One engine for testing and personalization on shared profiles.' },

  // ── DAM ──
  { competitor: 'Bynder', category: 'DAM', adobeProduct: 'Adobe Experience Manager Assets',
    displacementRationale: 'Bynder is a standalone DAM disconnected from delivery; AEM Assets links assets directly to sites, campaigns and Creative Cloud.',
    keyCapability: 'Assets connected to delivery and native Creative Cloud workflows.' },
  { competitor: 'Cloudinary', category: 'DAM', adobeProduct: 'Adobe Experience Manager Assets & Dynamic Media',
    displacementRationale: 'Cloudinary handles image delivery but not enterprise asset governance; AEM Assets adds governance plus dynamic delivery.',
    keyCapability: 'Enterprise asset governance with dynamic, device-optimized delivery.' },
  { competitor: 'Widen', category: 'DAM', adobeProduct: 'Adobe Experience Manager Assets',
    displacementRationale: 'Widen is a separate DAM; AEM Assets integrates directly with authoring and Creative Cloud.',
    keyCapability: 'Direct asset-to-page and Creative Cloud integration.' },

  // ── Marketing Automation / ESP ──
  { competitor: 'Salesforce Marketing Cloud', category: 'ESP/Marketing Automation', adobeProduct: 'Adobe Journey Optimizer / Adobe Campaign',
    displacementRationale: 'Salesforce Marketing Cloud is fragmented across acquired products with dated journey tooling; Adobe Journey Optimizer offers unified real-time journeys.',
    keyCapability: 'Unified real-time journey orchestration on live profiles.' },
  { competitor: 'HubSpot', category: 'ESP/Marketing Automation', adobeProduct: 'Adobe Marketo Engage',
    displacementRationale: 'HubSpot fits SMB needs but hits limits in enterprise lead management and scale; Marketo Engage is built for complex B2B demand generation.',
    keyCapability: 'Enterprise lead scoring, nurturing and account-based marketing.' },
  { competitor: 'Pardot', category: 'ESP/Marketing Automation', adobeProduct: 'Adobe Marketo Engage',
    displacementRationale: 'Pardot (Account Engagement) has limited scalability and analytics; Marketo Engage offers richer automation and reporting.',
    keyCapability: 'Advanced automation and revenue attribution.' },
  { competitor: 'Eloqua', category: 'ESP/Marketing Automation', adobeProduct: 'Adobe Marketo Engage',
    displacementRationale: 'Oracle Eloqua is complex and slow to change; Marketo Engage is more agile for marketers.',
    keyCapability: 'Marketer-friendly, agile campaign automation.' },
  { competitor: 'Braze', category: 'ESP/Marketing Automation', adobeProduct: 'Adobe Journey Optimizer',
    displacementRationale: 'Braze focuses on messaging without an enterprise data foundation; AJO combines journeys with Real-Time CDP profiles.',
    keyCapability: 'Journeys driven by unified real-time customer data.' },
  { competitor: 'Klaviyo', category: 'ESP/Marketing Automation', adobeProduct: 'Adobe Campaign / Journey Optimizer',
    displacementRationale: 'Klaviyo targets SMB e-commerce email; Adobe adds cross-channel orchestration at enterprise scale.',
    keyCapability: 'Cross-channel orchestration beyond email.' },
  { competitor: 'Mailchimp', category: 'ESP/Marketing Automation', adobeProduct: 'Adobe Campaign',
    displacementRationale: 'Mailchimp is basic email marketing; Adobe Campaign delivers enterprise cross-channel campaigns.',
    keyCapability: 'Enterprise cross-channel campaign management.' },

  // ── CRM (complement, not replacement) ──
  { competitor: 'Salesforce', category: 'CRM', adobeProduct: 'Adobe Real-Time CDP (complements CRM)',
    displacementRationale: 'A CRM like Salesforce records known contacts but not real-time behavioural profiles; Real-Time CDP unifies known and anonymous data for activation — it complements, not replaces, the CRM.',
    keyCapability: 'Real-time unification of CRM, web and anonymous data for activation.' },
  { competitor: 'Microsoft Dynamics', category: 'CRM', adobeProduct: 'Adobe Real-Time CDP (complements CRM)',
    displacementRationale: 'Dynamics manages sales/service records but lacks real-time cross-channel profiles; Real-Time CDP fills that activation gap alongside it.',
    keyCapability: 'Cross-channel profile activation on top of the existing CRM.' },

  // ── Tag Management ──
  { competitor: 'Google Tag Manager', category: 'Tag Management', adobeProduct: 'Adobe Experience Platform Tags (Launch)',
    displacementRationale: 'GTM lives in the Google ecosystem and complicates first-party governance; Adobe Tags integrates natively with Adobe data collection and privacy controls.',
    keyCapability: 'Native, governed data collection feeding the Adobe Experience Platform.' },
];

function norm(value: string): string {
  return value.toLowerCase().trim();
}

/**
 * Liefert die Displacement-Einträge, deren `competitor` in einem der erkannten
 * Technologie-Namen vorkommt. Dedupliziert auf einen Eintrag pro Adobe-Produkt +
 * Wettbewerber-Kombination.
 */
export function findDisplacements(detectedNames: string[]): DisplacementEntry[] {
  const names = detectedNames.map(norm).filter(Boolean);
  const seen = new Set<string>();
  const matches: DisplacementEntry[] = [];

  for (const entry of DISPLACEMENT_MAP) {
    const comp = norm(entry.competitor);
    // Primär: erkannter Name enthält den (spezifischen) Wettbewerber-String.
    // Reverse-Richtung nur für hinreichend lange Namen, um False Positives durch
    // kurze generische Tokens (z. B. "Google Fonts" → "Google …") zu vermeiden.
    const hit = names.some(
      (n) => n.includes(comp) || (n.length >= 5 && comp.includes(n)),
    );
    if (!hit) continue;
    const key = `${comp}::${norm(entry.adobeProduct)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push(entry);
  }

  return matches;
}
