import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

/**
 * Le rotte dentro cui gira la generazione di un riepilogo.
 *
 * Il tetto di una funzione e il timeout del provider sono due numeri in due
 * posti diversi, e quando si scollegano non c'è nessun errore da leggere: la
 * funzione viene uccisa a metà generazione, il job resta appeso e riparte dopo
 * mezz'ora. Su Hobby il tetto era 60 secondi e il provider ne usava 45; su Pro
 * il tetto è 300 e il provider si può portare a 240 con
 * `AI_NOTES_COMPASS_TIMEOUT_MS`. Questo test impedisce che qualcuno riporti un
 * tetto a 60 mentre la variabile in produzione è a 240.
 */
const ROTTE_CON_GENERAZIONE = [
  'app/(dashboard)/dashboard/admin/ai-notes/page.tsx',
  'app/(dashboard)/dashboard/appointments/[id]/page.tsx',
  'app/(dashboard)/dashboard/coach/page.tsx',
  'app/api/academy/recording/stt-callback/[token]/route.ts',
  'app/api/ai-session-notes/[id]/close/route.ts',
  'app/api/appointments/[appointmentId]/ai-session-notes/route.ts',
  'app/api/coach/ai-session-notes/[sessionId]/compass/regenerate/route.ts',
  'app/api/coach/ai-session-notes/[sessionId]/compass/route.ts',
  'app/api/internal/ai-notes/process/route.ts',
  'app/api/internal/ai-notes/stt-callback/[token]/route.ts',
];

/** Timeout massimo del provider che si prevede di impostare in produzione. */
const TIMEOUT_PROVIDER_SECONDI = 240;
/** Tempo che deve restare per validare il risultato e scriverlo sul database. */
const MARGINE_SECONDI = 30;

function maxDurationDi(percorso: string): number {
  const sorgente = readFileSync(join(process.cwd(), percorso), 'utf8');
  const trovato = sorgente.match(/export const maxDuration = (\d+);/);
  assert.ok(trovato, `${percorso}: manca \`export const maxDuration\``);
  return Number(trovato[1]);
}

for (const percorso of ROTTE_CON_GENERAZIONE) {
  test(`${percorso}: il tetto lascia il timeout del provider più un margine`, () => {
    assert.ok(
      maxDurationDi(percorso) >= TIMEOUT_PROVIDER_SECONDI + MARGINE_SECONDI,
      `${percorso} ha un tetto troppo basso per un provider a ${TIMEOUT_PROVIDER_SECONDI} s`
    );
  });
}
