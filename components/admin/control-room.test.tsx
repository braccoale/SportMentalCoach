import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AttentionPanel,
  EmptyBlock,
  ErrorBlock,
  KpiCard,
  KpiSkeleton,
  PeriodSelector,
  PipelineFunnel,
  ServiceHealthPanel,
} from './control-room';
import { buildAttentionItems } from '@/lib/core/admin/attention';
import { assessService } from '@/lib/core/admin/service-health';
import type { AdminKpi } from '@/lib/core/admin/overview';

/**
 * Quello che si vede arrivando sulla pagina.
 *
 * Non è una prova di estetica: è la prova che i quattro stati esistono
 * davvero. Un pannello senza stato vuoto mostra una cornice muta e lascia
 * chi guarda a chiedersi se stia caricando; uno senza stato d'errore mostra
 * zero e fa sembrare sano un sistema che non è stato letto.
 */

const KPI: AdminKpi = {
  key: 'coach-da-approvare',
  label: 'Coach da approvare',
  value: 3,
  description: 'Profili inviati per la revisione e non ancora decisi.',
  scope: 'Dall’inizio',
  href: '/dashboard/admin/coach?stato=pending',
  delta: null,
  tone: 'attenzione',
};

test('una card KPI dichiara valore, significato, periodo e dove porta', () => {
  const html = renderToStaticMarkup(<KpiCard kpi={KPI} />);
  assert.match(html, />3</);
  assert.match(html, /Profili inviati per la revisione/);
  assert.match(html, /Dall’inizio/);
  assert.match(html, /href="\/dashboard\/admin\/coach\?stato=pending"/);
});

test('una card senza collegamento non finge di essere cliccabile', () => {
  const html = renderToStaticMarkup(
    <KpiCard kpi={{ ...KPI, href: null }} />
  );
  assert.doesNotMatch(html, /<a /);
});

test('lo scheletro di caricamento esiste e non contiene numeri inventati', () => {
  const html = renderToStaticMarkup(<KpiSkeleton />);
  assert.match(html, /animate-pulse/);
  // Il testo, non gli attributi: le classi Tailwind sono piene di cifre, e
  // quello che non deve esserci è un numero *mostrato* mentre si carica.
  const testo = html.replace(/<[^>]*>/g, '').trim();
  assert.equal(testo, '');
});

test('senza niente da fare il pannello lo dice, e dice anche che non è un certificato', () => {
  const html = renderToStaticMarkup(<AttentionPanel items={[]} />);
  assert.match(html, /Niente che richieda un intervento/);
  assert.match(html, /non è un certificato che tutto funzioni/);
});

test('ogni voce del pannello porta un’azione e un collegamento filtrato', () => {
  const items = buildAttentionItems({
    coachDaApprovare: 2,
    trascrizioniFallite: 0,
    reportFalliti: 1,
    jobMaiPresi: 0,
    attesaMassimaMinuti: null,
    sessioniFerme: 0,
    registrazioniFallite: 0,
    minoriSenzaAutorizzazione: 0,
    emailFallite: 0,
    costoOltreSoglia: null,
  });
  const html = renderToStaticMarkup(<AttentionPanel items={items} />);

  assert.match(html, /Apri e riprendi/);
  assert.match(html, /Apri la coda di revisione/);
  assert.match(html, /href="\/dashboard\/admin\/ai\?stato=report_fallito"/);
  // Il critico non c'è: nessuna voce inventata quando il conteggio è zero.
  assert.doesNotMatch(html, /CRITICO/i);
});

test('un servizio senza osservazioni si mostra «Non monitorato», non verde', () => {
  const html = renderToStaticMarkup(
    <ServiceHealthPanel
      services={[
        assessService({
          key: 'trascrizione',
          label: 'Trascrizione',
          configured: false,
          unconfiguredReason: 'Nessun fornitore configurato.',
          ok: null,
          failed: null,
          measures: 'job conclusi nel periodo',
        }),
      ]}
    />
  );
  assert.match(html, /Non monitorato/);
  assert.doesNotMatch(html, /Operativo/);
  // La spiegazione è nel tooltip: la regola si spiega, non si subisce.
  assert.match(html, /job conclusi nel periodo/);
});

test('lo stato d’errore offre di riprovare, e il riprova è un indirizzo vero', () => {
  const html = renderToStaticMarkup(
    <ErrorBlock
      title="La panoramica non si è caricata"
      detail="Una delle letture aggregate non ha risposto."
      retryHref="/dashboard/admin?periodo=7g"
    />
  );
  assert.match(html, /Riprova/);
  assert.match(html, /href="\/dashboard\/admin\?periodo=7g"/);
});

test('uno stato vuoto dice perché è vuoto e cosa aspettarsi', () => {
  const html = renderToStaticMarkup(
    <EmptyBlock
      title="Nessuna seduta con Appunti AI nel periodo"
      detail="Non è un errore: nel periodo scelto la funzione non è stata avviata."
    />
  );
  assert.match(html, /Nessuna seduta con Appunti AI nel periodo/);
  assert.match(html, /Non è un errore/);
});

test('l’imbuto mostra quante sedute si perdono a ogni passo', () => {
  const html = renderToStaticMarkup(
    <PipelineFunnel
      steps={[
        { key: 'sedute', label: 'Sedute', value: 10, note: 'avviate' },
        { key: 'audio', label: 'Con audio', value: 7, note: 'archiviato' },
        { key: 'report', label: 'Con riepilogo', value: 7, note: 'generato' },
      ]}
    />
  );
  assert.match(html, /−3/);
  // Nessuna perdita fra audio e riepilogo: niente segno meno di troppo.
  assert.equal(html.match(/−/g)?.length, 1);
});

test('l’imbuto vuoto non mostra barre a zero: dice che non c’è nulla da seguire', () => {
  const html = renderToStaticMarkup(
    <PipelineFunnel
      steps={[{ key: 'sedute', label: 'Sedute', value: 0, note: 'avviate' }]}
    />
  );
  assert.match(html, /Nessuna seduta con Appunti AI nel periodo/);
});

test('il selettore di periodo è fatto di collegamenti: un periodo si incolla in chat', () => {
  const html = renderToStaticMarkup(
    <PeriodSelector current="7g" basePath="/dashboard/admin" />
  );
  assert.match(html, /href="\/dashboard\/admin\?periodo=oggi"/);
  assert.match(html, /href="\/dashboard\/admin\?periodo=7g"/);
  assert.match(html, /href="\/dashboard\/admin\?periodo=30g"/);
  assert.match(html, /aria-current="true"/);
});
