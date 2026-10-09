import assert from 'node:assert/strict';
import test from 'node:test';
import { buildingBlocksFor, insightsFor, isAdobeSolution } from '../src/data/buildingBlocks.js';
import { buildSolutionMatrix, consistencyCode } from '../src/services/keyFindings.js';

test('consistencyCode folgt der EAA-Logik', () => {
  assert.equal(consistencyCode([[], []]), 0);
  assert.equal(consistencyCode([['GA'], ['GA']]), 1);
  assert.equal(consistencyCode([['GA'], []]), -1);
  assert.equal(consistencyCode([[], ['GA']]), -1);
  assert.equal(consistencyCode([['GA'], ['Adobe Analytics']]), -2);
  assert.equal(consistencyCode([['GA', 'Adobe Analytics'], ['GA']]), 2);
  assert.equal(consistencyCode([['GA']]), 1);
});

test('buildingBlocksFor: Kategorie-Mapping und Namens-Overrides', () => {
  assert.deepEqual(buildingBlocksFor('Google Analytics', ['Analytics']), ['Analytics']);
  assert.deepEqual(buildingBlocksFor('Braze', ['ESP/Marketing Automation']), ['Campaign Orchestration']);
  assert.deepEqual(buildingBlocksFor('Adobe Experience Cloud Identity Service (ECID)', ['Analytics']), ['Profile Resolution']);
  assert.deepEqual(buildingBlocksFor('Demandbase', ['Advertising']), ['3rd Party Data']);
  assert.deepEqual(buildingBlocksFor('Adobe Sign', ['Other']), ['Digital Signature']);
  assert.deepEqual(buildingBlocksFor('jQuery', ['JavaScript Framework']), []);
});

test('isAdobeSolution', () => {
  assert.equal(isAdobeSolution('Adobe Target'), true);
  assert.equal(isAdobeSolution('Marketo'), true);
  assert.equal(isAdobeSolution('Google Tag Manager'), false);
});

test('insightsFor liefert lösungsspezifische bzw. generische Texte', () => {
  assert.match(insightsFor('Tag Management', 1, ['Google Tag Manager'])[0], /GTM/);
  assert.match(insightsFor('DMP', 0, [])[0], /DMP/);
  assert.ok(insightsFor('Search', -2, ['A', 'B']).length > 0);
});

test('buildSolutionMatrix: Matrix, Key Findings, Other Technologies', () => {
  const m = buildSolutionMatrix([
    {
      url: 'https://a.example',
      detections: [
        { name: 'Google Tag Manager', categories: ['Tag Management'], confidence: 100 },
        { name: 'Adobe Analytics', categories: ['Analytics'], confidence: 100 },
        { name: 'jQuery', categories: ['JavaScript Framework'], confidence: 100 },
      ],
    },
    {
      url: 'https://b.example',
      label: 'Brand B',
      detections: [{ name: 'Google Tag Manager', categories: ['Tag Management'], confidence: 100 }],
    },
  ]);
  assert.equal(m.columns.length, 2);
  const tm = m.keyFindings.find((k) => k.buildingBlock === 'Tag Management')!;
  assert.equal(tm.code, 1);
  const an = m.keyFindings.find((k) => k.buildingBlock === 'Analytics')!;
  assert.equal(an.code, -1);
  const aaCell = m.rows.find((r) => r.buildingBlock === 'Analytics')!.cells[0].solutions[0];
  assert.equal(aaCell.isAdobe, true);
  assert.deepEqual(m.otherTechnologies, ['jQuery']);
  assert.equal(m.rows.some((r) => r.buildingBlock === 'Digital Signature'), false);
});

test('buildSolutionMatrix: schwache Signale zählen nicht für die Konsistenz', () => {
  const m = buildSolutionMatrix([
    { url: 'https://a.example', detections: [{ name: 'Optimizely', categories: ['Personalization & Optimization'], confidence: 50, weak: true }] },
  ]);
  const po = m.keyFindings.find((k) => k.buildingBlock === 'Personalization & Optimization')!;
  assert.equal(po.code, 0);
});
