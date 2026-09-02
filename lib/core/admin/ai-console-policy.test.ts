import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_CONSOLE_MAX_PAGE,
  AI_CONSOLE_PAGE_SIZE,
  aiConsoleOffset,
  aiConsolePageCount,
  aiConsoleQueryString,
  classifyPipelineSession,
  parseAiConsoleFilters,
  pipelinePhaseFromJobs,
  retryAvailability,
  type PipelineJobSummary,
} from './ai-console-policy';

const NOW = new Date('2026-08-16T18:00:00Z');

function job(over: Partial<PipelineJobSummary> = {}): PipelineJobSummary {
  return {
    jobType: 'transcription',
    status: 'queued',
    attemptCount: 0,
    ...over,
  };
}

test('una seduta senza consenso non è un errore: è in corso', () => {
  const result = classifyPipelineSession({
    status: 'waiting_for_consent',
    lastProgressAt: new Date('2026-08-16T10:00:00Z'),
    jobs: [],
    now: NOW,
  });
  assert.equal(result.state, 'in_corso');
  assert.equal(result.phase, 'consenso');
  assert.equal(result.stuck, false);
});

test('il consenso rifiutato è un esito, non un guasto', () => {
  const result = classifyPipelineSession({
    status: 'consent_rejected',
    lastProgressAt: NOW,
    jobs: [],
    now: NOW,
  });
  assert.equal(result.state, 'rifiutato');
  assert.equal(result.stuck, false);
});

test('una seduta appena entrata in lavorazione, con lavoro mai tentato, è in coda', () => {
  const result = classifyPipelineSession({
    status: 'processing',
    lastProgressAt: new Date('2026-08-16T17:59:00Z'),
    jobs: [job()],
    now: NOW,
  });
  assert.equal(result.state, 'in_coda');
  assert.equal(result.phase, 'trascrizione');
});

test('con un tentativo alle spalle non è più «in coda»: sta lavorando', () => {
  const result = classifyPipelineSession({
    status: 'processing',
    lastProgressAt: new Date('2026-08-16T17:59:00Z'),
    jobs: [job({ status: 'processing', attemptCount: 1 })],
    now: NOW,
  });
  assert.equal(result.state, 'in_corso');
});

test('senza lavoro vivo e senza progressi da più di cinque minuti è bloccata', () => {
  const result = classifyPipelineSession({
    status: 'processing',
    lastProgressAt: new Date('2026-08-16T17:50:00Z'),
    jobs: [job({ status: 'completed', attemptCount: 1 })],
    now: NOW,
  });
  assert.equal(result.state, 'bloccato');
  assert.equal(result.stuck, true);
  assert.equal(result.stuckReason, 'no_active_work');
  assert.equal(result.phase, 'nessun_lavoro');
});

test('con lavoro vivo la pazienza è molto più lunga: la soglia è quella della pipeline', () => {
  const dentro = classifyPipelineSession({
    status: 'processing',
    lastProgressAt: new Date('2026-08-16T17:20:00Z'), // 40 minuti
    jobs: [job({ status: 'awaiting_provider', attemptCount: 1 })],
    now: NOW,
  });
  assert.equal(dentro.state, 'in_corso');

  const fuori = classifyPipelineSession({
    status: 'processing',
    lastProgressAt: new Date('2026-08-16T17:10:00Z'), // 50 minuti
    jobs: [job({ status: 'awaiting_provider', attemptCount: 1 })],
    now: NOW,
  });
  assert.equal(fuori.state, 'bloccato');
  assert.equal(fuori.stuckReason, 'work_too_slow');
});

test('uno stato terminale non è mai bloccato, per quanto vecchio sia', () => {
  for (const status of ['report_failed', 'transcription_failed'] as const) {
    const result = classifyPipelineSession({
      status,
      lastProgressAt: new Date('2026-01-01T00:00:00Z'),
      jobs: [],
      now: NOW,
    });
    assert.equal(result.state, 'fallito');
    assert.equal(result.stuck, false);
  }

  const conclusa = classifyPipelineSession({
    status: 'shared',
    lastProgressAt: new Date('2026-01-01T00:00:00Z'),
    jobs: [],
    now: NOW,
  });
  assert.equal(conclusa.state, 'completato');
  assert.equal(conclusa.phase, 'condiviso');
});

