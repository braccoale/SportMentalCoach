import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SessionCompassContent,
  SessionCompassPanel,
  SessionCompassStatusBanner,
  TrackedCommitmentsSection,
  evidenceLabel,
  segmentAnchorId,
  type SessionCompassView,
  type TrackedCommitmentView,
} from './session-compass-panel';
import { canShowAiSessionReport } from '@/lib/core/ai-session-notes/report-visibility';
import {
  SESSION_COMPASS_REPORT_KIND,
  SESSION_COMPASS_SCHEMA_VERSION,
  type SessionCompassReport,
} from '@/lib/core/ai-session-notes/session-compass-contract';
import { SessionOverview } from './session-compass/report-sections';

function evidence(segmentId: number, minute: number, quote: string) {
  return {
    transcriptSegmentId: segmentId,
    startMs: minute * 60_000,
    minute,
    speaker: 'athlete' as const,
    quote,
  };
}

function document(overrides: Partial<SessionCompassReport> = {}): SessionCompassReport {
  return {
    schemaVersion: SESSION_COMPASS_SCHEMA_VERSION,
    reportKind: SESSION_COMPASS_REPORT_KIND,
    sessionId: '5',
    sourceFingerprint: 'fingerprint-a',
    language: 'it',
    sessionOverview: {
      summary: 'Emerge una tensione pre-gara riferita dall’atleta.',
      summaryEvidence: [evidence(2, 2, 'resto teso prima delle gare')],
      themes: [{ id: 'theme-1', text: 'Tensione pre-gara', evidence: evidence(2, 2, 'resto teso') }],
      emergingResource: {
        id: 'resource-1',
        text: 'L’atleta riferisce di aver ripreso ad allenarsi con costanza.',
        evidence: evidence(2, 2, 'ripreso ad allenarmi'),
      },
    },
    keyMoments: [
      {
        id: 'moment-1',
        title: 'L’atleta descrive la tensione',
        explanation: 'Emerge una tensione riferita prima delle gare.',
        speaker: 'athlete',
        evidence: evidence(2, 2, 'resto teso prima delle gare'),
      },
    ],
    commitments: [
      {
        id: 'commitment-1',
        text: 'Provare una routine di attivazione',
        owner: 'athlete',
        status: 'pending',
        dueDate: '2026-08-07',
        evidence: evidence(2, 2, 'ripreso ad allenarmi'),
      },
    ],
    nextSessionPrep: [
      {
        id: 'prep-1',
        text: 'Verificare come è andata la routine.',
        origin: 'commitment',
        evidence: evidence(2, 2, 'resto teso'),
      },
    ],
    coachNote: 'Riprendere il tema della routine.',
    generation: {
      provider: 'openai',
      model: 'gpt-5-mini',
      promptVersion: 'compass-v1',
      contractVersion: SESSION_COMPASS_SCHEMA_VERSION,
      generatedAt: '2026-08-01T10:00:00.000Z',
    },
    ...overrides,
  };
}

function view(overrides: Partial<SessionCompassView> = {}): SessionCompassView {
  return {
    reportId: 1,
    sessionId: 5,
    reportVersion: 1,
    status: 'ready_for_review',
    sourceFingerprint: 'fingerprint-a',
    isApproved: false,
    isStale: false,
    approvedAt: null,
    errorCode: null,
    updatedAt: '2026-08-01T12:00:00.000Z',
    document: document(),
    canEditCoachNote: true,
    trackedCommitments: [],
    ...overrides,
  };
}

test('rende tutte le sezioni di Session Compass con le evidenze', () => {
  const html = renderToStaticMarkup(<SessionCompassContent report={document()} />);

  assert.match(html, /Sintesi della sessione/);
  assert.match(html, /Temi emersi/);
  assert.match(html, /Risorsa emersa/);
  assert.match(html, /Momenti chiave/);
  assert.match(html, /Impegni concordati/);
  assert.match(html, /Preparazione prossima sessione/);
  assert.match(html, /Dichiarazione atleta · 02:00/);
  assert.match(html, /resto teso prima delle gare/);
  assert.match(html, /Scadenza 2026-08-07/);
});

