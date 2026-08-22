import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/core/auth';
import { getCoachBookings } from '@/lib/core/bookings';
import { buildCoachAthletes } from '@/lib/core/bookings/coach-athletes';
import {
  MentalJourneyError,
  getMentalJourney,
} from '@/lib/core/ai-session-notes/mental-journey';
import { mentalJourneyDependencies } from '@/lib/core/ai-session-notes/mental-journey-store';
import {
  JOURNEY_PERIOD_LABELS,
  journeyPeriodSince,
  parseJourneyPeriod,
} from '@/lib/core/ai-session-notes/journey-period';

export const dynamic = 'force-dynamic';

/**
 * Il percorso di un atleta in un file di testo, per il coach che lo segue.
 *
 * È materiale clinico-adiacente su una persona, spesso minorenne: per questo
 * il file si apre con una riga che dice cos'è e a chi appartiene. Non è una
 * formalità — un file scaricato perde il contesto della schermata da cui è
 * uscito, e chi lo ritrova fra sei mesi in una cartella deve capirlo subito.
 *
 * Nessuna trascrizione e nessuna citazione: solo ciò che il coach ha già
 * approvato, cioè le stesse cose che vede sulla scheda.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ athleteId: string }> }
) {
  const user = await requireRole('coach');
  const athleteUserId = Number((await params).athleteId);
  if (!Number.isInteger(athleteUserId) || athleteUserId <= 0) {
    return NextResponse.json({ error: 'INVALID_ATHLETE' }, { status: 400 });
  }

  // Stessa barriera della pagina: l'autorizzazione nasce dai dati.
  const bookings = await getCoachBookings(user.id);
  const athlete = buildCoachAthletes(bookings).find(
    (candidate) => candidate.userId === athleteUserId
  );
  if (!athlete) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const period = parseJourneyPeriod(
    new URL(request.url).searchParams.get('periodo')
  );

  let journey;
  try {
    journey = await getMentalJourney(
      {
        athleteUserId,
        actorUserId: user.id,
        since: journeyPeriodSince(period, new Date()),
      },
      mentalJourneyDependencies()
    );
  } catch (error) {
    if (error instanceof MentalJourneyError) {
      return NextResponse.json({ error: error.code }, { status: 403 });
    }
    throw error;
  }

  const date = new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'long',
    timeZone: 'Europe/Rome',
  });
  const day = (iso: string | null) =>
    iso ? date.format(new Date(iso)) : 'senza data';

  /*
   * La provenienza, in testa e in chiaro.
   *
   * Il contenuto di questo documento e' prodotto da un sistema di
   * intelligenza artificiale a partire dalla trascrizione delle sedute.
   * L'art. 50 dell'AI Act, applicabile dal 2 agosto 2026, chiede che i
   * contenuti generati artificialmente siano riconoscibili come tali: un file
   * che esce dal prodotto e viaggia per posta o in una cartella deve dirlo da
   * solo, perche' fuori di qui non c'e' nessuna interfaccia a spiegarlo.
   *
   * Il commento HTML iniziale e' la parte leggibile da una macchina; le righe
   * sotto sono quella leggibile da una persona. Servono entrambe.
   */
  const lines: string[] = [
    '<!-- generator: KaiPai Session Compass -->',
    '<!-- content-provenance: ai-generated -->',
    `<!-- reviewed-by-human: coach ${user.id} -->`,
    `<!-- exported-at: ${new Date().toISOString()} -->`,
    '',
    `# Percorso di ${athlete.name}`,
    '',
    `> **Contenuto generato da un sistema di intelligenza artificiale** a partire`,
    `> dalla trascrizione delle sedute, e approvato dal coach prima della`,
    `> condivisione. Non e' una diagnosi e non contiene decisioni automatizzate.`,
    '',
    `Documento riservato al coach. Contiene solo riepiloghi già approvati.`,
    `Finestra: ${JOURNEY_PERIOD_LABELS[period]} · Sedute approvate: ${journey.summary.approvedSessionCount}`,
    `Generato il ${date.format(new Date())}`,
    '',
    '## Impegni',
    `Totali ${journey.summary.commitments.total} · Completati ${journey.summary.commitments.completed} · In corso ${journey.summary.commitments.inProgress} · Da iniziare ${journey.summary.commitments.pending} · Non completati ${journey.summary.commitments.skipped}`,
    '',
  ];

  if (journey.recurringThemes.length > 0) {
    lines.push('## Temi ricorrenti', '');
    for (const theme of journey.recurringThemes) {
      lines.push(
        `- ${theme.label} — in ${theme.occurrences} sedute su ${journey.summary.approvedSessionCount}`
      );
    }
    lines.push('');
  }

  lines.push('## Sedute', '');
  for (const entry of journey.timeline) {
    lines.push(`### ${day(entry.sessionDate)}`);
    if (entry.focus) lines.push(`Tema principale: ${entry.focus}`);
    lines.push(entry.summary, '');
  }

  const fileName = `percorso-${athlete.name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')}.md`;

  return new NextResponse(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      // Un percorso non si mette in cache da nessuna parte.
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
