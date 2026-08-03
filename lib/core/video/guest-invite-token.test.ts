import assert from 'node:assert/strict';
import test from 'node:test';
import {
  signGuestInviteToken,
  verifyGuestInviteToken,
} from './guest-invite-token';

const SECRET = 'test-secret-with-at-least-32-characters';

test('guest invitation round-trips without exposing personal data', async () => {
  const token = await signGuestInviteToken(
    {
      bookingId: 42,
      inviterUserId: 7,
      inviteId: 'invite-test',
      expiresAt: new Date(Date.now() + 60_000),
    },
    SECRET
  );
  const payload = await verifyGuestInviteToken(token, SECRET);
  assert.deepEqual(payload, {
    bookingId: 42,
    inviterUserId: 7,
    inviteId: 'invite-test',
  });
  assert.equal(token.includes('example@email.test'), false);
});

test('guest invitation rejects tampering, wrong secrets and expired tokens', async () => {
  const token = await signGuestInviteToken(
    {
      bookingId: 42,
      inviterUserId: 7,
      inviteId: 'invite-test',
      expiresAt: new Date(Date.now() + 60_000),
    },
    SECRET
  );
  const [header, payload, signature] = token.split('.');
  assert.ok(header && payload && signature);
  const tamperedSignature = `${
    signature.startsWith('a') ? 'b' : 'a'
  }${signature.slice(1)}`;
  const tampered = `${header}.${payload}.${tamperedSignature}`;
  assert.equal(await verifyGuestInviteToken(tampered, SECRET), null);
  assert.equal(
    await verifyGuestInviteToken(
      token,
      'another-test-secret-with-32-characters'
    ),
    null
  );

  const expired = await signGuestInviteToken(
    {
      bookingId: 42,
      inviterUserId: 7,
      inviteId: 'expired',
      expiresAt: new Date(Date.now() - 60_000),
    },
    SECRET
  );
  assert.equal(await verifyGuestInviteToken(expired, SECRET), null);
});
