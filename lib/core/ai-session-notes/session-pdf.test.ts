import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDict, PDFDocument, PDFHexString, PDFName } from 'pdf-lib';
import type { SessionCompassView } from './session-compass';
import {
  buildSessionPdf,
  sessionPdfDownloadHeaders,
  sessionPdfFileName,
} from './session-pdf';

const generatedAt = new Date('2026-08-22T09:00:00.000Z');

function approvedReport(): SessionCompassView {
  const evidence = {
    transcriptSegmentId: 12,
    startMs: 420_000,
    minute: 7,
    speaker: 'athlete' as const,
    quote: 'La citazione integrale non deve finire nel PDF.',
  };
  return {
    reportId: 31,
    sessionId: 44,
    reportVersion: 2,
    status: 'approved',
    sourceFingerprint: 'fingerprint',
    isApproved: true,
    isStale: false,
    // Aggiunto quando `SessionCompassView` ha acquisito lo stato di
  // condivisione: la fixture e' di un'altra sessione, qui c'e' solo la riga
  // che le mancava per compilare.
  sharedAt: null,
  approvedAt: '2026-08-20T13:00:00.000Z',
    errorCode: null,
    updatedAt: '2026-08-20T13:00:00.000Z',
    canEditCoachNote: true,
    trackedCommitments: [
      {
        id: 8,
        sessionId: 44,
        sourceReportId: 31,
        sourceReportVersion: 2,
        athleteUserId: 7,
        coachUserId: 3,
        commitmentKey: 'commitment',
        title: 'Fare una breve routine di centratura prima dell’allenamento.',
        owner: 'athlete',
        status: 'in_progress',
        dueDate: '2026-08-28',
        completedAt: null,
        athleteNote: null,
        sourceTranscriptSegmentId: 12,
        sourceTimestampMs: 420_000,
        sourceExcerpt: 'estratto privato',
        manuallyEdited: false,
        archivedAt: null,
      },
    ],
    document: {
      schemaVersion: '1.0',
      reportKind: 'session_compass_v1',
      sessionId: '44',
      sourceFingerprint: 'fingerprint',
      language: 'it',
      sessionOverview: {
        summary:
          'La sessione ha lavorato sull’integrazione nel nuovo gruppo e sulle provocazioni che rischiano di spostare l’attenzione dalla prestazione.',
        summaryEvidence: [evidence],
        themes: [
          { id: 'theme-1', text: 'Integrazione nel nuovo gruppo squadra', evidence },
          { id: 'theme-2', text: 'Gestione delle provocazioni', evidence },
        ],
        emergingResource: {
          id: 'resource-1',
          text: 'Capacità di riconoscere il momento in cui riportare il focus sul compito.',
          evidence,
        },
      },
      keyMoments: [
        {
          id: 'moment-1',
          title: 'Il focus torna sulla prestazione',
          explanation:
            'L’atleta individua una risposta concreta per non restare agganciato alle provocazioni.',
          speaker: 'athlete',
          evidence,
        },
      ],
      missedOpportunities: [
        {
          id: 'missed-1',
          text: 'Il tema del rapporto con il mister è rimasto aperto.',
          followUp: 'Chiedere che cosa rende utile il confronto con il nuovo mister.',
          evidence,
        },
      ],
      story: {
        title: 'Relazioni di squadra e presenza mentale',
        paragraphs: [
          {
            id: 'story-1',
            text: 'La conversazione parte dalla sensazione di essere entrato bene nel gruppo e si concentra poi sugli episodi che possono interrompere il focus.',
            evidence,
          },
          {
            id: 'story-2',
            text: 'In chiusura emerge una strategia semplice: riconoscere la provocazione, respirare e tornare al compito immediato.',
            evidence: null,
          },
        ],
        throughLine: 'Il lavoro prosegue sul passaggio dalla reazione automatica alla scelta intenzionale.',
      },
      commitments: [
        {
          id: 'commitment-1',
          text: 'Fare una breve routine di centratura prima dell’allenamento.',
          owner: 'athlete',
          status: 'in_progress',
          dueDate: '2026-08-28',
          evidence,
        },
      ],
      nextSessionPrep: [
        {
          id: 'prep-1',
          text: 'Verificare in quali situazioni la routine ha aiutato maggiormente.',
          origin: 'commitment',
          evidence,
        },
      ],
      coachNote: 'NOTA PRIVATA DA NON ESPORTARE',
      generation: {
        provider: 'test',
        model: 'test-model',
        promptVersion: 'test-v1',
        contractVersion: '1.0',
        generatedAt: '2026-08-20T12:00:00.000Z',
      },
    },
  };
}

test('genera il report PDF della sessione approvata con metadati compliance', async () => {
  const bytes = await buildSessionPdf({
    athleteName: 'Armando Merkaj',
    coachName: 'Lorenzo Conti',
    sessionDate: new Date('2026-08-19T10:30:00.000Z'),
    sessionDurationMinutes: 38,
    serviceTitle: 'Sessione KaiPai',
    generatedAt,
    athlete: { age: 24, sportLabel: 'Calcio', levelLabel: 'Agonista' },
    report: approvedReport(),
    conversationMap: {
      durationMs: 38 * 60_000,
      dominantRole: 'coach',
      rolesWithoutRecording: [],
      moments: [],
      lanes: [
        { role: 'coach', blocks: [], speakingMs: 1_200_000, sharePercent: 72 },
        { role: 'athlete', blocks: [], speakingMs: 466_000, sharePercent: 28 },
      ],
      insight: {
        coachTurns: 473,
        coachQuestionTurns: 59,
        coachAverageTurnSec: 2,
        athleteAverageTurnSec: 2,
        athleteOpenedUp: false,
        athleteFirstHalfSec: 2,
        athleteSecondHalfSec: 2,
      },
    },
  });

  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString('ascii'), '%PDF-');
  const document = await PDFDocument.load(bytes);
  assert.ok(document.getPageCount() >= 1);
  assert.ok(document.getPageCount() <= 3);
  assert.equal(document.getTitle(), 'Report sessione di Armando Merkaj');
  const infoReference = document.context.trailerInfo.Info;
  assert.ok(infoReference);
  const info = document.context.lookup(infoReference, PDFDict);
  assert.equal(
    info.lookup(PDFName.of('HumanReview'), PDFHexString).decodeText(),
    'coach-approved'
  );
  assert.equal(
    info.lookup(PDFName.of('ReportScope'), PDFHexString).decodeText(),
    'single-session'
  );
});

test('rifiuta un report non approvato e crea filename e header sicuri', async () => {
  const draft = approvedReport();
  draft.status = 'ready_for_review';
  draft.isApproved = false;
  await assert.rejects(
    () =>
      buildSessionPdf({
        athleteName: 'Armando Merkaj',
        coachName: 'Lorenzo Conti',
        sessionDate: generatedAt,
        sessionDurationMinutes: 38,
        serviceTitle: null,
        generatedAt,
        athlete: { age: null, sportLabel: null, levelLabel: null },
        report: draft,
        conversationMap: null,
      }),
    /SESSION_REPORT_NOT_APPROVED/
  );

  const fileName = sessionPdfFileName('Armando Merkaj', generatedAt);
  assert.equal(fileName, 'sessione-armando-merkaj-2026-08-22.pdf');
  assert.deepEqual(sessionPdfDownloadHeaders(fileName), {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="sessione-armando-merkaj-2026-08-22.pdf"',
    'Cache-Control': 'no-store, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'sandbox',
    'Referrer-Policy': 'no-referrer',
  });
});
