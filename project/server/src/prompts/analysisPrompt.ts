import type { ScrapedData } from '../services/scraper.js';
import type { DetectedTech } from '../services/customDetectors.js';

export function buildSystemPrompt(): string {
  return `You are a senior technology analyst specializing in enterprise marketing technology. You work with Adobe sales teams to identify technology gaps and opportunities.

CRITICAL – WRITE FOR NON-TECHNICAL READERS:
- Your audience: executives, marketing managers, business stakeholders who are NOT developers or IT experts.
- Use plain, everyday language. Avoid jargon (e.g. instead of "CDP" say "Customer Data Platform" or explain briefly).
- When a technical term is unavoidable, add a short explanation in parentheses (e.g. "CDN (content delivery network – speeds up website loading)").
- Keep sentences short. Focus on business impact, not technical details.
- No acronyms without spelling them out first (CDP → Customer Data Platform, DAM → Digital Asset Management, etc.).

Your analysis must be structured, factual, and actionable. You categorize detected technologies into specific categories and identify real challenges organizations face with their current tools.

You always respond with valid JSON matching the exact schema provided. Never include markdown formatting, explanatory text, or code fences outside the JSON structure. Output only the raw JSON object.`;
}

export function buildAnalysisPrompt(
  scraped: ScrapedData,
  detectedTechnologies: DetectedTech[],
): string {
  const techList = detectedTechnologies
    .map(
      (t) =>
        `- ${t.name} (categories: ${t.categories.join(', ')}${t.version ? `, version: ${t.version}` : ''}, confidence: ${t.confidence}%)`,
    )
    .join('\n');

  const truncatedBody = scraped.bodyText.substring(0, 15000);

  return `Analyze the technology stack of the following website and produce a structured JSON report.

## Website Information
- URL: ${scraped.finalUrl}
- Page Title: ${scraped.title}

## Detected Technologies (automated scan)
${techList || '(No technologies detected by automated scan)'}

## HTTP Headers (selected)
${formatHeaders(scraped.headers)}

## Cookies (for marketing/analytics detection)
${formatCookies(scraped.cookies)}

## Page Content (excerpt)
${truncatedBody}

## Your Task

Based on the detected technologies and page content, produce a JSON analysis covering ALL of the following categories. For each category, identify:
1. The **current technology** in use (from the detected list or inferred from page content). If no technology is detected for a category, state "Not Detected".
2. **Challenges and pain points** that organizations typically face with the identified technology. Be specific and practical -- focus on integration limitations, scalability issues, feature gaps, vendor lock-in, maintenance burden, or compliance concerns. If the technology is "Not Detected", describe common challenges organizations face when they lack a solution in this category.
3. **Adobe opportunity** -- which specific Adobe product could address the challenges. Only suggest genuinely relevant Adobe products.

## Required Categories (all must be present)
1. CMS - Content Management System
2. eCommerce - E-commerce Platform
3. DMP - Data Management Platform
4. CDP - Customer Data Platform
5. Analytics - Web/Digital Analytics
6. Personalization & Optimization - A/B Testing, Personalization
7. DAM - Digital Asset Management
8. CRM - Customer Relationship Management
9. ESP/Marketing Automation - Email Service Provider / Marketing Automation
10. EDW - Enterprise Data Warehouse
11. Other - Tag Management, CDN, Frameworks, Support Tools, etc.

## Adobe Product Reference
- CMS: Adobe Experience Manager (AEM)
- eCommerce: Adobe Commerce (Magento)
- DMP: Adobe Audience Manager
- CDP: Adobe Real-Time CDP
- Analytics: Adobe Analytics, Adobe Customer Journey Analytics
- Personalization: Adobe Target
- DAM: AEM Assets
- Marketing Automation: Adobe Marketo Engage, Adobe Campaign
- Advertising: Adobe Advertising Cloud
- Tag Management: Adobe Experience Platform Launch
- Journey Orchestration: Adobe Journey Optimizer
- Content Supply Chain: Adobe GenStudio, Adobe Workfront

## Response Format

Respond with ONLY a raw JSON object (no code fences, no markdown). The JSON must match this exact schema:

{
  "summary": "A 2-3 sentence executive summary in PLAIN LANGUAGE for non-technical readers. Describe what technologies the site uses and what opportunities exist. Avoid jargon; if you must use a technical term, explain it briefly in parentheses.",
  "categories": [
    {
      "category": "CMS",
      "currentTechnology": "WordPress 6.4 with Elementor",
      "challengesAndPainPoints": "Plain-language description of challenges (e.g. 'Content updates require many manual steps. No built-in approval process. Many add-ons increase security risk.').",
      "adobeOpportunity": "Plain-language description of the Adobe solution and what it improves (e.g. 'Adobe Experience Manager – helps teams manage content with built-in workflows and approval steps.')."
    }
  ]
}

Rules:
- Include ALL 11 categories in the output.
- EVERY detected technology from the list above MUST appear in at least one category (e.g. Magento → eCommerce, React/Next.js → Other).
- Be specific about versions when known.
- Challenges should be realistic for enterprise use cases.
- Adobe opportunities should be genuinely relevant.
- For "Other", combine miscellaneous detected technologies (CDN, tag management, frameworks, support tools, etc.).
- If cookies suggest marketing tech (e.g. _ga, _fbp, _gcl_au), mention them in Analytics or Advertising.
- IMPORTANT: When Adobe products are detected (AEM, Adobe Analytics, Adobe Target, Adobe Commerce/Magento, Marketo, Adobe Advertising Cloud, etc.), explicitly name them in the relevant category and note them in the summary. This is valuable for follow-up analyses.
- All text must be in English.
- PLAIN LANGUAGE: Write summary, challengesAndPainPoints, and adobeOpportunity for non-technical readers. No jargon without explanation. Short sentences. Focus on business impact.
- Output ONLY the JSON object, nothing else.`;
}

