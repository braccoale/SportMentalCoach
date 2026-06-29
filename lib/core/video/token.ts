import { AccessToken } from 'livekit-server-sdk';

/**
 * Mints a LiveKit access token (server-side only). Pure helper — takes the
 * credentials explicitly so it can be unit-tested without env/DB.
 */
export async function mintAccessToken(opts: {
  apiKey: string;
  apiSecret: string;
  room: string;
  identity: string;
  name?: string;
}): Promise<string> {
  const at = new AccessToken(opts.apiKey, opts.apiSecret, {
    identity: opts.identity,
    name: opts.name,
    // short-lived token; the page re-mints on load
    ttl: '1h',
  });
  at.addGrant({
    roomJoin: true,
    room: opts.room,
    canPublish: true,
    canSubscribe: true,
  });
  return at.toJwt();
}
