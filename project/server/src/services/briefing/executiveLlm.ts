/**
 * Executive Summary: LLM stuft Momentum/Urgency nach fester Rubrik ein und schreibt Verdict,
 * fünf Bullets und drei Adobe-Plays. Gesamtwert/Band/Confidence rechnet executive.ts.
 */
import type { AnalysisResult } from '../../types/analysis.js';
import {
  SUB_SCORE_WEIGHTS,
  type AdobePlay,
  type BriefingSection,
  type BriefingSectionId,
  type BriefingSource,
  type ExecutiveBullet,
  type ExecutiveBulletKey,
  type ExecutiveSummary,
  type SubScore,
} from '../../types/briefing.js';
import {
  confidenceOf,
  measuredSubScores,
  overallScore,
  RATED_SECTIONS,
  ratedApplicable,
  ratedValue,
  rubricText,
  scoreBand,
  SUB_SCORE_LABELS,
  type RatedKey,
} from './executive.js';
import { callModel, findToolUse, throwIfAborted, type LlmTool, type ModelContext } from './llm.js';
import { normalizeUrl } from './research/text.js';
import { toPlainText } from './sections/normalize.js';
import { summarizeSection } from './sections/summary.js';

export const BULLET_LABELS: Record<ExecutiveBulletKey, string> = {
  whyNow: 'Why now',
  topOpportunity: 'Top opportunity',
  keyRisk: 'Key risk',
  whoToTalkTo: 'Who to talk to',
  nextStep: 'Next step',
};
const BULLET_KEYS = Object.keys(BULLET_LABELS) as ExecutiveBulletKey[];

const sectionIdSchema = { type: 'string', pattern: '^s(0[1-9]|1[0-4])$' };
const ratingSchema = {
  type: 'object',
  properties: {
    level: { type: 'integer', minimum: 1, maximum: 5 },
    rationale: { type: 'string', description: 'One or two sentences citing the facts behind the level.' },
    sourceUrls: { type: 'array', items: { type: 'string' }, description: 'URLs from the section sources supporting the rating.' },
  },
  required: ['level', 'rationale'],
};
const bulletSchema = {
  type: 'object',
  properties: { text: { type: 'string' }, sectionRef: sectionIdSchema, sourceUrl: { type: 'string' } },
  required: ['text', 'sectionRef'],
};

export const SUBMIT_EXECUTIVE_TOOL: LlmTool = {
  name: 'submit_executive',
  description: 'Submit the executive summary of the client pre-briefing.',
  input_schema: {
    type: 'object',
    properties: {
      momentum: ratingSchema,
      urgency: ratingSchema,
      verdict: { type: 'string', description: 'One sentence bottom line for the account team.' },
      bullets: { type: 'object', properties: Object.fromEntries(BULLET_KEYS.map((k) => [k, bulletSchema])), required: BULLET_KEYS },
      plays: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            product: { type: 'string', description: 'Specific current Adobe product name as used in the Adobe Opportunity section' },
            headline: { type: 'string' },
            basedOn: { type: 'string', description: 'The concrete client fact from the briefing that justifies the play' },
            sectionRef: sectionIdSchema,
          },
          required: ['product', 'headline', 'basedOn', 'sectionRef'],
        },
      },
    },
    required: ['verdict', 'bullets', 'plays'],
  },
};

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});

function sourceIndex(sections: BriefingSection[]): Map<string, BriefingSource> {
  const m = new Map<string, BriefingSource>();
  for (const s of sections) for (const src of s.sources) {
    const k = normalizeUrl(src.url);
    if (k && !m.has(k)) m.set(k, src);
  }
  return m;
}

function lookupSource(index: Map<string, BriefingSource>, url: unknown): BriefingSource | undefined {
  const k = typeof url === 'string' ? normalizeUrl(url) : null;
  return k ? index.get(k) : undefined;
}

