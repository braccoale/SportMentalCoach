import assert from 'node:assert/strict';
import test from 'node:test';
import { courseTotalHours } from './course-hours';

test('sums module hours, including decimals', () => {
  assert.equal(courseTotalHours([{ hours: 1.5 }, { hours: 2 }, { hours: 3 }]), 6.5);
});

test('a course with no modules has zero hours', () => {
  assert.equal(courseTotalHours([]), 0);
});

test('a non-finite hours value is treated as zero instead of poisoning the sum', () => {
  assert.equal(courseTotalHours([{ hours: 2 }, { hours: Number.NaN }]), 2);
});
