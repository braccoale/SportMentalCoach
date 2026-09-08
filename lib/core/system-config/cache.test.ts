import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONFIG_CACHE_TTL_MS,
  isCacheEntryValid,
  makeCacheEntry,
} from './cache';

test('a missing entry is never valid', () => {
  assert.equal(isCacheEntryValid(undefined, 1000), false);
});

test('an entry within its TTL is valid', () => {
  const entry = makeCacheEntry('valore', 1000);
  assert.equal(isCacheEntryValid(entry, 1000 + CONFIG_CACHE_TTL_MS - 1), true);
});

test('an entry past its TTL is not valid', () => {
  const entry = makeCacheEntry('valore', 1000);
  assert.equal(isCacheEntryValid(entry, 1000 + CONFIG_CACHE_TTL_MS), false);
});

test('a custom TTL is honoured', () => {
  const entry = makeCacheEntry(42, 1000, 5000);
  assert.equal(isCacheEntryValid(entry, 1000 + 4999), true);
  assert.equal(isCacheEntryValid(entry, 1000 + 5000), false);
});
