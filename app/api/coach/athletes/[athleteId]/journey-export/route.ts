import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/core/auth';
import { getCoachBookings } from '@/lib/core/bookings';
import {
  buildCoachAthleteSessionStats,
  buildCoachAthletes,
} from '@/lib/core/bookings/coach-athletes';
import { findTaxonomyItem, getVerticalConfig } from '@/lib/core/config';
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
import {
  buildMentalJourneyPdf,
  journeyPdfDownloadHeaders,
  journeyPdfFileName,
} from '@/lib/core/ai-session-notes/journey-pdf';

export const dynamic = 'force-dynamic';

/**
 * Il percorso di un atleta in un PDF leggibile e presentabile, per il coach
 * che lo segue.
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
  const generatedAt = new Date();
  const athlete = buildCoachAthletes(bookings, generatedAt).find(
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
        since: journeyPeriodSince(period, generatedAt),
      },
      mentalJourneyDependencies()
    );
  } catch (error) {
    if (error instanceof MentalJourneyError) {
      return NextResponse.json({ error: error.code }, { status: 403 });
    }
    throw error;
  }

  const [logoBytes, athleteAvatarBytes] = await Promise.all([
    readFile(join(process.cwd(), 'public', 'email', 'kaipai-logo.png')).catch(
      () => null
    ),
    loadPdfAvatar(athlete.avatarUrl),
  ]);
  const config = getVerticalConfig();
  const sportLabel = athlete.sport
    ? (findTaxonomyItem(config.taxonomies.categories, athlete.sport)?.label ??
      athlete.sport)
    : null;
  const levelLabel = athlete.level
    ? (findTaxonomyItem(config.taxonomies.levels ?? [], athlete.level)?.label ??
      athlete.level)
    : null;
  const sessionStats = buildCoachAthleteSessionStats(
    bookings,
    athleteUserId,
    generatedAt
  );
  const coachName = [user.name, user.lastName].filter(Boolean).join(' ') || 'Coach';
  const pdfBytes = await buildMentalJourneyPdf({
    athleteName: athlete.name,
    athlete: {
      age: athlete.age,
      sportLabel,
      levelLabel,
      avatarBytes: athleteAvatarBytes,
    },
    sessionStats,
    coachName,
    periodLabel: JOURNEY_PERIOD_LABELS[period],
    generatedAt,
    journey,
    logoBytes,
  });
  const fileName = journeyPdfFileName(athlete.name, generatedAt);

  return new NextResponse(Buffer.from(pdfBytes), {
    // Un percorso non si mette in cache da nessuna parte.
    headers: journeyPdfDownloadHeaders(fileName),
  });
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

/**
 * Legge solo immagini locali o dal progetto Supabase configurato, poi le
 * normalizza in un quadrato PNG: niente URL arbitrari e niente foto deformate
 * nel documento esportato.
 */
async function loadPdfAvatar(avatarUrl: string | null): Promise<Buffer | null> {
  if (!avatarUrl) return null;

  let bytes: Buffer | null = null;
  if (avatarUrl.startsWith('/')) {
    const publicRoot = resolve(process.cwd(), 'public');
    const filePath = resolve(publicRoot, `.${avatarUrl}`);
    const childPath = relative(publicRoot, filePath);
    if (childPath.startsWith('..') || isAbsolute(childPath)) return null;
    bytes = await readFile(filePath).catch(() => null);
  } else {
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return null;

    let source: URL;
    try {
      source = new URL(avatarUrl);
      if (source.origin !== new URL(supabaseUrl).origin) return null;
    } catch {
      return null;
    }

    const response = await fetch(source, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(6_000),
    }).catch(() => null);
    if (!response?.ok) return null;
    if (!(response.headers.get('content-type') ?? '').startsWith('image/')) {
      return null;
    }
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > MAX_AVATAR_BYTES) return null;
    bytes = Buffer.from(await response.arrayBuffer());
  }

  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) {
    return null;
  }

  try {
    const { default: sharp } = await import('sharp');
    return await sharp(bytes)
      .rotate()
      .resize(160, 160, { fit: 'cover', position: 'attention' })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