test('la fase è il lavoro vivo più avanzato', () => {
  assert.equal(
    pipelinePhaseFromJobs([job(), job({ jobType: 'report_generation' })]),
    'riepilogo'
  );
  assert.equal(
    pipelinePhaseFromJobs([job(), job({ jobType: 'transcript_normalization' })]),
    'normalizzazione'
  );
  assert.equal(pipelinePhaseFromJobs([]), 'nessun_lavoro');
});

test('i filtri accettano solo valori del set chiuso, e ignorano il resto', () => {
  const filtri = parseAiConsoleFilters({
    stato: 'bloccato',
    fase: 'riepilogo',
    coach: '42',
    errore: 'COMPASS_TIMEOUT',
    da: '2026-08-01',
    a: '2026-08-31',
    pagina: '3',
  });
  assert.deepEqual(filtri, {
    stato: 'bloccato',
    fase: 'riepilogo',
    coachProviderId: 42,
    errore: 'COMPASS_TIMEOUT',
    da: '2026-08-01',
    a: '2026-08-31',
    page: 3,
  });
});

test('un filtro storto non rompe la pagina e non arriva al database', () => {
  const filtri = parseAiConsoleFilters({
    stato: "'; drop table session_ai_notes; --",
    fase: 'inventata',
    coach: 'abc',
    errore: 'select *',
    da: '01/08/2026',
    a: '',
    pagina: '-4',
  });
  assert.deepEqual(filtri, {
    stato: null,
    fase: null,
    coachProviderId: null,
    errore: null,
    da: null,
    a: null,
    page: 1,
  });
});

test('la pagina è limitata: nessuno scorre a mano fino all’offset di un milione', () => {
  assert.equal(parseAiConsoleFilters({ pagina: '99999' }).page, AI_CONSOLE_MAX_PAGE);
  assert.equal(aiConsoleOffset(1), 0);
  assert.equal(aiConsoleOffset(3), AI_CONSOLE_PAGE_SIZE * 2);
  assert.equal(aiConsolePageCount(0), 1);
  assert.equal(aiConsolePageCount(AI_CONSOLE_PAGE_SIZE + 1), 2);
});

test('i filtri si riscrivono in un indirizzo condivisibile', () => {
  const filtri = parseAiConsoleFilters({ stato: 'fallito', pagina: '2' });
  assert.equal(aiConsoleQueryString(filtri), '?stato=fallito&pagina=2');
  // Cambiare filtro riporta a pagina uno solo se lo si chiede: qui si prova
  // che l'override vince.
  assert.equal(
    aiConsoleQueryString(filtri, { page: 1, stato: null }),
    ''
  );
});

test('una trascrizione fallita non si riapre: è chiusa per scelta', () => {
  const verdict = retryAvailability('transcription_failed', 592);
  assert.equal(verdict.allowed, false);
  assert.match(verdict.reason, /non esiste/);
});

test('un riepilogo fallito con la trascrizione in tabella si riprende', () => {
  const verdict = retryAvailability('report_failed', 592);
  assert.equal(verdict.allowed, true);
});

test('senza segmenti non c’è niente da riprendere', () => {
  assert.equal(retryAvailability('report_failed', 0).allowed, false);
});

test('una seduta riaperta e rimasta ferma si può rilanciare', () => {
  assert.equal(retryAvailability('processing', 12).allowed, true);
});

test('gli stati sani non si riaprono, e il messaggio dice quale stato è', () => {
  for (const status of ['shared', 'approved', 'ready_for_review', 'active']) {
    const verdict = retryAvailability(status, 100);
    assert.equal(verdict.allowed, false, status);
    assert.match(verdict.reason, new RegExp(status));
  }
});
