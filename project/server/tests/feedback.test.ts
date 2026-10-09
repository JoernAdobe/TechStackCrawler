import assert from 'node:assert/strict';
import test from 'node:test';
import { feedbackBodySchema, RATING_ONLY_DESCRIPTION } from '../src/routes/feedback.js';
import { safeDeckFilename } from '../src/routes/deck.js';
import { evenChunks } from '../src/services/deckSlides.js';

test('feedback: thumbs-only rating without description is accepted and marked', () => {
  const r = feedbackBodySchema.safeParse({ type: 'Praise', rating: 1, analysisId: 5 });
  assert.ok(r.success);
  assert.equal(r.data.description, RATING_ONLY_DESCRIPTION);
  assert.equal(r.data.rating, 1);
  assert.equal(r.data.analysisId, 5);
});

test('feedback: description required when no rating is given', () => {
  assert.equal(feedbackBodySchema.safeParse({ type: 'Bug', description: '   ' }).success, false);
  assert.equal(feedbackBodySchema.safeParse({ type: 'Bug' }).success, false);
});

test('feedback: rejects unknown type, invalid rating and oversize fields', () => {
  assert.equal(feedbackBodySchema.safeParse({ type: 'Spam', description: 'x' }).success, false);
  assert.equal(feedbackBodySchema.safeParse({ type: 'Bug', rating: 2, description: 'x' }).success, false);
  assert.equal(feedbackBodySchema.safeParse({ type: 'Bug', title: 'a'.repeat(201), description: 'x' }).success, false);
  assert.equal(feedbackBodySchema.safeParse({ type: 'Bug', description: 'a'.repeat(4001) }).success, false);
  assert.equal(feedbackBodySchema.safeParse({ type: 'Bug', description: 'x', analysisId: -1 }).success, false);
});

test('feedback: missing solutions are validated and limited to 20 rows', () => {
  const ok = feedbackBodySchema.safeParse({
    type: 'Bug: Missing Solution',
    description: 'Tealium not detected',
    missingSolutions: [{ url: 'https://example.com', solution: 'Tealium iQ', category: '' }],
  });
  assert.ok(ok.success);
  assert.deepEqual(ok.data.missingSolutions, [{ url: 'https://example.com', solution: 'Tealium iQ', category: undefined }]);

  const tooMany = Array.from({ length: 21 }, () => ({ solution: 'X' }));
  assert.equal(feedbackBodySchema.safeParse({ type: 'Bug: Missing Solution', description: 'x', missingSolutions: tooMany }).success, false);
  assert.equal(feedbackBodySchema.safeParse({ type: 'Bug: Missing Solution', description: 'x', missingSolutions: [{ solution: ' ' }] }).success, false);
});

test('feedback: empty missingSolutions array is dropped and title trimmed', () => {
  const r = feedbackBodySchema.safeParse({ type: 'Other', title: '  Hi  ', description: ' text ', missingSolutions: [] });
  assert.ok(r.success);
  assert.equal(r.data.title, 'Hi');
  assert.equal(r.data.description, 'text');
  assert.equal(r.data.missingSolutions, undefined);
});

test('deck: filename is sanitized', () => {
  assert.equal(safeDeckFilename('eaa-ACME "Group"/../x\r\n', 'f'), 'eaa-acme-group-x.pptx');
  assert.equal(safeDeckFilename('ÄÖÜ', 'fallback'), 'aou.pptx');
  assert.equal(safeDeckFilename('???', 'fallback'), 'fallback.pptx');
});

test('deck: evenChunks avoids orphan rows', () => {
  assert.deepEqual(evenChunks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 10).map((c) => c.length), [6, 5]);
  assert.deepEqual(evenChunks([1, 2, 3], 10).map((c) => c.length), [3]);
  assert.deepEqual(evenChunks([], 5), []);
});
