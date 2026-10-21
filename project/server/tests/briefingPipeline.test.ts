import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBriefingAssets } from '../src/services/briefing/assets.js';
import type { LlmContent, LlmCreate, LlmRequest, LlmResponse } from '../src/services/briefing/llm.js';
import { runBriefingPipelineWith } from '../src/services/briefing/pipeline.js';
import type { FetchOutcome, PageFetcher } from '../src/services/briefing/research/fetchPage.js';
import type { HttpGet } from '../src/services/briefing/research/http.js';
import type { SearchEngine } from '../src/services/briefing/research/search.js';
import type { AnalysisResult } from '../src/types/analysis.js';
import { BRIEFING_SECTIONS, type BriefingProgress, type BriefingSectionId } from '../src/types/briefing.js';

const ANALYSIS = {
  url: 'https://www.acme.com/',
  analyzedAt: '2026-04-10T08:00:00Z',
  summary: 'Acme Corp sells widgets.',
  categories: [],
  rawDetections: [
    { name: 'Google Analytics', categories: ['Analytics'], confidence: 100 },
    { name: 'OneTrust', categories: ['Consent Management'], confidence: 100 },
  ],
  sitemapUrls: ['https://shop.acme.com/', 'https://www.acme-group.de/'],
} as AnalysisResult;

const INDEPENDENT = 'https://www.reuters.com/acme-results';
const OWNED = 'https://www.acme.com/investors';
const SNIPPET = 'https://www.ft.com/acme-story';
const INVENTED = 'https://www.example-news.com/never-fetched';

const searchCalls: string[] = [];
const fakeSearch: SearchEngine = {
  async search(q) {
    searchCalls.push(q);
    return { ok: true, cached: false, dropped: [], hits: [{ title: 'Acme story', url: SNIPPET, snippet: 'Acme grows 2026.' }] };
  },
};
const fakeFetcher: PageFetcher = {
  async fetch(url): Promise<FetchOutcome> {
    return { ok: true, url, title: url.includes('reuters') ? 'Acme results' : 'Acme investors', text: 'Acme revenue rose 12% in 2025. '.repeat(10), date: 'Mar 2026', paywalled: false };
  },
};
const noHttp: HttpGet = async (url) => ({ status: 404, url, text: '', contentType: 'application/json' });

const sectionOf = (req: LlmRequest): BriefingSectionId | undefined => {
  const first = req.messages[0]?.content;
  const text = typeof first === 'string' ? first : '';
  const m = text.match(/Research and write the section "([^"]+)"/);
  return BRIEFING_SECTIONS.find((s) => s.title === m?.[1])?.id;
};

const usage = { input_tokens: 100, output_tokens: 20 };
const toolUse = (name: string, input: unknown, id = name): LlmResponse => ({ content: [{ type: 'tool_use', id, name, input } as LlmContent], stop_reason: 'tool_use', usage });

interface Script {
  failSection?: BriefingSectionId;
  thinSection?: BriefingSectionId;
  onCall?: (req: LlmRequest) => void;
  prompts: Map<string, string>;
}

