import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'kaipai';
const AUDIENCE = 'video-guest';
const PURPOSE = 'video-guest-invite';

export type GuestInvitePayload = {
  bookingId: number;
  inviterUserId: number;
  inviteId: string;
  expiresAt: Date;
};

function signingKey(secret: string): Uint8Array {
  if (secret.length < 16) {
    throw new Error('Guest invite signing secret is too short.');
  }
  return new TextEncoder().encode(secret);
}

/** Creates a signed, booking-scoped invitation. It contains no personal data. */
export async function signGuestInviteToken(
  payload: GuestInvitePayload,
  secret: string
): Promise<string> {
  return new SignJWT({
    purpose: PURPOSE,
    bookingId: payload.bookingId,
    inviterUserId: payload.inviterUserId,
    inviteId: payload.inviteId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(`booking:${payload.bookingId}`)
    .setIssuedAt()
    .setExpirationTime(Math.floor(payload.expiresAt.getTime() / 1000))
    .sign(signingKey(secret));
}

/** Verifies authenticity, expiry, purpose and the typed invitation payload. */
export async function verifyGuestInviteToken(
  token: string,
  secret: string
): Promise<Omit<GuestInvitePayload, 'expiresAt'> | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(secret), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (
      payload.purpose !== PURPOSE ||
      !Number.isInteger(payload.bookingId) ||
      !Number.isInteger(payload.inviterUserId) ||
      typeof payload.inviteId !== 'string' ||
      !payload.inviteId
    ) {
      return null;
    }
    return {
      bookingId: Number(payload.bookingId),
      inviterUserId: Number(payload.inviterUserId),
      inviteId: payload.inviteId,
    };
  } catch {
    return null;
  }
}
