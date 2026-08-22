import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import type { MentalJourney } from './mental-journey';
import {
  buildMentalJourneyPdf,
  journeyPdfDownloadHeaders,
  journeyPdfFileName,
} from './journey-pdf';

const generatedAt = new Date('2026-08-22T10:00:00.000Z');

const journey: MentalJourney = {
  athleteUserId: 7,
  summary: {
    firstSessionDate: '2026-05-10T09:00:00.000Z',
    lastSessionDate: '2026-08-18T09:00:00.000Z',
    approvedSessionCount: 2,
    draftSessionCount: 1,
    commitments: {
      total: 6,
      completed: 3,
      inProgress: 1,
      pending: 1,
      skipped: 1,
    },
    completionRate: 50,
  },
  recurringThemes: [
    {
      key: 'fiducia-gara',
      label: 'Fiducia in gara',
      occurrences: 2,
      firstSeenAt: '2026-05-10T09:00:00.000Z',
      lastSeenAt: '2026-08-18T09:00:00.000Z',
      sessionIds: [1, 2],
      description: 'Tema emerso in 2 sessioni',
    },
  ],
  followThrough: [
    {
      commitmentId: 21,
      title: 'Ripetere la routine di respirazione prima dell’allenamento',
      owner: 'athlete',
      status: 'in_progress',
      dueDate: '2026-08-29',
      isOverdue: false,
      sessionId: 2,
      bookingId: 102,
      sessionDate: '2026-08-18T09:00:00.000Z',
    },
  ],
  pointsToRevisit: [
    {
      id: 'theme:fiducia-gara',
      text: 'Come cambia la fiducia nei minuti che precedono la gara?',
      source: 'recurring_theme',
      sourceLabel: 'Tema emerso in 2 sessioni recenti',
      sessionId: 2,
      bookingId: 102,
    },
  ],
  timeline: [
    entry(2, '2026-08-18T09:00:00.000Z', true),
    entry(1, '2026-05-10T09:00:00.000Z', true),
    entry(3, '2026-08-20T09:00:00.000Z', false),
  ],
};

test('genera un PDF A4 con metadati e sole sezioni esportabili', async () => {
  const bytes = await buildMentalJourneyPdf({
    athleteName: 'Giulia Martini',
    athlete: {
      age: 22,
      sportLabel: 'Tennis',
      levelLabel: 'Professionista',
    },
    sessionStats: {
      completedSessions: 8,
      totalSessionMinutes: 492,
      averageSessionMinutes: 62,
    },
    coachName: 'Alessandro Riva',
    periodLabel: 'Tutto il percorso',
    generatedAt,
    journey,
  });

  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString('ascii'), '%PDF-');
  const document = await PDFDocument.load(bytes);
  assert.equal(document.getTitle(), 'Percorso mentale di Giulia Martini');
  assert.equal(document.getAuthor(), 'KaiPai Mental Coaching');
  assert.equal(document.getCreator(), 'KaiPai Session Compass');
  assert.equal(
    document.getSubject(),
    'Documento riservato con contenuti assistiti da IA e revisionati dal coach'
  );
  assert.equal(document.getCreationDate()?.toISOString(), generatedAt.toISOString());
  const infoReference = document.context.trailerInfo.Info;
  assert.ok(infoReference);
  const info = document.context.lookup(infoReference, PDFDict);
  assert.equal(
    info.lookup(PDFName.of('AIContentDisclosure'), PDFHexString).decodeText(),
    'AI-assisted content derived from session transcripts and human-reviewed by the coach'
  );
  assert.equal(
    info.lookup(PDFName.of('AutomatedDecisionMaking'), PDFHexString).decodeText(),
    'none'
  );
  assert.equal(
    info.lookup(PDFName.of('PrivacyContact'), PDFHexString).decodeText(),
    'privacy@kaipaicoaching.com'
  );
  assert.ok(document.getPageCount() >= 1);
  assert.deepEqual(document.getPage(0).getSize(), {
    width: 595.28,
    height: 841.89,
  });
});

test('il nome file è leggibile, datato e termina in pdf', () => {
  const fileName = journeyPdfFileName('Giulia Màrtini', generatedAt);
  assert.equal(fileName, 'percorso-giulia-martini-2026-08-22.pdf');
  assert.deepEqual(journeyPdfDownloadHeaders(fileName), {
    'Content-Type': 'application/pdf',
    'Content-Disposition':
      'attachment; filename="percorso-giulia-martini-2026-08-22.pdf"',
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'sandbox',
    'Referrer-Policy': 'no-referrer',
  });
});

function entry(
  sessionId: number,
  sessionDate: string,
  isApproved: boolean
): MentalJourney['timeline'][number] {
  return {
    sessionId,
    bookingId: 100 + sessionId,
    reportId: 200 + sessionId,
    reportVersion: 1,
    sessionDate,
    approvedAt: sessionDate,
    sharedAt: null,
    coachName: 'Alessandro Riva',
    summary:
      'La seduta ha esplorato la gestione dell’attivazione e una routine breve, concreta e ripetibile prima della gara.',
    focus: 'Preparazione alla gara',
    themes: ['Fiducia in gara'],
    emergingResource: 'Respirazione consapevole',
    throughLine: null,
    metrics: [],
    keyMoments: [],
    nextSessionPrep: [],
    commitments: [],
    compassHref: `/dashboard/appointments/${100 + sessionId}`,
    isApproved,
  };
}