/** s14-Step „1. Adobe X (detail) — Nutzen“ → Play (Fallback ohne LLM). */
export function playsFromS14(sections: BriefingSection[]): AdobePlay[] {
  const s14 = sections.find((s) => s.id === 's14');
  const steps = s14?.blocks.flatMap((b) => (b.type === 'steps' ? b.items : [])) ?? [];
  return steps.slice(0, 3).map((st) => {
    const title = st.title.replace(/^\d+\.\s*/, '');
    const [product, ...rest] = title.split(/\s+[—–-]\s+/);
    return {
      product: product.trim(),
      headline: rest.join(' – ').trim() || product.trim(),
      basedOn: (st.body.match(/^[^.!?]+[.!?]/)?.[0] ?? st.body).slice(0, 240),
      sectionRef: 's14',
    };
  });
}

function firstSentence(sections: BriefingSection[], ids: BriefingSectionId[]): { text: string; ref?: BriefingSectionId } {
  for (const id of ids) {
    const s = sections.find((x) => x.id === id && x.status === 'done');
    const p = s?.blocks.find((b) => b.type === 'paragraph');
    if (s && p?.type === 'paragraph') return { text: p.text.match(/^[^.!?]+[.!?]/)?.[0] ?? p.text.slice(0, 200), ref: id };
  }
  return { text: '' };
}

export function fallbackNarrative(companyName: string, sections: BriefingSection[], overall: number | null, whitespaceRationale: string) {
  const plays = playsFromS14(sections);
  const top = plays[0];
  const bullet = (key: ExecutiveBulletKey, text: string, sectionRef?: BriefingSectionId): ExecutiveBullet => ({
    key,
    label: BULLET_LABELS[key],
    text: text || 'Not assessed – see the briefing sections.',
    ...(sectionRef ? { sectionRef } : {}),
  });
  const why = firstSentence(sections, ['s13', 's03', 's01']);
  const risk = firstSentence(sections, ['s11', 's09']);
  const who = firstSentence(sections, ['s12']);
  return {
    verdict: `${companyName}: pre-briefing score ${overall ?? 'n/a'}${top ? `; lead with ${top.product}` : ''}.`,
    bullets: [
      bullet('whyNow', why.text, why.ref),
      bullet('topOpportunity', top ? `${top.product} – ${top.headline}` : whitespaceRationale, top ? 's14' : undefined),
      bullet('keyRisk', risk.text, risk.ref),
      bullet('whoToTalkTo', who.text, who.ref),
      bullet('nextStep', top ? `Validate the ${top.product} case with the account team and the client's digital leadership.` : 'Validate the findings with the account team.', top ? 's14' : undefined),
    ],
    plays,
  };
}

export interface ExecutiveInput {
  companyName: string;
  analysis: AnalysisResult;
  sections: BriefingSection[];
  model: ModelContext;
}

