import assert from 'node:assert/strict';
import test from 'node:test';
import { accountKeyForUrl, buildLibrary } from '../src/services/library.js';
import { toIsoTimestamp } from '../src/db/analyses.js';

test('accountKeyForUrl normalisiert Host ohne www, Pfad und Schema', () => {
  assert.equal(accountKeyForUrl('https://www.nike.com/de/'), 'nike.com');
  assert.equal(accountKeyForUrl('bmw.com'), 'bmw.com');
  assert.equal(accountKeyForUrl('HTTP://WWW.Otto.DE'), 'otto.de');
});

test('buildLibrary gruppiert nach Domain, sortiert alphabetisch, neueste Analyse zuerst', () => {
  const done = (jobId: number, score: number) => ({ jobId, status: 'done' as const, overallScore: score });
  const lib = buildLibrary([
    { id: 1, url: 'https://www.nike.com/de/', analyzedAt: '2026-02-26T12:55:32Z' },
    { id: 3, url: 'https://www.nike.com/de/', analyzedAt: '2026-03-02T11:21:23Z' },
    { id: 4, url: 'https://bmw.com/', analyzedAt: '2026-10-09T19:43:26Z', briefing: done(1, 63), companyName: 'BMW Group' },
    { id: 6, url: 'https://bmw.com/', analyzedAt: '2026-10-15T07:02:02Z' },
    { id: 7, url: 'https://audi.de/', analyzedAt: '2026-10-15T07:02:01Z', briefing: { jobId: 9, status: 'failed', overallScore: null } },
  ]);
  assert.deepEqual(lib.map((a) => a.name), ['audi.de', 'BMW Group', 'nike.com']);
  const bmw = lib[1];
  assert.equal(bmw.analysisCount, 2);
  assert.equal(bmw.latest.id, 6);
  assert.equal(bmw.briefing?.analysisId, 4);
  assert.equal(bmw.briefing?.overallScore, 63);
  assert.equal(lib[0].briefing, undefined, 'fehlgeschlagene Briefings zählen nicht');
  assert.deepEqual(lib[2].analyses.map((a) => a.id), [3, 1]);
});

test('toIsoTimestamp macht SQLite-Zeitstempel zu UTC-ISO', () => {
  assert.equal(toIsoTimestamp('2026-10-15 07:02:01'), '2026-10-15T07:02:01Z');
  assert.equal(toIsoTimestamp('2026-02-26T12:55:32.256Z'), '2026-02-26T12:55:32.256Z');
  assert.equal(toIsoTimestamp(new Date('2026-10-15T07:02:01Z')), '2026-10-15T07:02:01.000Z');
});
