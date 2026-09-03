import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminPeriodRange,
  periodDelta,
  resolveAdminPeriod,
  romeDayStart,
  romeDayStartShifted,
  romeMonthStart,
} from './period';

test('il giorno comincia a mezzanotte a Roma, non a mezzanotte UTC', () => {
  // 30 giugno 2026, 23:30 a Roma (ora legale, UTC+2) è il 30 alle 21:30 UTC.
  const start = romeDayStart(new Date('2026-06-30T21:30:00Z'));
  assert.equal(start.toISOString(), '2026-06-29T22:00:00.000Z');
});

test('a fine giornata UTC il giorno di Roma è ancora quello di prima', () => {
  // 22:10 UTC del 30 giugno = 00:10 del primo luglio a Roma: il giorno di
  // calendario è già cambiato, e il confine deve seguirlo.
  const start = romeDayStart(new Date('2026-06-30T22:10:00Z'));
  assert.equal(start.toISOString(), '2026-06-30T22:00:00.000Z');
});

test('in ora solare il confine si sposta di un’ora', () => {
  // 15 gennaio 2026, 10:00 a Roma (UTC+1).
  const start = romeDayStart(new Date('2026-01-15T09:00:00Z'));
  assert.equal(start.toISOString(), '2026-01-14T23:00:00.000Z');
});

test('lo spostamento di giorni attraversa il cambio d’ora senza perdere un’ora', () => {
  // Il 25 ottobre 2026 l'Italia torna all'ora solare. Sette giorni prima del
  // 27 ottobre è il 21: se l'offset fosse preso una volta sola, il confine
  // cadrebbe alle 23:00 del 20 invece che alle 22:00.
  const start = romeDayStartShifted(new Date('2026-10-27T10:00:00Z'), -6);
  assert.equal(start.toISOString(), '2026-10-20T22:00:00.000Z');
});

test('«oggi» copre un giorno solo, «7 giorni» ne copre sette compreso oggi', () => {
  const now = new Date('2026-06-30T12:00:00Z');

  const oggi = adminPeriodRange('oggi', now);
  assert.equal(oggi.days, 1);
  assert.equal(oggi.from.toISOString(), '2026-06-29T22:00:00.000Z');
  assert.equal(oggi.to, now);

  const settimana = adminPeriodRange('7g', now);
  assert.equal(settimana.days, 7);
  assert.equal(settimana.from.toISOString(), '2026-06-23T22:00:00.000Z');
});

test('il periodo precedente ha la stessa durata di quello corrente', () => {
  const now = new Date('2026-06-30T12:00:00Z');
  const settimana = adminPeriodRange('7g', now);

  assert.equal(settimana.previousTo.getTime(), settimana.from.getTime());
  const durata = settimana.previousTo.getTime() - settimana.previousFrom.getTime();
  assert.equal(durata, 7 * 24 * 3_600_000);
});

test('un periodo sconosciuto non rompe la pagina: torna il predefinito', () => {
  assert.equal(resolveAdminPeriod('90g'), '7g');
  assert.equal(resolveAdminPeriod(null), '7g');
  assert.equal(resolveAdminPeriod(undefined), '7g');
  assert.equal(resolveAdminPeriod(['30g']), '30g');
  assert.equal(resolveAdminPeriod('oggi'), 'oggi');
});

test('la variazione non si calcola da un periodo precedente vuoto', () => {
  assert.equal(periodDelta(5, 0), null);
  assert.equal(periodDelta(0, 0), null);
  assert.deepEqual(periodDelta(12, 10), { percent: 20, direction: 'up' });
  assert.deepEqual(periodDelta(8, 10), { percent: -20, direction: 'down' });
  assert.deepEqual(periodDelta(10, 10), { percent: 0, direction: 'flat' });
});

test('i dodici mesi partono dal primo del mese, non da 365 giorni fa', () => {
  // 2 settembre 2026: dodici mesi comprendono ottobre 2025 → settembre 2026.
  const periodo = adminPeriodRange('12m', new Date('2026-09-02T10:00:00Z'));
  assert.equal(periodo.granularity, 'mese');
  // 1 ottobre 2025 a mezzanotte a Roma (ora legale fino al 26 ottobre: UTC+2).
  assert.equal(periodo.from.toISOString(), '2025-09-30T22:00:00.000Z');
  // Il periodo precedente ha la stessa forma: altri dodici mesi di calendario.
  assert.equal(periodo.previousFrom.toISOString(), '2024-09-30T22:00:00.000Z');
  assert.equal(periodo.previousTo.getTime(), periodo.from.getTime());
});

test('il mese di calendario comincia a mezzanotte a Roma, non a mezzanotte UTC', () => {
  // Gennaio è in ora solare (UTC+1), agosto in ora legale (UTC+2): il confine
  // si sposta, e prenderlo fisso perderebbe un'ora di sedute due volte l'anno.
  assert.equal(
    romeMonthStart(new Date('2026-01-15T09:00:00Z')).toISOString(),
    '2025-12-31T23:00:00.000Z'
  );
  assert.equal(
    romeMonthStart(new Date('2026-08-15T09:00:00Z')).toISOString(),
    '2026-07-31T22:00:00.000Z'
  );
});

test('contare i mesi all’indietro cambia anno da solo', () => {
  assert.equal(
    romeMonthStart(new Date('2026-02-10T12:00:00Z'), 3).toISOString(),
    '2025-10-31T23:00:00.000Z'
  );
});

test('«12m» è un periodo valido; il resto resta ignorato', () => {
  assert.equal(resolveAdminPeriod('12m'), '12m');
  assert.equal(resolveAdminPeriod('365g'), '7g');
});

test('i periodi a giorni restano a granularità giornaliera', () => {
  for (const key of ['oggi', '7g', '30g'] as const) {
    assert.equal(adminPeriodRange(key).granularity, 'giorno');
  }
});
