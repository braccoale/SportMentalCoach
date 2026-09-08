import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFeatureMatrixSubmission } from './matrix-form';

const packages = [
  { id: 1, name: 'Starter' },
  { id: 2, name: 'Elite' },
];

test('a checked boolean cell becomes an entry with value null', () => {
  const features = [{ code: 'AI_SESSION_NOTES', label: 'Appunti AI', type: 'boolean' as const }];
  const fields = new Map([['cell_1_AI_SESSION_NOTES', 'on']]);
  const result = parseFeatureMatrixSubmission({
    packages,
    features,
    getField: (name) => fields.get(name) ?? null,
  });
  assert.deepEqual(result, {
    entries: [{ packageId: 1, featureCode: 'AI_SESSION_NOTES', value: null }],
  });
});

test('an unchecked boolean cell produces no entry', () => {
  const features = [{ code: 'AI_SESSION_NOTES', label: 'Appunti AI', type: 'boolean' as const }];
  const result = parseFeatureMatrixSubmission({
    packages: [{ id: 1, name: 'Starter' }],
    features,
    getField: () => null,
  });
  assert.deepEqual(result, { entries: [] });
});

test('a blank numeric cell means unlimited: an entry with value null', () => {
  const features = [{ code: 'AI_SEARCH_LIMIT', label: 'Ricerche AI', type: 'numeric' as const }];
  const result = parseFeatureMatrixSubmission({
    packages: [{ id: 1, name: 'Starter' }],
    features,
    getField: () => '',
  });
  assert.deepEqual(result, {
    entries: [{ packageId: 1, featureCode: 'AI_SEARCH_LIMIT', value: null }],
  });
});

test('a numeric cell with a value becomes an entry carrying that number', () => {
  const features = [{ code: 'AI_SEARCH_LIMIT', label: 'Ricerche AI', type: 'numeric' as const }];
  const fields = new Map([['cell_1_AI_SEARCH_LIMIT', '300']]);
  const result = parseFeatureMatrixSubmission({
    packages: [{ id: 1, name: 'Starter' }],
    features,
    getField: (name) => fields.get(name) ?? null,
  });
  assert.deepEqual(result, {
    entries: [{ packageId: 1, featureCode: 'AI_SEARCH_LIMIT', value: 300 }],
  });
});

test('a negative numeric value is rejected with a message naming the feature and package', () => {
  const features = [{ code: 'AI_SEARCH_LIMIT', label: 'Ricerche AI', type: 'numeric' as const }];
  const fields = new Map([['cell_1_AI_SEARCH_LIMIT', '-5']]);
  const result = parseFeatureMatrixSubmission({
    packages: [{ id: 1, name: 'Starter' }],
    features,
    getField: (name) => fields.get(name) ?? null,
  });
  assert.deepEqual(result, {
    error: 'Valore non valido per Ricerche AI — Starter.',
  });
});

test('a non-numeric value is rejected the same way', () => {
  const features = [{ code: 'AI_SEARCH_LIMIT', label: 'Ricerche AI', type: 'numeric' as const }];
  const fields = new Map([['cell_1_AI_SEARCH_LIMIT', 'abc']]);
  const result = parseFeatureMatrixSubmission({
    packages: [{ id: 1, name: 'Starter' }],
    features,
    getField: (name) => fields.get(name) ?? null,
  });
  assert.deepEqual(result, {
    error: 'Valore non valido per Ricerche AI — Starter.',
  });
});

test('every package × feature combination is visited, in order', () => {
  const features = [
    { code: 'F1', label: 'F1', type: 'boolean' as const },
    { code: 'F2', label: 'F2', type: 'boolean' as const },
  ];
  const fields = new Map([
    ['cell_1_F1', 'on'],
    ['cell_2_F2', 'on'],
  ]);
  const result = parseFeatureMatrixSubmission({
    packages,
    features,
    getField: (name) => fields.get(name) ?? null,
  });
  assert.deepEqual(result, {
    entries: [
      { packageId: 1, featureCode: 'F1', value: null },
      { packageId: 2, featureCode: 'F2', value: null },
    ],
  });
});