test('omette le sezioni prive di contenuto supportato', () => {
  const html = renderToStaticMarkup(
    <SessionCompassContent
      report={document({
        keyMoments: [],
        commitments: [],
        nextSessionPrep: [],
        sessionOverview: {
          summary: 'Sintesi neutra.',
          summaryEvidence: [evidence(2, 1, 'resto teso')],
          themes: [],
          emergingResource: null,
        },
      })}
    />
  );

  assert.match(html, /Sintesi della sessione/);
  assert.doesNotMatch(html, /Momenti chiave/);
  assert.doesNotMatch(html, /Impegni concordati/);
  assert.doesNotMatch(html, /Risorsa emersa/);
  assert.doesNotMatch(html, /Preparazione prossima sessione/);
});

test('la panoramica segnala i dati non disponibili senza inventare metriche', () => {
  const html = renderToStaticMarkup(
    <SessionOverview
      report={document({
        commitments: [],
        nextSessionPrep: [],
        sessionOverview: {
          summary: '',
          summaryEvidence: [],
          themes: [],
          emergingResource: null,
          metrics: [],
          emotionalTrend: [],
          conversationParticipation: null,
          conversationTone: null,
        },
      })}
      isApproved={false}
      previousJourneyEntry={null}
      onOpenEvidence={() => undefined}
      onOpenMoments={() => undefined}
      onOpenNotes={() => undefined}
    />
  );

  assert.match(html, /Dato non disponibile/);
  assert.doesNotMatch(html, />0\/5</);
});

test('le metriche mostrano livello di evidenza, origine e validazione senza diventare micro-card su mobile', () => {
  const html = renderToStaticMarkup(
    <SessionOverview
      report={document({
        sessionOverview: {
          ...document().sessionOverview,
          metrics: [
            {
              id: 'metric-confidence',
              key: 'confidence',
              value: 4,
              confidence: 'high',
              evidence: evidence(4, 2, 'mi sento più pronto'),
            },
          ],
        },
      })}
      isApproved={false}
      previousJourneyEntry={null}
      onOpenEvidence={() => undefined}
      onOpenMoments={() => undefined}
      onOpenNotes={() => undefined}
    />
  );

  assert.match(html, /Evidenza forte/);
  assert.match(html, /Dichiarazione atleta/);
  assert.match(html, /Da validare dal coach/);
  assert.match(html, /Autovalutazione strutturata: dato non disponibile/);
  assert.match(html, /grid-cols-2 sm:grid-cols-3 xl:grid-cols-6/);
});

test('la panoramica conserva gerarchia e griglia responsive', () => {
  const html = renderToStaticMarkup(
    <SessionOverview
      report={document()}
      isApproved={false}
      previousJourneyEntry={null}
      onOpenEvidence={() => undefined}
      onOpenMoments={() => undefined}
      onOpenNotes={() => undefined}
    />
  );

  assert.match(html, /lg:grid-cols-3/);
  assert.match(html, /text-lg font-bold leading-7/);
  assert.match(html, /text-base leading-7/);
});

test('rende gli stati elaborazione, errore, bozza e approvato', () => {
  assert.match(
    renderToStaticMarkup(<SessionCompassStatusBanner report={view({ status: 'generating' })} />),
    /Elaborazione in corso/
  );
  assert.match(
    renderToStaticMarkup(<SessionCompassStatusBanner report={view({ status: 'failed' })} />),
    /L’elaborazione non è riuscita/
  );
  assert.match(
    renderToStaticMarkup(<SessionCompassStatusBanner report={view()} />),
    /Bozza pronta da verificare \(versione 1\)/
  );
  assert.match(
    renderToStaticMarkup(
      <SessionCompassStatusBanner report={view({ status: 'approved', isApproved: true, reportVersion: 2 })} />
    ),
    /Report approvato \(versione 2\)\. È immutabile/
  );
  assert.match(
    renderToStaticMarkup(<SessionCompassStatusBanner report={view({ isStale: true })} />),
    /La trascrizione o le istruzioni AI sono cambiate/
  );
  assert.match(
    renderToStaticMarkup(<SessionCompassStatusBanner report={view({ isStale: true, status: 'approved', isApproved: true })} />),
    /rigenera per ottenere una bozza aggiornata/
  );
  assert.match(
    renderToStaticMarkup(<SessionCompassStatusBanner report={null} />),
    /non è ancora stato generato/
  );
});

