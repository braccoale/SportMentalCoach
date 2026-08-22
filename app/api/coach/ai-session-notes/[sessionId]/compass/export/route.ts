import { NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { getCoachBookings, getParticipantBooking } from '@/lib/core/bookings';
import { buildCoachAthletes } from '@/lib/core/bookings/coach-athletes';
import { findTaxonomyItem, getVerticalConfig } from '@/lib/core/config';
import { getSessionDurationMinutes } from '@/lib/core/format';
import { loadConversationMap } from '@/lib/core/ai-session-notes/conversation-map-loader';
import { getSessionCompass } from '@/lib/core/ai-session-notes/session-compass';
import { sessionCompassDependencies } from '@/lib/core/ai-session-notes/session-compass-runtime';
import { loadKaiPaiPdfLogo, loadPdfAvatar } from '@/lib/core/ai-session-notes/pdf-assets';
import {
  buildSessionPdf,
  sessionPdfDownloadHeaders,
  sessionPdfFileName,
} from '@/lib/core/ai-session-notes/session-pdf';
import {
  authenticatedCompassRequest,
  compassErrorResponse,
} from '../request';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Esporta esclusivamente la versione approvata del report di una seduta.
 *
 * La stessa policy del Compass verifica che l'attore sia il coach titolare;
 * la prenotazione viene poi riletta con il predicato partecipante. Nessuna
 * trascrizione e nessuna nota privata entrano nel documento.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authenticated = await authenticatedCompassRequest(getUser, params);
  if (authenticated instanceof Response) return authenticated;

  try {
    const dependencies = sessionCompassDependencies();
    const report = await getSessionCompass(authenticated, dependencies);
    if (!report) {
      return NextResponse.json({ error: 'REPORT_NOT_FOUND' }, { status: 404 });
    }
    if (!report.isApproved || !report.document) {
      return NextResponse.json(
        {
          error: 'REPORT_NOT_APPROVED',
          message: 'Approva il riepilogo prima di esportarlo in PDF.',
        },
        { status: 409 }
      );
    }

    const session = await dependencies.store.loadSession(authenticated.sessionId);
    if (!session) {
      return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });
    }
    const bookingId = session.bookingId;
    if (typeof bookingId !== 'number' || !Number.isInteger(bookingId)) {
      return NextResponse.json({ error: 'SESSION_NOT_FOUND' }, { status: 404 });
    }
    const booking = await getParticipantBooking(
      bookingId,
      authenticated.actorUserId
    );
    if (!booking || booking.viewerRole !== 'coach') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }

    const generatedAt = new Date();
    const [coachBookings, conversationMap, logoBytes] = await Promise.all([
      getCoachBookings(authenticated.actorUserId),
      loadConversationMap(authenticated.sessionId).catch(() => null),
      loadKaiPaiPdfLogo(),
    ]);
    const athlete = buildCoachAthletes(coachBookings, generatedAt).find(
      (candidate) => candidate.userId === booking.athleteUserId
    );
    if (!athlete) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    const avatarBytes = await loadPdfAvatar(athlete.avatarUrl);
    const vertical = getVerticalConfig();
    const sportLabel = athlete.sport
      ? (findTaxonomyItem(vertical.taxonomies.categories, athlete.sport)?.label ??
        athlete.sport)
      : null;
    const levelLabel = athlete.level
      ? (findTaxonomyItem(vertical.taxonomies.levels ?? [], athlete.level)?.label ??
        athlete.level)
      : null;
    const actualDuration = getSessionDurationMinutes(
      booking.sessionStartedAt,
      booking.sessionEndedAt
    );
    const sessionDate = booking.scheduledFor ?? generatedAt;
    const pdfBytes = await buildSessionPdf({
      athleteName: athlete.name,
      coachName: booking.coachName?.trim() || session.coachName,
      sessionDate: booking.scheduledFor,
      sessionDurationMinutes: actualDuration ?? booking.durationMin,
      serviceTitle: booking.serviceTitle,
      generatedAt,
      athlete: {
        age: athlete.age,
        sportLabel,
        levelLabel,
        avatarBytes,
      },
      report,
      conversationMap,
      logoBytes,
    });
    const fileName = sessionPdfFileName(athlete.name, sessionDate);

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: sessionPdfDownloadHeaders(fileName),
    });
  } catch (error) {
    return compassErrorResponse(error);
  }
}
