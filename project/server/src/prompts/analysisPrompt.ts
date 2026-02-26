import type { ScrapedData } from '../services/scraper.js';
import type { DetectedTech } from '../services/customDetectors.js';

export function buildSystemPrompt(): string {
  return `You are a senior technology analyst specializing in enterprise marketing technology (martech) stacks. You work with Adobe sales teams to identify technology gaps and opportunities for Adobe product placement.

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
  "summary": "A 2-3 sentence executive summary of the technology stack and key findings.",
  "categories": [
    {
      "category": "CMS",
      "currentTechnology": "WordPress 6.4 with Elementor",
      "challengesAndPainPoints": "Limited enterprise-grade personalization. Manual content workflows lacking approval chains. Plugin dependency creates security overhead.",
      "adobeOpportunity": "Adobe Experience Manager (AEM) - Enterprise CMS with built-in personalization, workflow automation, and headless delivery."
    }
  ]
}

Rules:
- Include ALL 11 categories in the output.
- Be specific about versions when known.
- Challenges should be realistic for enterprise use cases.
- Adobe opportunities should be genuinely relevant.
- For "Other", combine miscellaneous detected technologies (CDN, tag management, frameworks, support tools, etc.).
- All text must be in English.
- Output ONLY the JSON object, nothing else.`;
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