test('gli impegni sono modificabili solo finché il report non è approvato', () => {
  const editable = renderToStaticMarkup(
    <SessionCompassContent report={document()} editable={true} />
  );
  const approved = renderToStaticMarkup(
    <SessionCompassContent report={document()} editable={false} />
  );

  assert.match(editable, /<textarea/);
  assert.doesNotMatch(editable, /disabled=""/);
  assert.doesNotMatch(approved, /<textarea/);
  assert.match(approved, /disabled=""/);
});

test('le evidenze puntano all’ancora del segmento di transcript', () => {
  assert.equal(segmentAnchorId(42), 'compass-segment-42');
  assert.equal(evidenceLabel(evidence(2, 3, 'estratto')), 'Dichiarazione atleta · 03:00');
});

test('mostra lo stato di caricamento prima che la fetch del client completi', () => {
  const html = renderToStaticMarkup(
    <SessionCompassPanel
      sessionId={5}
      sessionDate="2026-08-06T12:33:00.000Z"
      athleteName="Alessandro"
      initialJourney={null}
    />
  );
  assert.match(html, /Session Compass/);
  assert.match(html, /Caricamento Session Compass/);
  assert.match(html, /Non è visibile all’atleta/);
});

test('il pannello è visibile solo al coach con Appunti AI attivo', () => {
  assert.equal(
    canShowAiSessionReport({ viewerRole: 'coach', aiNotesEnabled: true, hasAiNotesSession: true }),
    true
  );
  assert.equal(
    canShowAiSessionReport({ viewerRole: 'athlete', aiNotesEnabled: true, hasAiNotesSession: true }),
    false
  );
  assert.equal(
    canShowAiSessionReport({ viewerRole: 'coach', aiNotesEnabled: false, hasAiNotesSession: true }),
    false
  );
});

function tracked(
  overrides: Partial<TrackedCommitmentView> = {}
): TrackedCommitmentView {
  return {
    id: 12,
    title: 'Provare una routine di attivazione',
    owner: 'athlete',
    status: 'pending',
    dueDate: '2026-08-20',
    completedAt: null,
    athleteNote: null,
    sourceTimestampMs: 120_000,
    sourceTranscriptSegmentId: 2,
    sourceExcerpt: 'ripreso ad allenarmi',
    manuallyEdited: false,
    ...overrides,
  };
}

test('mostra gli impegni operativi con evidenza e scadenza', () => {
  const html = renderToStaticMarkup(
    <TrackedCommitmentsSection commitments={[tracked()]} />
  );

  assert.match(html, /Impegni attivi/);
  assert.match(html, /Le tue modifiche prevalgono sulla bozza AI/);
  assert.match(html, /value="2026-08-20"/);
  assert.match(html, /ripreso ad allenarmi/);
  assert.match(html, /02:00/);
});

test('evidenzia l’esito dichiarato dall’atleta', () => {
  const completed = renderToStaticMarkup(
    <TrackedCommitmentsSection commitments={[tracked({ status: 'completed' })]} />
  );
  assert.match(completed, /L’atleta ha completato questo impegno/);

  const skipped = renderToStaticMarkup(
    <TrackedCommitmentsSection
      commitments={[tracked({ status: 'skipped', athleteNote: 'Ho avuto una gara.' })]}
    />
  );
  assert.match(skipped, /L’atleta non è riuscito a completarlo/);
  assert.match(skipped, /Ho avuto una gara\./);
});

test('segnala un impegno modificato manualmente dal coach', () => {
  const html = renderToStaticMarkup(
    <TrackedCommitmentsSection commitments={[tracked({ manuallyEdited: true })]} />
  );
  assert.match(html, /Modificato manualmente/);
});

test('non rende la sezione quando non ci sono impegni operativi', () => {
  assert.equal(renderToStaticMarkup(<TrackedCommitmentsSection commitments={[]} />), '');
});

test('dopo l’approvazione gli impegni del report cedono il posto a quelli operativi', () => {
  const html = renderToStaticMarkup(
    <SessionCompassContent report={document()} hideCommitments={true} />
  );
  assert.doesNotMatch(html, /Impegni concordati/);
  assert.match(html, /Momenti chiave/);
});
