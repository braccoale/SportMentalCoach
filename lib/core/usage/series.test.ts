import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fillSeries, funnelRates, gaugePosition, gaugeZones, lastDays, romeToday, shortDay, trend } from './series';

describe('giorni', () => {
  it('oggi è il giorno di Roma, non quello UTC', () => {
    assert.equal(romeToday(new Date('2026-10-10T12:00:00Z')), '2026-10-10');
    // 23:30 UTC di sabato sono già le 01:30 di domenica a Roma (ora legale)
    assert.equal(romeToday(new Date('2026-10-10T23:30:00Z')), '2026-10-11');
  });
  it('gli ultimi giorni sono continui e in ordine, anche a cavallo del mese', () => {
    assert.deepEqual(lastDays(3, '2026-10-02'), ['2026-09-30', '2026-10-01', '2026-10-02']);
    assert.equal(lastDays(30, '2026-10-10').length, 30);
    assert.equal(lastDays(30, '2026-10-10').at(-1), '2026-10-10');
  });
  it('l’etichetta è corta e non dipende dalla lingua del sistema', () => {
    assert.equal(shortDay('2026-10-09'), '9 ott');
    assert.equal(shortDay('2026-01-31'), '31 gen');
  });
});

describe('serie', () => {
  it('riempie a zero i giorni senza dati e mantiene gli altri', () => {
    const days = lastDays(3, '2026-10-03');
    const out = fillSeries([{ day: '2026-10-02', views: 5, uniques: 2 }], days, ['views', 'uniques']);
    assert.deepEqual(out, [
      { day: '2026-10-01', views: 0, uniques: 0 },
      { day: '2026-10-02', views: 5, uniques: 2 },
      { day: '2026-10-03', views: 0, uniques: 0 },
    ]);
  });
});

describe('tendenza', () => {
  it('confronta gli ultimi sette giorni con i sette prima', () => {
    const values = [...Array(7).fill(1), ...Array(7).fill(2)];
    assert.deepEqual(trend(values), { current: 14, previous: 7, percent: 100 });
    assert.deepEqual(trend([...Array(7).fill(2), ...Array(7).fill(1)]), { current: 7, previous: 14, percent: -50 });
  });
  it('da zero non c’è una percentuale da dire', () => {
    assert.equal(trend([...Array(7).fill(0), ...Array(7).fill(3)]).percent, null);
    assert.equal(trend([]).percent, null);
  });
});

describe('percorso', () => {
  it('le percentuali sul passo prima e sul primo', () => {
    const rows = funnelRates([
      { event: 'a', users: 10 },
      { event: 'b', users: 5 },
      { event: 'c', users: 1 },
    ]);
    assert.deepEqual(rows.map((r) => r.fromPrevious), [null, 50, 20]);
    assert.deepEqual(rows.map((r) => r.fromFirst), [null, 50, 10]);
  });
  it('senza persone nel passo prima, nessuna percentuale; e mai oltre il cento', () => {
    const rows = funnelRates([
      { event: 'a', users: 0 },
      { event: 'b', users: 3 },
    ]);
    assert.equal(rows[1].fromPrevious, null);
    assert.equal(funnelRates([{ event: 'a', users: 2 }, { event: 'b', users: 5 }])[1].fromPrevious, 100);
    assert.deepEqual(funnelRates([]), []);
  });
});

describe('barra dei tempi', () => {
  it('il valore cade dove le soglie dicono, e non esce dalla barra', () => {
    const t: [number, number] = [2500, 4000];
    assert.equal(gaugePosition(0, t), 0);
    assert.equal(gaugePosition(999_999, t), 100);
    assert.ok(gaugePosition(2500, t) < gaugePosition(4000, t));
  });
  it('le tre fasce occupano tutta la barra', () => {
    const zones = gaugeZones([2500, 4000]);
    assert.ok(Math.abs(zones.reduce((a, b) => a + b, 0) - 100) < 1e-9);
    assert.ok(zones.every((z) => z > 0));
  });
});
