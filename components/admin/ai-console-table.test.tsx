import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiConsoleFiltersForm, AiConsoleTable } from './ai-console-table';
import {
  classifyPipelineSession,
  parseAiConsoleFilters,
} from '@/lib/core/admin/ai-console-policy';
import type { AiConsoleRow } from '@/lib/core/admin/ai-console';

/**
 * La tabella operativa, vista come la vede chi apre la pagina.
 *
 * Due cose si provano qui e in nessun altro posto: che **l'atleta non compare
 * come persona**, e che la tabella **scorre invece di traboccare** — dodici
 * colonne su un telefono devono stare in un contenitore che scorre da solo,
 * non spingere fuori schermo il resto della pagina.
 */

const NOW = new Date('2026-08-16T18:00:00Z');

function row(over: Partial<AiConsoleRow> = {}): AiConsoleRow {
  return {
    sessionId: 72,
    bookingId: 181,
    athleteUserId: 44,
    coachName: 'Marta Verdi',
    coachProviderId: 100,
    scheduledFor: new Date('2026-08-16T15:00:00Z'),
    startedAt: new Date('2026-08-16T15:02:00Z'),
    endedAt: new Date('2026-08-16T16:00:00Z'),
    audioSeconds: 3300,
    status: 'report_failed',
    errorCode: 'COMPASS_TIMEOUT',
    provider: 'openai',
    model: 'gpt-5-mini',
    promptVersion: 'compass-3',
    attempts: 2,
    transcriptSegments: 592,
    processingSeconds: 2700,
    updatedAt: new Date('2026-08-16T17:10:00Z'),
    costEur: null,
    classification: classifyPipelineSession({
      status: 'report_failed',
      lastProgressAt: new Date('2026-08-16T17:10:00Z'),
      jobs: [],
      now: NOW,
    }),
    ...over,
  };
}

const FILTERS = parseAiConsoleFilters({});

test('l’atleta compare come identificativo, il coach come professionista', () => {
  const html = renderToStaticMarkup(
    <AiConsoleTable
      rows={[row()]}
      total={1}
      filters={FILTERS}
      costConfigured={false}
      periodKey="7g"
    />
  );
  assert.match(html, /atleta 44/);
  assert.match(html, /Marta Verdi/);
});

test('lo stato e il codice d’errore sono leggibili senza aprire il dettaglio', () => {
  const html = renderToStaticMarkup(
    <AiConsoleTable
      rows={[row()]}
      total={1}
      filters={FILTERS}
      costConfigured={false}
      periodKey="7g"
    />
  );
  assert.match(html, /Fallita/);
  assert.match(html, /COMPASS_TIMEOUT/);
  assert.match(html, /gpt-5-mini/);
  assert.match(html, /href="\/dashboard\/admin\/ai\/72"/);
});

test('senza tariffe configurate la colonna del costo non esiste', () => {
  const senza = renderToStaticMarkup(
    <AiConsoleTable
      rows={[row()]}
      total={1}
      filters={FILTERS}
      costConfigured={false}
      periodKey="7g"
    />
  );
  assert.doesNotMatch(senza, /Costo stimato/);

  const con = renderToStaticMarkup(
    <AiConsoleTable
      rows={[row({ costEur: 0.42 })]}
      total={1}
      filters={FILTERS}
      costConfigured
      periodKey="7g"
    />
  );
  assert.match(con, /Costo stimato/);
  assert.match(con, /0,42 €/);
});

test('la tabella scorre dentro il suo contenitore, non fuori dalla pagina', () => {
  const html = renderToStaticMarkup(
    <AiConsoleTable
      rows={[row()]}
      total={1}
      filters={FILTERS}
      costConfigured={false}
      periodKey="7g"
    />
  );
  assert.match(html, /overflow-x-auto/);
  assert.match(html, /min-w-\[1180px\]/);
});

test('la paginazione è del server: dice dove si è e porta la pagina successiva', () => {
  const html = renderToStaticMarkup(
    <AiConsoleTable
      rows={[row()]}
      total={130}
      filters={FILTERS}
      costConfigured={false}
      periodKey="7g"
    />
  );
  assert.match(html, /1–25 di 130/);
  assert.match(html, /pagina 1 di 6/);
  assert.match(html, /pagina=2/);
  assert.match(html, /periodo=7g/);
  // La precedente non è un collegamento quando non c'è.
  assert.doesNotMatch(html, /href="[^"]*pagina=0/);
});

test('nessuna riga con filtri attivi: lo dice, e dice di azzerarli', () => {
  const html = renderToStaticMarkup(
    <AiConsoleTable
      rows={[]}
      total={0}
      filters={parseAiConsoleFilters({ stato: 'bloccato' })}
      costConfigured={false}
      periodKey="7g"
    />
  );
  assert.match(html, /Nessuna seduta con questi filtri/);
  assert.match(html, /Azzerali/);
});

test('nessuna riga senza filtri: non è un errore, è un periodo senza sedute', () => {
  const html = renderToStaticMarkup(
    <AiConsoleTable
      rows={[]}
      total={0}
      filters={FILTERS}
      costConfigured={false}
      periodKey="7g"
    />
  );
  assert.match(html, /Non è un errore/);
});

test('i filtri sono un modulo GET: nessuno stato nel browser, tutto nell’indirizzo', () => {
  const html = renderToStaticMarkup(
    <AiConsoleFiltersForm
      filters={FILTERS}
      coaches={[{ providerId: 100, name: 'Marta Verdi' }]}
      errorCodes={[{ code: 'COMPASS_TIMEOUT', count: 3 }]}
      periodKey="30g"
    />
  );
  assert.match(html, /method="get"/);
  assert.match(html, /action="\/dashboard\/admin\/ai"/);
  assert.match(html, /name="periodo" value="30g"/);
  assert.match(html, /COMPASS_TIMEOUT \(3\)/);
  // La soglia è dichiarata: la regola si spiega, non si subisce.
  assert.match(html, /È la stessa soglia con cui la pipeline chiude/);
});
