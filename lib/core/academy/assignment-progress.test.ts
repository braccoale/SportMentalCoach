import assert from 'node:assert/strict';
import test from 'node:test';
import { computeAssignmentStatus } from './assignment-progress';

test('a course with no modules is assigned, never completed', () => {
  assert.equal(computeAssignmentStatus([], []), 'assigned');
});

test('zero modules completed is assigned', () => {
  assert.equal(computeAssignmentStatus([1, 2, 3], []), 'assigned');
});

test('some but not all modules completed is in_progress', () => {
  assert.equal(computeAssignmentStatus([1, 2, 3], [1]), 'in_progress');
  assert.equal(computeAssignmentStatus([1, 2, 3], [1, 2]), 'in_progress');
});

test('every module completed is completed', () => {
  assert.equal(computeAssignmentStatus([1, 2, 3], [1, 2, 3]), 'completed');
});

test('completion ids not in the current module set do not count', () => {
  assert.equal(computeAssignmentStatus([1, 2, 3], [1, 2, 4]), 'in_progress');
});

test('a module added after completion reopens the assignment', () => {
  assert.equal(computeAssignmentStatus([1, 2], [1, 2]), 'completed');
  assert.equal(computeAssignmentStatus([1, 2, 3], [1, 2]), 'in_progress');
});
