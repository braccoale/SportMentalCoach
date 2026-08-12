import { getApiUser } from '@/lib/auth/api-user';
import { cancelBooking, rescheduleBooking } from '@/lib/core/bookings';
import { buildAthleteCallLink } from '@/lib/core/video/athlete-call-link';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';

/**
 * Le azioni su una prenotazione, dall'app.
 *
 * Una rotta sola con un campo `action`, invece di tre rotte quasi identiche:
 * sono tre varianti dello stesso gesto — «fai qualcosa a questa prenotazione»
 * — e tenerle insieme evita che la prossima nasca in un quarto posto con
 * controlli leggermente diversi.
 *
 * Le regole non sono qui: annullare, spostare e generare il collegamento sono
 * gli stessi `cancelBooking`, `rescheduleBooking` e `createAthleteCallLink` che
 * usa il web. Chi puo' fare cosa, entro quale finestra, con quali conflitti di
 * calendario resta scritto una volta sola.
 */
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

  let body: { action?: unknown; scheduledFor?: unknown; durationMin?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  if (body.action === 'cancel') {
    const dependencies = createProductionAiSessionNotesDependencies();
    const result = await cancelBooking(
      { bookingId, userId: user.id },
      dependencies.liveKit
    );
    return result.ok
      ? Response.json({ ok: true })
      : Response.json({ error: result.error }, { status: 400 });
  }

  if (body.action === 'reschedule') {
    if (typeof body.scheduledFor !== 'string') {
      return Response.json({ error: 'Data non valida.' }, { status: 400 });
    }
    const scheduledFor = new Date(body.scheduledFor);
    if (Number.isNaN(scheduledFor.getTime())) {
      return Response.json({ error: 'Data non valida.' }, { status: 400 });
    }
    const result = await rescheduleBooking({
      bookingId,
      userId: user.id,
      scheduledFor,
      durationMin:
        typeof body.durationMin === 'number' ? body.durationMin : undefined,
    });
    return result.ok
      ? Response.json({ ok: true })
      : Response.json({ error: result.error }, { status: 400 });
  }

  if (body.action === 'athlete-link') {
    /*
     * Il collegamento per l'atleta non contiene credenziali: e' il percorso
     * autenticato normale, e chi lo apre deve comunque entrare col proprio
     * account e superare i controlli del server. Serve al coach per rimandarlo
     * quando all'altro e' caduta la linea — non e' una scorciatoia d'accesso.
     */
    const result = await buildAthleteCallLink(bookingId, user.id);
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    const origin = new URL(request.url).origin;
    return Response.json({ url: `${origin}${result.path}` });
  }

  return Response.json({ error: 'Azione sconosciuta.' }, { status: 400 });
}
