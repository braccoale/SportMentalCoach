import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  buildInviteUrl,
  firstNameForDisplay,
  generateInviteCode,
  isValidCodeFormat,
  normaliseCode,
} from './code';

test('generateInviteCode: fixed length, alphabet-only, no ambiguous chars', () => {
  for (let i = 0; i < 500; i++) {
    const code = generateInviteCode();
    assert.equal(code.length, CODE_LENGTH);
    for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch), `bad char ${ch}`);
    assert.ok(!/[01IO]/.test(code), 'contains an ambiguous character');
  }
});

test('generateInviteCode: codes are unique across a large batch', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) seen.add(generateInviteCode());
  // Collisions are astronomically unlikely (32^8 space); a broken generator
  // (e.g. constant output) would fail this hard.
  assert.ok(seen.size > 1990, `too many collisions: ${seen.size}/2000`);
});

test('isValidCodeFormat: accepts real codes, rejects junk', () => {
  assert.equal(isValidCodeFormat('AB23K9XQ'), true);
  assert.equal(isValidCodeFormat('ab23k9xq'), false); // lowercase
  assert.equal(isValidCodeFormat('AB23K9X'), false); // too short
  assert.equal(isValidCodeFormat('AB23K9XQZ'), false); // too long
  assert.equal(isValidCodeFormat('AB23K9X0'), false); // ambiguous 0
  assert.equal(isValidCodeFormat('AB23K9XI'), false); // ambiguous I
  assert.equal(isValidCodeFormat('../etcpw'), false); // path junk
  assert.equal(isValidCodeFormat(''), false);
});

test('normaliseCode: trims and uppercases', () => {
  assert.equal(normaliseCode('  ab23k9xq '), 'AB23K9XQ');
});

test('firstNameForDisplay: first name only, never leaks the rest', () => {
  assert.equal(firstNameForDisplay('Mario Rossi'), 'Mario');
  assert.equal(firstNameForDisplay('  Anna   Maria  Bianchi '), 'Anna');
  assert.equal(firstNameForDisplay('Mario'), 'Mario');
  assert.equal(firstNameForDisplay(''), null);
  assert.equal(firstNameForDisplay('   '), null);
  assert.equal(firstNameForDisplay(null), null);
  assert.equal(firstNameForDisplay(undefined), null);
  // Privacy: a surname present in the input must not appear in the output.
  const out = firstNameForDisplay('Giulia Verdi');
  assert.ok(!(out ?? '').includes('Verdi'));
});

test('buildInviteUrl: joins base + code, tolerates a trailing slash', () => {
  assert.equal(
    buildInviteUrl('AB23K9XQ', 'https://kaipai.it'),
    'https://kaipai.it/invita/AB23K9XQ'
  );
  assert.equal(
    buildInviteUrl('AB23K9XQ', 'https://kaipai.it/'),
    'https://kaipai.it/invita/AB23K9XQ'
  );
});
