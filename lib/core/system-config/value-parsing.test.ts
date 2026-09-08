import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSystemConfigValue } from './value-parsing';

test('a valid number string parses to a number', () => {
  const result = parseSystemConfigValue('number', '42');
  assert.deepEqual(result, { ok: true, value: 42 });
});

test('a non-numeric string is rejected for a number field', () => {
  const result = parseSystemConfigValue('number', 'abc');
  assert.equal(result.ok, false);
});

test('an empty string is rejected for a number field', () => {
  const result = parseSystemConfigValue('number', '');
  assert.equal(result.ok, false);
});

test('zero is rejected for a number field', () => {
  const result = parseSystemConfigValue('number', '0');
  assert.equal(result.ok, false);
});

test('a negative number is rejected for a number field', () => {
  const result = parseSystemConfigValue('number', '-5');
  assert.equal(result.ok, false);
});

test('a checked checkbox parses to true', () => {
  const result = parseSystemConfigValue('boolean', 'on');
  assert.deepEqual(result, { ok: true, value: true });
});

test('an unchecked checkbox (empty string) parses to false', () => {
  const result = parseSystemConfigValue('boolean', '');
  assert.deepEqual(result, { ok: true, value: false });
});

test('a string field keeps the raw value as-is', () => {
  const result = parseSystemConfigValue('string', '  con spazi  ');
  assert.deepEqual(result, { ok: true, value: '  con spazi  ' });
});