export async function buildExecutiveSummary(input: ExecutiveInput): Promise<ExecutiveSummary> {
  const { sections } = input;
  const subScores: SubScore[] = measuredSubScores(input.analysis);
  const applicable: Record<RatedKey, boolean> = { momentum: ratedApplicable('momentum', sections), urgency: ratedApplicable('urgency', sections) };
  const usable = new Set(sections.filter((s) => s.status === 'done' || s.status === 'thin').map((s) => s.id));
  const index = sourceIndex(sections);

  let raw: Raw | null = null;
  try {
    const measured = subScores.map((s) => `- ${s.label}: ${s.value ?? 'not assessed'} – ${s.rationale}`).join('\n');
    const rubrics = (['momentum', 'urgency'] as RatedKey[])
      .map((k) =>
        applicable[k]
          ? `${SUB_SCORE_LABELS[k]} (rate 1–5, based on ${RATED_SECTIONS[k].join(', ')} content):\n${rubricText(k)}`
          : `${SUB_SCORE_LABELS[k]}: NOT ASSESSABLE (relevant sections missing or thin) – omit "${k}".`,
      )
      .join('\n\n');
    const res = await callModel(input.model, 'briefing.executive', {
      system:
        'You are an Adobe account strategist. Summarise a client pre-briefing for busy sellers. Use only facts in the provided sections; never invent. Plain text, English, no section codes in text (refer to sections by name). You do NOT compute any overall score.',
      messages: [
        {
          role: 'user',
          content: `Client: ${input.companyName}\n\nMeasured sub-scores (computed by code):\n${measured}\n\nRubrics:\n${rubrics}\n\nBriefing sections:\n${sections.map((s) => summarizeSection(s, 1_400)).join('\n\n')}\n\nWrite: verdict (one sentence), five bullets (whyNow, topOpportunity, keyRisk, whoToTalkTo, nextStep – each one or two sentences with the section id it relies on), and the top 3 Adobe plays taken from the Adobe Opportunity section, each with the client fact it is based on.`,
        },
      ],
      tools: [SUBMIT_EXECUTIVE_TOOL],
      tool_choice: { type: 'tool', name: SUBMIT_EXECUTIVE_TOOL.name },
      max_tokens: 8_000,
      temperature: 0.2,
    });
    raw = obj(findToolUse(res, SUBMIT_EXECUTIVE_TOOL.name)?.input);
  } catch (err) {
    throwIfAborted(input.model.signal);
    console.warn('Briefing executive narrative failed, using fallback:', err instanceof Error ? err.message : err);
  }

  for (const key of ['momentum', 'urgency'] as RatedKey[]) {
    const r = obj(raw?.[key]);
    const value = applicable[key] ? ratedValue(r.level as number) : null;
    const srcs = (Array.isArray(r.sourceUrls) ? r.sourceUrls : []).map((u) => lookupSource(index, u)).filter((s): s is BriefingSource => Boolean(s));
    subScores.push({
      key,
      label: SUB_SCORE_LABELS[key],
      weight: SUB_SCORE_WEIGHTS[key],
      value,
      kind: 'rated',
      ...(value !== null ? { rubricLevel: Math.round(r.level as number) } : {}),
      rationale: value !== null ? toPlainText(r.rationale) || 'Rated from the briefing sections.' : applicable[key] ? 'Rating unavailable.' : 'Not assessed – relevant sections deselected or thin.',
      sectionRefs: RATED_SECTIONS[key].filter((id) => usable.has(id)),
      ...(srcs.length ? { sources: srcs.slice(0, 5) } : {}),
    });
  }

  const overall = overallScore(subScores);
  const fallback = fallbackNarrative(input.companyName, sections, overall, subScores[0].rationale);
  const ref = (v: unknown): BriefingSectionId | undefined => (typeof v === 'string' && usable.has(v as BriefingSectionId) ? (v as BriefingSectionId) : undefined);

  const rawBullets = obj(raw?.bullets);
  const bullets: ExecutiveBullet[] = BULLET_KEYS.map((key, i) => {
    const b = obj(rawBullets[key]);
    const text = toPlainText(b.text);
    if (!text) return fallback.bullets[i];
    const source = lookupSource(index, b.sourceUrl);
    const sectionRef = ref(b.sectionRef);
    return { key, label: BULLET_LABELS[key], text, ...(sectionRef ? { sectionRef } : {}), ...(source ? { source } : {}) };
  });

  const plays: AdobePlay[] = (Array.isArray(raw?.plays) ? (raw!.plays as unknown[]) : [])
    .map(obj)
    .map((p) => ({ product: toPlainText(p.product), headline: toPlainText(p.headline), basedOn: toPlainText(p.basedOn), sectionRef: ref(p.sectionRef) ?? 's14' }))
    .filter((p) => p.product && p.headline && p.basedOn)
    .slice(0, 3);

  return {
    overallScore: overall,
    band: scoreBand(overall),
    confidence: confidenceOf(subScores, sections),
    verdict: toPlainText(raw?.verdict) || fallback.verdict,
    bullets,
    subScores,
    topPlays: plays.length ? plays : fallback.plays,
  };
}