/** Marketing-relevante Cookie-Präfixe/Patterns – deckt nahezu alle Online-Marketing-Tools ab */
const MARKETING_COOKIE_PATTERNS = [
  /^_ga|^_gid|^_gat|^_gcl|^_gac|^_dc_gtm|^_dc_/,           // Google Analytics, GTM, DoubleClick
  /^_fbp|^_fbc|^fr\b|^c_user|^xs|^datr/,                   // Facebook/Meta
  /^li_|^bcookie|^lidc|^li_at|^JSESSIONID.*linkedin/,      // LinkedIn
  /^personalization_id|^guest_id|^twid|^auth_token/,        // Twitter/X
  /^tt_chain|^tt_|^_tt_/,                                  // TikTok
  /^_pinterest|^_pin_|^_pd_/,                              // Pinterest
  /^_scid|^_rdt|^_rdc/,                                     // Snapchat, Reddit
  /^cto_|^cto_bid|^cto_bundle/,                            // Criteo
  /^_taboola|^_ob_|^_mv_|^_amzn_/,                         // Taboola, Outbrain, Mediavine, Amazon
  /^_uetsid|^_uetvid|^_uetmsclkid/,                        // Microsoft/Bing Ads
  /^IDE|^ANID|^1P_JAR|^NID|^CONSENT|^SOCS/,               // Google Ads, DoubleClick
  /^s_ecid|^s_cc|^s_sq|^s_vi|^s_fid|^AMCV_|^AMCVS_|^demdex|^dextp|^mbox\b|^_sdsat|^everest_/, // Adobe Analytics, Target, Audience Manager, Launch, Advertising
  /^_lr|^_bk_|^_lr_|^lr_env/,                             // Lotame, BlueKai, Liveramp, LogRocket
  /^utag|^tealium|^utag_/,                                 // Tealium
  /^_gtm_|^_gtm/,                                         // Google Tag Manager
  /^_sctr|^_scid|^_mp_|^_et_|^_permutive/,                // Segment, mParticle, Ensighten, Permutive
  /^_hssc|^_hssrc|^hubspotutk|^__hssc|^__hssrc/,          // HubSpot
  /^_mkto_|^_pardot|^_sm_|^_elq/,                         // Marketo, Pardot, Salesforce, Eloqua
  /^_ac_|^_mc|^__kla|^_ab|^_iterable|^cio_|^sib_|^_drip_/, // ActiveCampaign, Mailchimp, Klaviyo, Braze, Customer.io, Sendinblue, Drip
  /^_opt_|^_vwo|^_abtasty|^_kameleoon|^_gaexp|^_conv_|^_mt_|^_dy_/, // Optimizely, VWO, AB Tasty, Convert, Monetate, Dynamic Yield
  /^CookieConsent|^Optanon|^cm_|^_dpm_|^didomi|^_iub_|^uc_|^_sp_|^notice_|^cookieyes/, // Consent/CMP
  /^_intercom|^_drift|^_zendesk|^_fresh|^__lc_|^_crisp|^_fw|^tidio|^tawk_|^olark/,  // Support/Chat
  /^_shopify|^woocommerce|^form_key|^PHPSESSID|^_bc_/,    // eCommerce
  /^_hj|^_hp2|^_pk_|^_ceg|^_jsuid|^__km|^_fs_|^_lo_|^__lotl|^__lotr|^mf_|^_clck|^_clsk|^_pendo_|^_gs_|^uv_|^SL_C_|^SMARTLOOK/, // Hotjar, Heap, Piwik, Lucky Orange, Mouseflow, Clarity, Pendo, Gainsight, UserVoice, Smartlook
  /^_s\b|^_ss|^_st|^_ev|^_evid/,                          // Mixpanel, Amplitude
  /^QSI|^_sm\b|^_tf_/,                                    // Qualtrics, SurveyMonkey, Typeform
  /^TPC|^GCM|^CM14|^__ar_v4|^__adroll|^mmapi|^_plista|^rcid|^_nat_|^_med_|^awin|^cjevent|^__ss|^impact_/, // Adform, AdRoll, MediaMath, Plista, Revcontent, Nativo, Media.net, Affiliate
  /^B\b|^AO\b/,                                           // Yahoo/Verizon (kurze Namen)
  /analytics|tracking|marketing|advertising|pixel|conversion|utm_|campaign|segment|audience|retarget|remarket|affiliate|consent|cmp|gdpr|privacy|opt.?out|opt.?in/i,
];

function formatCookies(cookies: Record<string, string>): string {
  const marketingRelevant = Object.keys(cookies).filter((k) =>
    MARKETING_COOKIE_PATTERNS.some((re) => re.test(k)),
  );
  if (marketingRelevant.length === 0) return '(No marketing-relevant cookies)';
  return marketingRelevant
    .sort()
    .map((k) => `${k}: ${cookies[k].length > 60 ? cookies[k].slice(0, 60) + '…' : cookies[k]}`)
    .join('\n');
}

function formatHeaders(headers: Record<string, string[]>): string {
  const interestingHeaders = [
    'server',
    'x-powered-by',
    'x-generator',
    'x-cms',
    'x-drupal-cache',
    'x-aspnet-version',
    'x-runtime',
    'via',
    'cf-ray',
  ];

  const lines: string[] = [];
  for (const key of interestingHeaders) {
    const match = Object.keys(headers).find(
      (k) => k.toLowerCase() === key,
    );
    if (match && headers[match]) {
      lines.push(`${match}: ${headers[match].join(', ')}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : '(No notable headers)';
}
