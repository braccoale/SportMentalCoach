import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_LOGIN_ACCOUNTS,
  isInteractiveDemoIdentity,
  parseDemoLoginRole,
} from './demo-login';

test('accetta soltanto i due ruoli pubblici della demo', () => {
  assert.equal(parseDemoLoginRole('coach'), 'coach');
  assert.equal(parseDemoLoginRole('athlete'), 'athlete');
  assert.equal(parseDemoLoginRole('admin'), null);
  assert.equal(parseDemoLoginRole(null), null);
});

test('verifica email e app_metadata non modificabili dall’utente', () => {
  const coach = {
    email: DEMO_LOGIN_ACCOUNTS.coach.email,
    app_metadata: {
      kaipai_demo: true,
      demo_readonly: true,
      interactive_demo: true,
      demo_role: 'coach',
    },
  };
  assert.equal(isInteractiveDemoIdentity(coach, 'coach'), true);
  assert.equal(isInteractiveDemoIdentity(coach, 'athlete'), false);
  assert.equal(
    isInteractiveDemoIdentity(
      { ...coach, app_metadata: { ...coach.app_metadata, demo_readonly: false } },
      'coach'
    ),
    false
  );
});
