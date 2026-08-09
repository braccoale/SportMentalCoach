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
import {
  ConversationParticipationCard,
  SessionIndicators,
  SessionKpiCards,
  SessionMetricsStrip,
} from './session-compass/session-indicators';
import { SessionContinuityCard } from './session-compass/journey-panel';
import { JourneyNarrative } from './session-compass/journey-narrative';
import type { MentalJourneyEntry } from '@/lib/core/ai-session-notes/mental-journey';

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

test('rende tutte le sezioni del riepilogo sessione con le evidenze', () => {
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

function metric(
  key: 'confidence' | 'pre_competition_anxiety' | 'concentration',
  value: number,
  confidence: 'low' | 'medium' | 'high' = 'high'
) {
  return {
    id: `metric-${key}`,
    key,
    value,
    confidence,
    evidence: evidence(4, 2, 'mi sento più pronto'),
  } as const;
}

test('gli indicatori usano segmenti ordinali con valore esplicito, mai percentuali', () => {
  const html = renderToStaticMarkup(
    <SessionIndicators
      metrics={[metric('confidence', 4)]}
      tone={null}
      isApproved={false}
      onOpenEvidence={() => undefined}
    />
  );

  assert.match(html, /Segnali emersi dalla conversazione/);
  assert.match(html, />4\/5</);
  assert.match(html, /Evidenza forte/);
  assert.match(html, /Dichiarazione atleta/);
  assert.match(html, /Da validare dal coach/);
  // Nessuna conversione in percentuale della scala 1–5.
  assert.doesNotMatch(html, /\d+%/);
  assert.doesNotMatch(html, /Autovalutazione strutturata/);
  // Cinque segmenti, quattro attivi: il colore non è l'unico veicolo.
  const segments = html.match(/h-2 flex-1 rounded-full/g) ?? [];
  assert.equal(segments.length, 5);
  const active = html.match(/background-color:#7c3aed/g) ?? [];
  assert.equal(active.length, 4);
  assert.match(html, /aria-label="Fiducia: 4 su 5, alto\./);
});

test('gli indicatori non mostrano zero quando una metrica è assente', () => {
  const html = renderToStaticMarkup(
    <SessionIndicators
      metrics={[metric('confidence', 2)]}
      tone={null}
      isApproved
      onOpenEvidence={() => undefined}
    />
  );

  assert.match(html, />2\/5</);
  assert.doesNotMatch(html, />0\/5</);
  assert.doesNotMatch(html, /Ansia pre-gara/);
  assert.match(html, /Validata nel report/);
});

test('la fascia rapida usa al massimo tre metriche ordinali prioritarie con evidenza', () => {
  const html = renderToStaticMarkup(
    <SessionMetricsStrip
      metrics={[
        metric('confidence', 4),
        metric('pre_competition_anxiety', 2),
        metric('concentration', 3),
        { ...metric('confidence', 5), id: 'metric-energy', key: 'energy' },
        { ...metric('confidence', 1), id: 'metric-motivation', key: 'motivation' },
        { ...metric('confidence', 4), id: 'metric-emotional', key: 'emotional_management' },
      ]}
      isApproved={false}
      onOpenEvidence={() => undefined}
    />
  );

  assert.match(html, /Indicatori che contano ora/);
  assert.match(html, /Altri 3 segnali con evidenza/);
  assert.match(html, /Fiducia/);
  assert.match(html, /Ansia pre-gara/);
  assert.match(html, /Gestione emotiva/);
  assert.doesNotMatch(html, /Motivazione/);
  assert.doesNotMatch(html, /60%/);
  assert.match(html, /aria-label="Fiducia: 4 su 5, alto\./);
});

test('la fascia rapida non lascia una card vuota quando i conteggi sono tutti assenti', () => {
  assert.equal(
    renderToStaticMarkup(
      <SessionMetricsStrip
        metrics={[]}
        isApproved
        onOpenEvidence={() => undefined}
        counts={{ themes: 0, actions: 0, moments: 0, hasResource: false }}
      />
    ),
    ''
  );
});

test('le card KPI mostrano solo conteggi reali, senza percentuali', () => {
  const html = renderToStaticMarkup(
    <SessionKpiCards themeCount={3} actionCount={2} keyMomentCount={2} hasEmergingResource />
  );

  assert.match(html, /Temi emersi/);
  assert.match(html, />3</);
  assert.match(html, /Azioni definite/);
  assert.match(html, /Momenti chiave/);
  assert.match(html, /Risorsa emersa/);
  assert.doesNotMatch(html, /%/);
});

test('le card KPI omettono categorie senza elementi reali', () => {
  const html = renderToStaticMarkup(
    <SessionKpiCards themeCount={0} actionCount={0} keyMomentCount={0} hasEmergingResource={false} />
  );

  assert.equal(html, '');
});

test('senza metriche e senza tono la card degli indicatori non viene resa', () => {
  assert.equal(
    renderToStaticMarkup(
      <SessionIndicators metrics={[]} tone={null} isApproved={false} onOpenEvidence={() => undefined} />
    ),
    ''
  );
});

test('la quota di parola vive in una card separata dalle metriche interpretative', () => {
  const indicators = renderToStaticMarkup(
    <SessionIndicators
      metrics={[metric('confidence', 4)]}
      tone={null}
      isApproved={false}
      onOpenEvidence={() => undefined}
    />
  );
  const participation = renderToStaticMarkup(
    <ConversationParticipationCard
      participation={{
        athleteTalkMs: 1_620_000,
        coachTalkMs: 720_000,
        athleteTurns: 41,
        coachTurns: 38,
        athleteSharePercent: 69,
      }}
    />
  );

  // La partecipazione non compare tra i segnali interpretativi.
  assert.doesNotMatch(indicators, /Partecipazione alla conversazione/);
  assert.doesNotMatch(indicators, /Parola atleta/);

  assert.match(participation, /Partecipazione alla conversazione/);
  assert.match(participation, /Conteggio diretto sui segmenti trascritti/);
  // Equivalente testuale accanto alla barra.
  assert.match(participation, /69% del parlato · 27 min · 41 turni/);
  assert.match(participation, /31% del parlato · 12 min · 38 turni/);
  assert.match(participation, /aria-label="Quota di parola trascritta: atleta 69%, coach 31%\. Deriva dalla durata e dal conteggio degli interventi trascritti\."/);
});

test('la partecipazione non viene resa quando il dato non esiste', () => {
  assert.equal(renderToStaticMarkup(<ConversationParticipationCard participation={null} />), '');
});

function previousEntry(overrides: Partial<MentalJourneyEntry> = {}): MentalJourneyEntry {
  return {
    sessionId: 101,
    bookingId: 101,
    reportId: 101,
    reportVersion: 1,
    sessionDate: '2026-07-22T18:00:00.000Z',
    approvedAt: '2026-07-22T19:00:00.000Z',
    coachName: 'Giulia Neri',
    summary: 'Sessione centrata sulla tensione pre-gara.',
    focus: 'Gestione della tensione pre-gara',
    themes: ['Tensione pre-gara'],
    emergingResource: null,
    metrics: [{ key: 'confidence', value: 2, confidence: 'medium', transcriptSegmentId: 900 }],
    keyMoments: [],
    nextSessionPrep: [],
    commitments: [],
    compassHref: '/dashboard/appointments/101#session-compass',
    ...overrides,
  };
}

function reportWithMetric(value: number) {
  const base = document();
  return document({
    sessionOverview: { ...base.sessionOverview, metrics: [metric('confidence', value)] },
  });
}

test('la continuità descrive le metriche ordinali senza percentuali', () => {
  const html = renderToStaticMarkup(
    <SessionContinuityCard report={reportWithMetric(3)} previous={previousEntry()} />
  );

  assert.match(html, /Cosa è cambiato/);
  assert.match(html, /Fiducia: da 2\/5 a 3\/5 · aumentata di 1 punto/);
  assert.doesNotMatch(html, /\d+%/);
});

test('la continuità distingue una metrica stabile da una cambiata', () => {
  const html = renderToStaticMarkup(
    <SessionContinuityCard report={reportWithMetric(2)} previous={previousEntry()} />
  );

  assert.match(html, /Fiducia: stabile a 2\/5/);
  assert.doesNotMatch(html, /aumentata di/);
});

test('la continuità dichiara quando non ci sono dati comparabili', () => {
  const html = renderToStaticMarkup(
    <SessionContinuityCard report={document()} previous={previousEntry({ metrics: [], themes: [] })} />
  );

  assert.match(html, /Non ci sono metriche comparabili sufficienti per identificare un cambiamento/);
  assert.match(html, /Non ci sono dati comparabili sufficienti per identificare elementi rimasti stabili/);
});

test('la continuità separa impegni completati e ancora aperti della sessione precedente', () => {
  const html = renderToStaticMarkup(
    <SessionContinuityCard
      report={reportWithMetric(3)}
      previous={previousEntry({
        commitments: [
          { commitmentId: 1, title: 'Scrivere la routine', owner: 'athlete', status: 'completed', dueDate: null, isOverdue: false },
          { commitmentId: 2, title: 'Parlare con l’allenatore', owner: 'athlete', status: 'pending', dueDate: null, isOverdue: false },
          { commitmentId: 3, title: 'Provare la respirazione', owner: 'athlete', status: 'in_progress', dueDate: null, isOverdue: false },
        ],
      })}
    />
  );

  assert.match(html, /Impegni completati \(1\)/);
  assert.match(html, /Scrivere la routine/);
  assert.match(html, /Impegni ancora aperti \(2\)/);
  assert.match(html, /Parlare con l’allenatore/);
});

test('alla prima sessione la continuità mostra uno stato vuoto compatto', () => {
  const html = renderToStaticMarkup(<SessionContinuityCard report={document()} previous={null} />);

  assert.match(html, /Questa è la prima sessione analizzata/);
  assert.doesNotMatch(html, /Cosa è cambiato/);
  assert.doesNotMatch(html, /Impegni completati/);
});

test('il filo logico collega sessione precedente, attuale e direzione da validare', () => {
  const html = renderToStaticMarkup(
    <JourneyNarrative
      report={reportWithMetric(3)}
      previous={previousEntry({
        commitments: [
          { commitmentId: 2, title: 'Parlare con l’allenatore', owner: 'athlete', status: 'pending', dueDate: null, isOverdue: false },
        ],
      })}
      currentSessionDate="2026-08-06T18:00:00.000Z"
    />
  );

  assert.match(html, /Filo logico del percorso/);
  assert.match(html, /Sessione precedente/);
  assert.match(html, /Gestione della tensione pre-gara/);
  assert.match(html, /Azione lasciata aperta:.*Parlare con l’allenatore/s);
  assert.match(html, /Sessione attuale/);
  assert.match(html, /Cambiamento principale:.*Fiducia: da 2\/5 a 3\/5/s);
  assert.match(html, /Prossima direzione suggerita/);
  assert.match(html, /Da validare dal coach/);
});

test('senza sessione precedente il filo logico non inventa il primo passaggio', () => {
  const html = renderToStaticMarkup(
    <JourneyNarrative
      report={document()}
      previous={null}
      currentSessionDate="2026-08-06T18:00:00.000Z"
    />
  );

  assert.match(html, /Nessuna sessione precedente approvata/);
  assert.match(html, /Sessione attuale/);
  assert.match(html, /Prossima direzione suggerita/);
  assert.doesNotMatch(html, /Azione lasciata aperta/);
});

test('la panoramica usa la griglia dashboard e differenzia il peso delle card', () => {
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

  // Griglia a 12 colonne: percorso atleta a sinistra, area operativa a destra.
  assert.match(html, /xl:grid-cols-12/);
  assert.match(html, /xl:col-span-3/);
  assert.match(html, /xl:col-span-9/);
  // La lettura AI domina; problema centrale e prossimo passo restano secondari.
  // La dominanza è tipografica, non un contenitore: il titolo sta su una
  // scala molto più grande dei fatti di appoggio, che restano a 16px.
  assert.match(html, /text-\[1\.75rem\] font-bold/);
  assert.match(html, /text-base font-bold leading-6/);
  assert.ok(html.indexOf('Lettura AI') < html.indexOf('Problema centrale'));
});

test('il percorso atleta è visibile dalla panoramica con uno stato vuoto alla prima sessione', () => {
  const html = renderToStaticMarkup(
    <SessionOverview
      report={document()}
      isApproved={false}
      journey={null}
      previousJourneyEntry={null}
      currentSessionId={5}
      currentSessionDate="2026-08-06T12:33:00.000Z"
      onOpenEvidence={() => undefined}
      onOpenMoments={() => undefined}
      onOpenNotes={() => undefined}
    />
  );

  assert.match(html, /Percorso atleta/);
  assert.match(html, /Sessione corrente · 06 ago 26/);
  assert.match(html, /Questa è la prima sessione analizzata/);
  assert.match(html, /I confronti compariranno dopo l’approvazione delle prossime sessioni/);
  // La continuità non compare come card quasi vuota: lo dichiara il filo logico.
  assert.doesNotMatch(html, /Continuità con la sessione precedente/);
  assert.match(html, /Nessuna sessione precedente approvata/);
  // Nessuna sessione inventata oltre a quella corrente.
  assert.equal((html.match(/Approvato<\/span>/g) ?? []).length, 0);
});

test('l’anteprima della trascrizione mostra pochi passaggi e rimanda a quella completa', () => {
  const segments = [1, 2, 3, 4, 5].map((index) => ({
    transcriptSegmentId: index,
    startMs: index * 60_000,
    endMs: index * 60_000 + 5_000,
    minute: index,
    speaker: 'athlete' as const,
    text: `Passaggio numero ${index}`,
  }));
  const html = renderToStaticMarkup(
    <SessionOverview
      report={document()}
      isApproved={false}
      previousJourneyEntry={null}
      currentSessionId={5}
      transcript={segments}
      transcriptLoaded
      onOpenEvidence={() => undefined}
      onOpenTranscript={() => undefined}
      onOpenMoments={() => undefined}
      onOpenNotes={() => undefined}
    />
  );

  assert.match(html, /Passaggio numero 3/);
  assert.doesNotMatch(html, /Passaggio numero 4/);
  assert.match(html, /Altri 2 passaggi nella trascrizione completa/);
  assert.match(html, /Apri completa/);
});

test('la panoramica non carica la trascrizione da sola: la offre su richiesta', () => {
  const html = renderToStaticMarkup(
    <SessionOverview
      report={document()}
      isApproved={false}
      previousJourneyEntry={null}
      currentSessionId={5}
      transcript={[]}
      transcriptLoaded={false}
      onOpenEvidence={() => undefined}
      onOpenTranscript={() => undefined}
      onOpenMoments={() => undefined}
      onOpenNotes={() => undefined}
    />
  );

  assert.match(html, /La trascrizione non viene caricata all’apertura del riepilogo/);
  assert.match(html, /Carica anteprima/);
  // Nessun campo di ricerca finché non c'è nulla da cercare.
  assert.doesNotMatch(html, /Cerca nella trascrizione/);
});

test('la panoramica mette contesto e azioni prima di segnali, momenti e metriche', () => {
  const base = document();
  const report = document({
    sessionOverview: {
      ...base.sessionOverview,
      metrics: [{
        id: 'metric-1',
        key: 'confidence',
        value: 4,
        confidence: 'high',
        evidence: evidence(11, 5, 'mi sento più pronto'),
      }],
    },
    nextSessionPrep: ['Azione uno', 'Azione due', 'Azione tre', 'Azione quattro'].map((text, index) => ({
      ...base.nextSessionPrep[0]!,
      id: `prep-${index}`,
      text,
      evidence: evidence(index + 11, index + 1, text),
    })),
  });
  const html = renderToStaticMarkup(
    <SessionOverview
      report={report}
      isApproved={false}
      previousJourneyEntry={null}
      onOpenEvidence={() => undefined}
      onOpenMoments={() => undefined}
      onOpenNotes={() => undefined}
    />
  );

  assert.ok(html.indexOf('Problema centrale') < html.indexOf('Indicatori che contano ora'));
  assert.ok(html.indexOf('Indicatori che contano ora') < html.indexOf('Filo logico del percorso'));
  assert.ok(html.indexOf('Filo logico del percorso') < html.indexOf('Momenti chiave'));
  assert.match(html, /Azione uno/);
  assert.match(html, /Azione tre/);
  assert.doesNotMatch(html, /Azione quattro/);
  assert.match(html, /Vedi tutte/);
  assert.match(html, /aria-expanded="false"/);
});

test('la panoramica non ripete per esteso la stessa evidenza tra sezioni', () => {
  const sharedEvidence = evidence(18, 3, 'Evidenza condivisa');
  const base = document();
  const report = document({
    sessionOverview: {
      ...base.sessionOverview,
      summaryEvidence: [sharedEvidence],
      themes: [{ id: 'theme-shared', text: 'Tema condiviso', evidence: sharedEvidence }],
      emergingResource: { id: 'resource-shared', text: 'Lettura condivisa', evidence: sharedEvidence },
    },
    keyMoments: [{ ...base.keyMoments[0]!, evidence: sharedEvidence }],
    nextSessionPrep: [{ ...base.nextSessionPrep[0]!, evidence: sharedEvidence }],
  });
  const html = renderToStaticMarkup(
    <SessionOverview
      report={report}
      isApproved={false}
      previousJourneyEntry={null}
      onOpenEvidence={() => undefined}
      onOpenMoments={() => undefined}
      onOpenNotes={() => undefined}
    />
  );

  assert.equal((html.match(/Evidenza condivisa/g) ?? []).length, 1);
  assert.match(html, /Già citata · 03:00/);
});

test('la panoramica omette le card secondarie quando temi e momenti non sono disponibili', () => {
  const base = document();
  const html = renderToStaticMarkup(
    <SessionOverview
      report={document({
        keyMoments: [],
        nextSessionPrep: [],
        sessionOverview: { ...base.sessionOverview, themes: [], emergingResource: null, metrics: [], emotionalTrend: [] },
      })}
      isApproved={false}
      previousJourneyEntry={null}
      onOpenEvidence={() => undefined}
      onOpenMoments={() => undefined}
      onOpenNotes={() => undefined}
    />
  );

  assert.doesNotMatch(html, /Temi della sessione/);
  assert.doesNotMatch(html, /Momenti chiave/);
  assert.doesNotMatch(html, />0\/5</);
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
  assert.equal(renderToStaticMarkup(<SessionCompassStatusBanner report={view()} />), '');
  assert.match(
    renderToStaticMarkup(
      <SessionCompassStatusBanner report={view({ status: 'approved', isApproved: true, reportVersion: 2 })} />
    ),
    /Report approvato \(versione 2\)\. È immutabile/
  );
  assert.equal(renderToStaticMarkup(<SessionCompassStatusBanner report={view({ isStale: true })} />), '');
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
  assert.equal(
    evidenceLabel({ ...evidence(3, 1, 'passaggio coach'), speaker: 'coach' }),
    'Passaggio del coach · 01:00'
  );
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
  assert.match(html, /Riepilogo sessione/);
  assert.match(html, /Caricamento riepilogo sessione/);
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