function fakeModel(script: Script): LlmCreate {
  return async (req) => {
    script.onCall?.(req);
    const names = req.tools?.map((t) => t.name) ?? [];
    if (names.includes('identify_company')) return toolUse('identify_company', { companyName: 'Acme Corp', wikipediaQuery: 'Acme Corp' });
    if (names.includes('submit_executive')) {
      return toolUse('submit_executive', {
        verdict: 'Acme is a <b>strong</b> fit.',
        momentum: { level: 4, rationale: 'Revenue up 12%.', sourceUrls: [INDEPENDENT] },
        urgency: { level: 9, rationale: 'invalid level' },
        bullets: {
          whyNow: { text: 'Revenue rose 12%.', sectionRef: 's03', sourceUrl: INDEPENDENT },
          topOpportunity: { text: 'Unify data.', sectionRef: 's14' },
          keyRisk: { text: 'Consent gaps.', sectionRef: 's99' },
        },
        plays: [{ product: 'Adobe Real-Time CDP', headline: 'Unified profiles', basedOn: 'Google Analytics only', sectionRef: 's14' }],
        overallScore: 99,
      });
    }
    const id = sectionOf(req)!;
    script.prompts.set(id, String(req.messages[0].content));
    if (id === script.failSection) throw Object.assign(new Error('ValidationException: boom'), { status: 400 });
    if (req.messages.length === 1) {
      return {
        content: [
          { type: 'tool_use', id: 'a', name: 'web_search', input: { query: `acme ${id}` } },
          { type: 'tool_use', id: 'b', name: 'fetch_page', input: { url: INDEPENDENT } },
          { type: 'tool_use', id: 'c', name: 'fetch_page', input: { url: OWNED } },
        ] as LlmContent[],
        stop_reason: 'tool_use',
        usage,
      };
    }
    const steps =
      id === 's14'
        ? [{ type: 'steps', items: [1, 2, 3, 4].map((n) => ({ title: `Adobe Product ${n}`, body: `Because of fact ${n}.` })) }]
        : [{ type: 'note', title: 'Key point', text: 'Revenue <i>rose</i>.' }];
    const sources =
      id === script.thinSection
        ? [{ url: INVENTED, title: 'Made up', date: 'Jan 2026' }]
        : [
            { url: INDEPENDENT, title: 'Reuters', date: 'Mar 2026' },
            { url: OWNED, title: 'IR', date: 'Mar 2026' },
            { url: SNIPPET, title: 'FT', date: 'Jan 2026' },
            { url: INVENTED, title: 'Made up', date: 'Jan 2026' },
            ...(id === 's04' ? [{ url: ANALYSIS.url, title: 'TechStack Analyzer scan', date: 'Apr 2026' }] : []),
          ];
    return toolUse('submit_section', { blocks: [{ type: 'paragraph', text: `**Acme** ${id} text.` }, ...steps], sources, gaps: [] }, `submit-${req.messages.length}`);
  };
}

async function run(sections: BriefingSectionId[], script: Script, signal = new AbortController().signal) {
  const progress: BriefingProgress[] = [];
  const out = await runBriefingPipelineWith(
    { jobId: 1, analysis: ANALYSIS, sections, signal, onProgress: (p) => progress.push(p) },
    { create: fakeModel(script), httpGet: noHttp, search: fakeSearch, fetcher: fakeFetcher, assets: loadBriefingAssets(), concurrency: 3, now: () => new Date('2026-05-01T00:00:00Z'), llmOptions: { attempts: 1, sleep: async () => {} } },
  );
  return { out, progress };
}

