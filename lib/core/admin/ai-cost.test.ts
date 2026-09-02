import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateAiCost,
  formatEur,
  hasAnyAiCostRate,
  readAiCostRates,
} from './ai-cost';

const USAGE = { audioMinutes: 120, reportsGenerated: 4, sessionsWithReport: 4 };

test('senza tariffe configurate non si mostra un costo: si mostra che non c’è', () => {
  const rates = readAiCostRates({});
  assert.equal(hasAnyAiCostRate(rates), false);

  const stima = estimateAiCost(USAGE, rates);
  assert.equal(stima.totalEur, null);
  assert.equal(stima.perSessionEur, null);
  assert.equal(stima.overThreshold, false);
  assert.equal(formatEur(stima.totalEur), 'non configurato');
});

test('con una sola tariffa il totale esiste ed è dichiaratamente parziale', () => {
  const rates = readAiCostRates({
    AI_NOTES_COST_STT_EUR_PER_MINUTE: '0.005',
  });
  const stima = estimateAiCost(USAGE, rates);
  assert.equal(stima.sttEur, 0.6);
  assert.equal(stima.reportEur, null);
  assert.equal(stima.totalEur, 0.6);
});

test('con entrambe le tariffe il totale e la media per seduta sono aritmetica', () => {
  const rates = readAiCostRates({
    AI_NOTES_COST_STT_EUR_PER_MINUTE: '0.01',
    AI_NOTES_COST_REPORT_EUR: '0.20',
  });
  const stima = estimateAiCost(USAGE, rates);
  assert.equal(stima.sttEur, 1.2);
  assert.equal(stima.reportEur, 0.8);
  assert.equal(stima.totalEur, 2);
  assert.equal(stima.perSessionEur, 0.5);
});

test('senza sedute con riepilogo non si divide per zero', () => {
  const rates = readAiCostRates({ AI_NOTES_COST_REPORT_EUR: '0.20' });
  const stima = estimateAiCost(
    { audioMinutes: 0, reportsGenerated: 0, sessionsWithReport: 0 },
    rates
  );
  assert.equal(stima.perSessionEur, null);
});

test('la soglia esiste solo se configurata', () => {
  const senza = estimateAiCost(
    USAGE,
    readAiCostRates({ AI_NOTES_COST_REPORT_EUR: '1000' })
  );
  assert.equal(senza.overThreshold, false);
  assert.equal(senza.threshold, null);

  const con = estimateAiCost(
    USAGE,
    readAiCostRates({
      AI_NOTES_COST_REPORT_EUR: '1000',
      AI_NOTES_COST_ALERT_EUR: '100',
    })
  );
  assert.equal(con.totalEur, 4000);
  assert.equal(con.overThreshold, true);
  assert.equal(con.threshold, 100);
});

test('una tariffa illeggibile vale come assente, non come zero', () => {
  const rates = readAiCostRates({
    AI_NOTES_COST_STT_EUR_PER_MINUTE: 'gratis',
    AI_NOTES_COST_REPORT_EUR: '-2',
  });
  assert.equal(rates.sttPerMinute, null);
  assert.equal(rates.reportEach, null);
});

test('la virgola decimale è accettata: le tariffe si copiano da un listino', () => {
  assert.equal(
    readAiCostRates({ AI_NOTES_COST_STT_EUR_PER_MINUTE: '0,004' }).sttPerMinute,
    0.004
  );
});

test('l’importo si formatta senza Intl: il runner di CI non ha la stessa ICU', () => {
  assert.equal(formatEur(0), '0,00 €');
  assert.equal(formatEur(1234.5), '1.234,50 €');
  assert.equal(formatEur(1234567.891), '1.234.567,89 €');
});
