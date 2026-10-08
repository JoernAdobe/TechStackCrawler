import assert from 'node:assert/strict';
import test from 'node:test';
import { scrapePage } from '../src/services/scraper.js';

test('scrapePage rejects loopback targets before starting the worker', async () => {
  await assert.rejects(
    scrapePage('http://127.0.0.1'),
    /Blocked unsafe or unresolved target URL/,
  );
});

test('scrapePage rejects IPv6 loopback targets before starting the worker', async () => {
  await assert.rejects(
    scrapePage('http://[::1]'),
    /Blocked unsafe or unresolved target URL/,
  );
});
