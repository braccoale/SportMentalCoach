import 'server-only';
import { getUser } from '@/lib/core/auth';
import { getCoachCalendar, type CalendarKind } from '@/lib/core/coach-calendar';

export const dynamic = 'force-dynamic';

/**
 * Giorni e orari prenotabili di un coach, per la finestra di prenotazione che
 * si è appena aperta.
 *
 *   /api/coaches/<slug>/calendar?kind=intro   la sessione conoscitiva (pubblica)
 *   /api/coaches/<slug>/calendar?kind=book    le date che l'atleta può usare
 *
 * `book` dipende da chi chiede (sedute rimaste, scadenze): non si mette mai in
 * una cache condivisa. `intro` mostra ciò che mostra già il profilo del coach.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const kind = new URL(request.url).searchParams.get('kind');
  if ((kind !== 'intro' && kind !== 'book') || !/^[a-z0-9-]{1,120}$/.test(slug)) {
    return Response.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  const user = await getUser();
  if (kind === 'book' && !user) {
    return Response.json({ error: 'Accedi per prenotare.' }, { status: 401 });
  }

  try {
    const calendar = await getCoachCalendar({
      slug,
      kind: kind as CalendarKind,
      viewerUserId: user?.id ?? null,
    });
    if (!calendar) return Response.json({ error: 'Coach non trovato.' }, { status: 404 });
    return Response.json(calendar, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[calendar] calendario non calcolato', {
      slug,
      kind,
      reason: error instanceof Error ? error.message : 'sconosciuto',
    });
    return Response.json({ error: 'Calendario non disponibile.' }, { status: 500 });
  }
}
