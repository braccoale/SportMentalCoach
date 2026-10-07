import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeRomeDayConverter, parseRomeLocalDateTime } from './rome-time';

function everyTime(): string[] {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += 10) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

describe('makeRomeDayConverter', () => {
  // Un anno intero, giorno per giorno, compresi i due cambi d'ora: la
  // scorciatoia deve dare esattamente gli stessi istanti del calcolo orario
  // per orario.
  it('dà gli stessi istanti di parseRomeLocalDateTime per ogni giorno del 2026', () => {
    const times = everyTime();
    for (let day = 0; day < 365; day++) {
      const at = new Date(Date.UTC(2026, 0, 1 + day, 12));
      const value = at.toISOString().slice(0, 10);
      const convert = makeRomeDayConverter(value);
      for (const time of times) {
        assert.equal(
          convert(time).getTime(),
          parseRomeLocalDateTime(`${value}T${time}`)!.getTime(),
          `${value} ${time}`
        );
      }
    }
  });

  it('un giorno qualunque di luglio è UTC+2, di gennaio UTC+1', () => {
    assert.equal(makeRomeDayConverter('2026-07-10')('10:00').toISOString(), '2026-07-10T08:00:00.000Z');
    assert.equal(makeRomeDayConverter('2026-01-10')('10:00').toISOString(), '2026-01-10T09:00:00.000Z');
  });
});
