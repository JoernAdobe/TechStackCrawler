import assert from 'node:assert/strict';
import test from 'node:test';
import { backoffDelay, classifyError, RetryableResponseError, withRetry } from '../src/utils/retry.js';
import { callLlm, LlmError } from '../src/services/llmCall.js';
import { setBedrockClientForTests } from '../src/services/bedrockClient.js';
import { analyzeWithAI, validateAnalysisJson } from '../src/services/ai.js';
import { errorHandler, BadRequestError } from '../src/utils/http.js';
import type { ScrapedData } from '../src/services/scraper.js';

const noSleep = async () => {};

test('classifyError: transient, throttled, auth, invalid_response, fatal', () => {
  assert.equal(classifyError(new TypeError('terminated')), 'transient');
  assert.equal(classifyError(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })), 'transient');
  assert.equal(classifyError(Object.assign(new Error('Overloaded'), { status: 529 })), 'transient');
  assert.equal(classifyError(Object.assign(new Error('x'), { status: 503 })), 'transient');
  assert.equal(classifyError(Object.assign(new Error('Too many requests'), { status: 429 })), 'throttled');
  assert.equal(classifyError(new Error('ThrottlingException: Rate exceeded')), 'throttled');
  assert.equal(classifyError(Object.assign(new Error('nope'), { status: 403 })), 'auth');
  assert.equal(classifyError(new Error('The security token included in the request is expired')), 'auth');
  assert.equal(classifyError(new SyntaxError('Unexpected token')), 'invalid_response');
  assert.equal(classifyError(new RetryableResponseError('bad')), 'invalid_response');
  assert.equal(classifyError(Object.assign(new Error('ValidationException'), { status: 400 })), 'fatal');
});

test('backoffDelay grows exponentially, is jittered and capped', () => {
  assert.equal(backoffDelay(0, 1000, 10_000, () => 1), 1000);
  assert.equal(backoffDelay(3, 1000, 10_000, () => 1), 8000);
  assert.equal(backoffDelay(10, 1000, 10_000, () => 1), 10_000);
  assert.equal(backoffDelay(2, 1000, 10_000, () => 0), 400);
});

test('withRetry retries transient errors and stops on non-retryable ones', async () => {
  let calls = 0;
  const value = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw new TypeError('terminated');
      return 'ok';
    },
    { attempts: 4, sleep: noSleep },
  );
  assert.equal(value, 'ok');
  assert.equal(calls, 3);

  let authCalls = 0;
  await assert.rejects(
    withRetry(async () => {
      authCalls++;
      throw Object.assign(new Error('denied'), { status: 401 });
    }, { attempts: 4, sleep: noSleep }),
  );
  assert.equal(authCalls, 1);
});

test('callLlm: per-attempt timeout aborts and is reported as LlmError(timeout)', async () => {
  let attempts = 0;
  const err = await callLlm(
    'test',
    (signal) => {
      attempts++;
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    },
    { attempts: 2, timeoutMs: 20, sleep: noSleep },
  ).catch((e: unknown) => e);
  assert.ok(err instanceof LlmError);
  assert.equal(err.kind, 'timeout');
  assert.equal(attempts, 2);
  assert.match(err.message, /did not respond in time/);
});

test('callLlm: auth errors are not retried and get a clear English message', async () => {
  let attempts = 0;
  const err = await callLlm('test', async () => {
    attempts++;
    throw Object.assign(new Error('expired'), { status: 403 });
  }, { attempts: 3, sleep: noSleep }).catch((e: unknown) => e);
  assert.ok(err instanceof LlmError);
  assert.equal(err.kind, 'auth');
  assert.equal(attempts, 1);
  assert.match(err.message, /authentication failed/);
});

test('validateAnalysisJson repairs fenced JSON and rejects garbage as retryable', () => {
  const ok = validateAnalysisJson('```json\n{"summary":"S","categories":[{"category":"CMS","currentTechnology":"AEM"}]}\n```');
  assert.equal(ok.summary, 'S');
  assert.equal(ok.categories[0]!.adobeOpportunity, '');
  assert.throws(() => validateAnalysisJson('Sorry, I cannot help.'), RetryableResponseError);
  assert.throws(() => validateAnalysisJson('{"foo": 1}'), RetryableResponseError);
});

