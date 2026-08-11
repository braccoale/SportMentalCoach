import { getApiUser } from '@/lib/auth/api-user';
import { registerDevice, unregisterDevice } from '@/lib/core/push/native';

/**
 * Il dispositivo si presenta: «sono io, mandami le notifiche qui».
 *
 * Chiamata a ogni avvio dell'app, non solo la prima volta: i token di consegna
 * ruotano da soli, e un token vecchio è un indirizzo che non risponde più.
 * Ripresentarsi ogni volta è il modo più semplice per non accorgersene mai.
 */
export async function POST(request: Request) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
    platform?: unknown;
    deviceId?: unknown;
    appVersion?: unknown;
  } | null;

  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return Response.json({ error: 'token_required' }, { status: 400 });
  }

  const str = (value: unknown) =>
    typeof value === 'string' && value.trim() ? value.trim() : null;

  await registerDevice(user.id, {
    token,
    platform: str(body?.platform),
    deviceId: str(body?.deviceId),
    appVersion: str(body?.appVersion),
  });

  return Response.json({ ok: true });
}

/**
 * All'uscita dall'account il telefono smette di essere un recapito valido.
 * Senza questo, chi esce continuerebbe a ricevere le notifiche di un account
 * a cui non ha più accesso — su un telefono che magari ha prestato.
 */
export async function DELETE(request: Request) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
  } | null;
  const token = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return Response.json({ error: 'token_required' }, { status: 400 });
  }

  await unregisterDevice(token);
  return Response.json({ ok: true });
}