test('pipeline: sections, source guardrail, s14 last with summaries, executive scoring, usage', async () => {
  const script: Script = { prompts: new Map(), thinSection: 's09' };
  const { out, progress } = await run(['s03', 's04', 's09', 's14'], script);

  assert.equal(out.companyName, 'Acme Corp');
  assert.equal(out.domain, 'acme.com');
  assert.ok(out.clientDomains.includes('acme.com') && out.clientDomains.includes('acme-group.de'));
  assert.deepEqual(out.sections.map((s) => s.id), ['s03', 's04', 's09', 's14']);

  const s03 = out.sections[0];
  assert.equal(s03.status, 'done');
  const urls = s03.sources.map((s) => s.url);
  assert.ok(!urls.includes(INVENTED), 'unfetched URL dropped');
  assert.equal(urls[0], INDEPENDENT);
  assert.ok(s03.sources.find((s) => s.url === SNIPPET)?.snippetOnly, 'search-only source flagged');
  assert.equal(s03.sources.find((s) => s.url === OWNED)?.independent, false);
  assert.equal(s03.sources.find((s) => s.url === INDEPENDENT)?.date, 'Mar 2026');
  assert.deepEqual(s03.blocks[0], { type: 'paragraph', text: 'Acme Financial Performance text.' });

  const s04 = out.sections[1];
  assert.ok(s04.sources.some((s) => s.title === 'TechStack Analyzer scan' && s.date === 'Apr 2026'), 'scan source cited in s04');
  assert.match(script.prompts.get('s04')!, /TechStack Analyzer facts/);

  const s09 = out.sections[2];
  assert.equal(s09.status, 'thin');
  assert.ok(s09.gaps.length > 0);

  const s14 = out.sections[3];
  assert.equal(s14.status, 'done');
  const s14Prompt = script.prompts.get('s14')!;
  assert.match(s14Prompt, /Findings from the other briefing sections/);
  assert.match(s14Prompt, /Financial Performance/);
  const steps = s14.blocks.find((b) => b.type === 'steps');
  assert.ok(steps?.type === 'steps' && steps.items[0].title.startsWith('1. Adobe Product 1'), JSON.stringify(steps));

  // s14 erst nach allen anderen Abschnitten
  const firstS14 = progress.findIndex((p) => p.step === 's14');
  const lastOther = Math.max(...progress.map((p, i) => (p.step !== 's14' && p.step !== 'executive' ? i : -1)));
  assert.ok(firstS14 > lastOther, `s14 order ${firstS14} ${lastOther}`);
  for (const id of ['s03', 's04', 's09', 's14'] as const) {
    const states = progress.filter((p) => p.step === id).map((p) => p.state);
    assert.deepEqual(states.slice(0, 2), ['researching', 'writing'], id);
  }
  assert.deepEqual(progress.filter((p) => p.step === 'executive').map((p) => p.state), ['writing', 'done']);

  const ex = out.executive;
  const momentum = ex.subScores.find((s) => s.key === 'momentum')!;
  assert.equal(momentum.value, 75);
  assert.equal(momentum.rubricLevel, 4);
  assert.equal(momentum.sources?.[0]?.url, INDEPENDENT);
  assert.equal(ex.subScores.find((s) => s.key === 'urgency')!.value, null, 'invalid rubric level ignored');
  assert.notEqual(ex.overallScore, 99, 'LLM cannot set overall score');
  assert.equal(ex.verdict, 'Acme is a strong fit.');
  assert.equal(ex.bullets.length, 5);
  assert.equal(ex.bullets.find((b) => b.key === 'keyRisk')?.sectionRef, undefined, 'unknown section ref removed');
  assert.equal(ex.bullets.find((b) => b.key === 'whyNow')?.label, 'Why now');
  assert.equal(ex.topPlays[0].product, 'Adobe Real-Time CDP');

  assert.equal(out.usage.searches, 4);
  assert.equal(out.usage.fetches, 8);
  assert.ok(out.usage.inputTokens > 0 && out.usage.outputTokens > 0, 'tokens');
  assert.ok(out.usage.usd > 0, 'usd');
});

test('pipeline: failing section becomes status error, pipeline continues', async () => {
  const { out, progress } = await run(['s01', 's14'], { prompts: new Map(), failSection: 's01' });
  const s01 = out.sections.find((s) => s.id === 's01')!;
  assert.equal(s01.status, 'error');
  assert.match(s01.gaps[0], /could not be generated/);
  assert.ok(progress.some((p) => p.step === 's01' && p.state === 'error'));
  assert.equal(out.sections.find((s) => s.id === 's14')!.status, 'done');
});

test('pipeline: s14 is always included', async () => {
  const { out } = await run(['s02'], { prompts: new Map() });
  assert.deepEqual(out.sections.map((s) => s.id), ['s02', 's14']);
});

test('pipeline: abort rethrows the signal reason', async () => {
  const ctrl = new AbortController();
  const reason = new Error('cancelled by user');
  let calls = 0;
  await assert.rejects(
    run(['s01', 's02', 's14'], { prompts: new Map(), onCall: () => { if (++calls === 3) ctrl.abort(reason); } }, ctrl.signal),
    (err) => err === reason,
  );
});
