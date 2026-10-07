import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sessionUsageForPeriod } from './session-usage';

const start = new Date('2026-10-06T15:45:49Z');
const end = new Date('2026-11-06T15:45:49Z');
const day = (iso: string) => new Date(`${iso}T10:00:00Z`);

function usage(
  bookings: Array<{ status: string; scheduledFor: Date | null }>,
  sessionsPerMonth = 3
) {
  return sessionUsageForPeriod({ sessionsPerMonth, periodStart: start, periodEnd: end, bookings });
}

describe('sessionUsageForPeriod', () => {
  it('nessuna prenotazione: tutte le sedute restano', () => {
    assert.deepEqual(usage([]), {
      known: true, total: 3, done: 0, booked: 0, remaining: 3, overBooked: false,
    });
  });

  it('conta fatte, prenotate e rimaste con gli stati veri', () => {
    const result = usage([
      { status: 'completed', scheduledFor: day('2026-10-10') },
      { status: 'accepted', scheduledFor: day('2026-10-20') },
      { status: 'requested', scheduledFor: day('2026-10-25') },
    ]);
    assert.deepEqual(result, {
      known: true, total: 3, done: 1, booked: 2, remaining: 0, overBooked: false,
    });
  });

  it('le sedute annullate, rifiutate o scadute restituiscono il posto', () => {
    for (const status of ['cancelled', 'declined', 'expired']) {
      const result = usage([{ status, scheduledFor: day('2026-10-12') }]);
      assert.equal(result.known && result.remaining, 3, status);
    }
  });

  it('uno stato inventato non conta: nessun «pending» che sparisce nel nulla', () => {
    const result = usage([{ status: 'pending', scheduledFor: day('2026-10-12') }]);
    assert.equal(result.known && result.booked, 0);
  });

  it('una seduta fuori dal periodo pesa sul periodo suo, non su questo', () => {
    const result = usage([
      { status: 'completed', scheduledFor: day('2026-10-01') }, // prima
      { status: 'accepted', scheduledFor: day('2026-11-20') }, // dopo il rinnovo
    ]);
    assert.equal(result.known && result.done + result.booked, 0);
  });

  it('l’istante del rinnovo appartiene al periodo nuovo', () => {
    const atStart = usage([{ status: 'accepted', scheduledFor: start }]);
    const atEnd = usage([{ status: 'accepted', scheduledFor: end }]);
    assert.equal(atStart.known && atStart.booked, 1);
    assert.equal(atEnd.known && atEnd.booked, 0);
  });

  it('una seduta passata e non ancora completata resta prenotata, non «libera»', () => {
    const result = usage([{ status: 'accepted', scheduledFor: day('2026-10-08') }]);
    assert.equal(result.known && result.booked, 1);
    assert.equal(result.known && result.remaining, 2);
  });

  it('più sedute del piano: restano zero e lo segnala', () => {
    const result = usage(
      [
        { status: 'accepted', scheduledFor: day('2026-10-10') },
        { status: 'accepted', scheduledFor: day('2026-10-11') },
        { status: 'accepted', scheduledFor: day('2026-10-12') },
      ],
      2
    );
    assert.equal(result.known && result.remaining, 0);
    assert.equal(result.known && result.overBooked, true);
  });

  it('senza periodo certo non inventa numeri', () => {
    for (const periodStart of [null]) {
      assert.deepEqual(
        sessionUsageForPeriod({ sessionsPerMonth: 3, periodStart, periodEnd: end, bookings: [] }),
        { known: false }
      );
    }
    assert.deepEqual(
      sessionUsageForPeriod({ sessionsPerMonth: 3, periodStart: start, periodEnd: null, bookings: [] }),
      { known: false }
    );
    assert.deepEqual(
      sessionUsageForPeriod({ sessionsPerMonth: 0, periodStart: start, periodEnd: end, bookings: [] }),
      { known: false }
    );
  });

  it('una prenotazione senza data non conta', () => {
    const result = usage([{ status: 'accepted', scheduledFor: null }]);
    assert.equal(result.known && result.booked, 0);
  });
});
