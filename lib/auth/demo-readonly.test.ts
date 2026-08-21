import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_READONLY_MESSAGE,
  DemoReadOnlyError,
  assertDemoWriteAllowed,
  isDemoReadOnlyError,
} from './demo-readonly';

test('gli account normali possono usare anche metodi di scrittura', () => {
  assert.doesNotThrow(() => assertDemoWriteAllowed({ isDemo: false }, 'POST'));
  assert.doesNotThrow(() => assertDemoWriteAllowed({ isDemo: false }, 'DELETE'));
});

test('gli account demo possono soltanto leggere', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.doesNotThrow(() => assertDemoWriteAllowed({ isDemo: true }, method));
  }

  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.throws(
      () => assertDemoWriteAllowed({ isDemo: true }, method),
      (error) => {
        assert.equal(isDemoReadOnlyError(error), true);
        assert.equal((error as DemoReadOnlyError).status, 403);
        assert.equal((error as DemoReadOnlyError).message, DEMO_READONLY_MESSAGE);
        return true;
      }
    );
  }
});
