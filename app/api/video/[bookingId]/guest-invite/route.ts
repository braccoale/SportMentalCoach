import { getApiUser } from '@/lib/auth/api-user';
import { getAppBaseUrl } from '@/lib/core/app-url';
import { createGuestInviteToken } from '@/lib/core/video';

/**
 * Un invito per un ospite, chiesto dall'app.
 *
 * Il web genera lo stesso invito con una server action, che un'applicazione
 * nativa non può invocare: le server action vivono nel protocollo di Next e
 * non sono un'API. Questa rotta è il medesimo nucleo — `createGuestInviteToken`
 * — dietro HTTP, non una seconda implementazione: le regole su chi può
 * invitare, quando, e per quanto tempo restano scritte una volta sola.
 *
 * L'URL condiviso non contiene mai una credenziale LiveKit. L'ospite scambia
 * il token per un accesso di breve durata soltanto quando la finestra della
 * sessione è aperta, e il controllo lo fa il server.
 */
const ERROR_BY_REASON: Record<string, string> = {
  unauthorized: 'Sessione non trovata o non autorizzata.',
  closed: 'Puoi invitare un ospite solo a una sessione confermata.',
  past: 'Questa sessione è già trascorsa.',
  not_configured: 'La funzione video non è configurata.',
  guardian_required:
    'La sessione è bloccata: manca un’autorizzazione valida del tutore.',
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const user = await getApiUser(request);
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }

  const bookingId = Number((await params).bookingId);
  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return Response.json({ error: 'Sessione non valida.' }, { status: 400 });
  }

  const baseUrl = getAppBaseUrl();
  if (!baseUrl) {
    return Response.json(
      { error: 'Indirizzo pubblico di KaiPai non configurato.' },
      { status: 500 }
    );
  }

  const result = await createGuestInviteToken(bookingId, user.id);
  if (!result.ok) {
    return Response.json(
      { error: ERROR_BY_REASON[result.reason] ?? 'Invito non disponibile.' },
      { status: 403 }
    );
  }

  const url = new URL('/video/join', baseUrl);
  url.searchParams.set('invite', result.token);

  return Response.json({
    url: url.toString(),
    expiresAt: result.expiresAt.toISOString(),
  });
}
