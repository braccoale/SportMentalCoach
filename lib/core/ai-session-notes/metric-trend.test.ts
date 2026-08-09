import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMetricTrend,
  metricTrendLabel,
  MIN_TREND_POINTS,
} from './metric-trend';

const point = (sessionId: number, value: number) => ({ sessionId, value });

test('sotto tre punti non si disegna una tendenza', () => {
  assert.equal(MIN_TREND_POINTS, 3);
  assert.equal(buildMetricTrend([point(1, 3), point(2, 4)]), null);
});

test('il delta e in punti sulla scala, mai in percentuale', () => {
  const trend = buildMetricTrend([point(1, 2), point(2, 3), point(3, 4)])!;
  assert.equal(trend.deltaPoints, 2);
  assert.equal(trend.direction, 'su');
  assert.equal(metricTrendLabel(trend), 'In crescita di 2 punti');
});

test('un solo gradino usa il singolare', () => {
  const trend = buildMetricTrend([point(1, 3), point(2, 3), point(3, 4)])!;
  assert.equal(metricTrendLabel(trend), 'In crescita di 1 punto');
});

test('una metrica in calo viene detta senza addolcirla', () => {
  const trend = buildMetricTrend([point(1, 5), point(2, 4), point(3, 2)])!;
  assert.equal(trend.direction, 'giu');
  assert.equal(metricTrendLabel(trend), 'In calo di 3 punti');
});

test('una serie piatta si disegna a meta altezza, non a terra', () => {
  const trend = buildMetricTrend([point(1, 3), point(2, 3), point(3, 3)])!;
  assert.equal(trend.direction, 'stabile');
  assert.equal(metricTrendLabel(trend), 'Stabile nel percorso');
  for (const pair of trend.polyline.split(' ')) {
    assert.equal(pair.split(',')[1], '50.0');
  }
});

test('la polilinea copre tutta la larghezza e inverte l asse verticale', () => {
  const trend = buildMetricTrend([point(1, 1), point(2, 3), point(3, 5)])!;
  assert.equal(trend.polyline, '0.0,100.0 50.0,50.0 100.0,0.0');
});
