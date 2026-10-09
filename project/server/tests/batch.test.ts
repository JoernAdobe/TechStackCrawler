import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBatchItems, normalizeBatchUrl, parseBatchInput } from '../src/services/batchInput.js';
import { buildStackHistory, computeStackDelta, normalizeHostname } from '../src/services/stackHistory.js';
import { batchToCsv, csvCell } from '../src/services/batchExport.js';
import { buildSolutionMatrix } from '../src/services/keyFindings.js';
import type { BatchJob } from '../src/types/parity.js';

test('parseBatchInput: plain lines, normalisation and dedupe', () => {
  const { items, errors } = parseBatchInput('example.com\nhttps://www.example.com/\n\n# comment\nfoo.de/shop');
  assert.deepEqual(errors, []);
  assert.deepEqual(items, [{ url: 'https://example.com/' }, { url: 'https://foo.de/shop' }]);
});

test('parseBatchInput: "url, label" and tab-separated lines', () => {
  const { items, errors } = parseBatchInput('adobe.com, Adobe\nbmw.de\tBMW Germany');
  assert.deepEqual(errors, []);
  assert.deepEqual(items, [
    { url: 'https://adobe.com/', label: 'Adobe' },
    { url: 'https://bmw.de/', label: 'BMW Germany' },
  ]);
});

test('parseBatchInput: CSV with header and swapped columns', () => {
  const csv = 'Brand,URL\n"Brand A",a.example.com\nÖsterreich,https://b.example.at/de\n';
  const { items, errors } = parseBatchInput(csv);
  assert.deepEqual(errors, []);
  assert.deepEqual(items, [
    { url: 'https://a.example.com/', label: 'Brand A' },
    { url: 'https://b.example.at/de', label: 'Österreich' },
  ]);
});

test('parseBatchInput: header url only, title column alias', () => {
  const { items } = parseBatchInput('url;title\nexample.org;Home');
  assert.deepEqual(items, [{ url: 'https://example.org/', label: 'Home' }]);
});

test('parseBatchInput: invalid URLs and labels produce errors', () => {
  const { items, errors } = parseBatchInput('localhost\nhttp://10.0.0.1\nexample.com, -bad\nnot a url\nok.com');
  assert.deepEqual(items, [{ url: 'https://ok.com/' }]);
  assert.equal(errors.length, 4);
  assert.match(errors[2], /must start with a letter/);
});

test('parseBatchInput: caps at maximum', () => {
  const text = Array.from({ length: 1005 }, (_, i) => `site${i}.com`).join('\n');
  const { items, errors } = parseBatchInput(text);
  assert.equal(items.length, 1000);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /maximum is 1000/);
});

test('normalizeBatchItems / normalizeBatchUrl', () => {
  assert.equal(normalizeBatchUrl('ftp://example.com'), null);
  assert.equal(normalizeBatchUrl('example.com/#top'), 'https://example.com/');
  const { items } = normalizeBatchItems([{ url: 'a.com', label: ' X ' }, { url: 'A.com/' }], 30);
  assert.deepEqual(items, [{ url: 'https://a.com/', label: 'X' }]);
});

test('normalizeHostname strips www and scheme', () => {
  assert.equal(normalizeHostname('https://www.Example.com/path'), 'example.com');
  assert.equal(normalizeHostname('shop.example.com'), 'shop.example.com');
  assert.equal(normalizeHostname('nohost'), null);
});

test('computeStackDelta', () => {
  assert.deepEqual(computeStackDelta(['A', 'B', 'C'], ['B', 'D', 'C']), {
    added: ['D'],
    removed: ['A'],
    unchanged: ['B', 'C'],
  });
});

test('buildStackHistory: filters host, ignores weak, sorts and diffs', () => {
  const det = (names: string[], weak: string[] = []) =>
    JSON.stringify({
      rawDetections: [
        ...names.map((name) => ({ name, categories: [], confidence: 100 })),
        ...weak.map((name) => ({ name, categories: [], confidence: 30, weak: true })),
      ],
    });
  const result = buildStackHistory('example.com', [
    { id: 3, url: 'https://example.com/', analyzed_at: '2026-05-01 10:00:00', result_json: det(['Adobe Analytics', 'AEM']) },
    { id: 1, url: 'https://www.example.com', analyzed_at: '2025-01-01T10:00:00.000Z', result_json: det(['Google Analytics', 'AEM'], ['Hotjar']) },
    { id: 2, url: 'https://notexample.com', analyzed_at: '2025-06-01T10:00:00.000Z', result_json: det(['X']) },
    { id: 4, url: 'https://example.com/a', analyzed_at: '2026-01-01T10:00:00.000Z', result_json: '{broken' },
  ]);
  assert.deepEqual(result.entries.map((e) => e.analysisId), [1, 3]);
  assert.deepEqual(result.entries[0].technologies, ['AEM', 'Google Analytics']);
  assert.equal(result.entries[1].analyzedAt, '2026-05-01T10:00:00.000Z');
  assert.deepEqual(result.delta, {
    previousAnalysisId: 1,
    added: ['Adobe Analytics'],
    removed: ['Google Analytics'],
    unchanged: ['AEM'],
  });
  assert.equal(buildStackHistory('example.com', []).delta, undefined);
});

test('batchToCsv: one row per URL, solutions joined, formula-safe', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('-1'), '-1');
  const detections = [
    { name: 'Adobe Analytics', categories: ['Analytics'], confidence: 100 },
    { name: 'Google Analytics', categories: ['Analytics'], confidence: 100 },
    { name: 'jQuery', categories: ['JavaScript Libraries'], confidence: 100 },
  ];
  const batch: BatchJob = {
    id: 7,
    kind: 'account',
    title: 'Test',
    aiAnalysis: false,
    status: 'completed',
    createdAt: '',
    updatedAt: '',
    total: 1,
    done: 1,
    failed: 0,
    items: [{ id: 1, url: 'https://a.com/', label: 'A', status: 'done', detections }],
    matrix: buildSolutionMatrix([{ url: 'https://a.com/', label: 'A', detections }]),
  };
  const csv = batchToCsv(batch);
  assert.match(csv, /Adobe Analytics \| Google Analytics/);
  assert.match(csv, /Key Findings/);
  assert.match(csv, /jQuery/);
});