/** Minimaler Stream-Mock im Format des Anthropic-SDK. */
function streamOf(text: string, failAfterFirstChunk = false) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(0, 5) } };
      if (failAfterFirstChunk) throw new TypeError('terminated');
      yield { type: 'content_block_delta', delta: { type: 'text_delta', text: text.slice(5) } };
    },
    finalMessage: async () => ({ stop_reason: 'end_turn' }),
  };
}

const scraped: ScrapedData = {
  url: 'https://example.com', finalUrl: 'https://example.com', html: '<html></html>', headers: {}, meta: {},
  scriptSrc: [], cookies: {}, title: 'Example', bodyText: 'Hello', links: [], requests: [], jsGlobals: {}, edgeSignals: [],
};

test('analyzeWithAI retries a stream that dies with "terminated" and succeeds on the next attempt', async () => {
  process.env.BEDROCK_RETRY_BASE_MS = '0';
  delete process.env.USE_MOCK_AI;
  delete process.env.BEDROCK_SKIP_SIMULATE;
  const answer = JSON.stringify({ summary: 'Fine', categories: [] });
  let calls = 0;
  setBedrockClientForTests({
    messages: {
      stream: () => {
        calls++;
        return streamOf(answer, calls === 1);
      },
    },
  } as never);
  try {
    const result = await analyzeWithAI(scraped, []);
    assert.equal(result.summary, 'Fine');
    assert.equal(calls, 2);
  } finally {
    setBedrockClientForTests(null);
  }
});

test('analyzeWithAI gives up after max attempts with a classified LlmError', async () => {
  process.env.BEDROCK_RETRY_BASE_MS = '0';
  process.env.BEDROCK_MAX_ATTEMPTS = '2';
  let calls = 0;
  setBedrockClientForTests({
    messages: { stream: () => { calls++; return streamOf('x', true); } },
  } as never);
  try {
    const err = await analyzeWithAI(scraped, []).catch((e: unknown) => e);
    assert.ok(err instanceof LlmError);
    assert.equal(err.kind, 'transient');
    assert.equal(calls, 2);
  } finally {
    setBedrockClientForTests(null);
    delete process.env.BEDROCK_MAX_ATTEMPTS;
  }
});

function mockRes(headersSent = false) {
  const res = {
    headersSent,
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
  };
  return res;
}
const req = { method: 'POST', path: '/api/x' } as never;

test('errorHandler always answers JSON {error, code} and never leaks internals', () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const r1 = mockRes();
    errorHandler(new Error('SELECT * FROM secret'), req, r1 as never, () => {});
    assert.equal(r1.statusCode, 500);
    assert.deepEqual(r1.body, { error: 'Internal server error', code: 'internal_error' });

    const r2 = mockRes();
    errorHandler(new LlmError('throttled', 'AI service is currently rate-limited.'), req, r2 as never, () => {});
    assert.equal(r2.statusCode, 429);
    assert.equal((r2.body as { code: string }).code, 'ai_throttled');

    const r3 = mockRes();
    errorHandler(Object.assign(new SyntaxError('bad'), { type: 'entity.parse.failed', status: 400 }), req, r3 as never, () => {});
    assert.equal(r3.statusCode, 400);

    const r4 = mockRes();
    errorHandler(new BadRequestError('nope'), req, r4 as never, () => {});
    assert.deepEqual(r4.body, { error: 'nope', code: 'bad_request' });

    let forwarded: unknown;
    const r5 = mockRes(true);
    const boom = new Error('late');
    errorHandler(boom, req, r5 as never, (e?: unknown) => { forwarded = e; });
    assert.equal(forwarded, boom);
    assert.equal(r5.body, undefined);
  } finally {
    console.error = quiet;
  }
});
