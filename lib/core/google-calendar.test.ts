import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGoogleCalendarUrl,
  formatGoogleCalendarUtcDate,
} from './google-calendar';
import {
  buildBookingCalendarEvent,
  buildBookingGoogleCalendarUrl,
} from './booking-calendar';

test('buildGoogleCalendarUrl creates an encoded Google template URL', () => {
  const url = new URL(
    buildGoogleCalendarUrl({
      title: "Sessione KaiPai con Niccolò D'Angelo",
      startAt: '2026-07-28T15:30:00.000Z',
      endAt: '2026-07-28T16:30:00.000Z',
      description:
        'Descrizione con spazi e accenti.\nhttps://kaipai.example/appuntamenti/42',
      location: 'Online su KaiPai',
      timezone: 'Europe/Rome',
    })
  );

  assert.equal(url.origin, 'https://calendar.google.com');
  assert.equal(url.pathname, '/calendar/render');
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(
    url.searchParams.get('text'),
    "Sessione KaiPai con Niccolò D'Angelo"
  );
  assert.equal(
    url.searchParams.get('dates'),
    '20260728T153000Z/20260728T163000Z'
  );
  assert.equal(
    url.searchParams.get('details'),
    'Descrizione con spazi e accenti.\nhttps://kaipai.example/appuntamenti/42'
  );
  assert.equal(url.searchParams.get('location'), 'Online su KaiPai');
  assert.equal(url.searchParams.get('ctz'), 'Europe/Rome');
  assert.match(url.toString(), /Niccol%C3%B2/);
  assert.match(url.toString(), /Online\+su\+KaiPai/);
});

test('buildGoogleCalendarUrl omits optional empty fields', () => {
  const url = new URL(
    buildGoogleCalendarUrl({
      title: 'Sessione KaiPai',
      startAt: new Date('2026-01-01T09:00:00Z'),
      endAt: new Date('2026-01-01T09:45:00Z'),
      description: '  ',
    })
  );

  assert.equal(url.searchParams.has('details'), false);
  assert.equal(url.searchParams.has('location'), false);
  assert.equal(url.searchParams.has('ctz'), false);
});

test('UTC formatting is independent of display timezone and DST', () => {
  assert.equal(
    formatGoogleCalendarUtcDate('2026-03-29T00:30:00+01:00'),
    '20260328T233000Z'
  );
  assert.equal(
    formatGoogleCalendarUtcDate('2026-10-25T02:30:00+01:00'),
    '20261025T013000Z'
  );
});

test('buildGoogleCalendarUrl rejects invalid or incomplete date ranges', () => {
  assert.throws(
    () =>
      buildGoogleCalendarUrl({
        title: 'Sessione',
        startAt: 'not-a-date',
        endAt: '2026-01-01T10:00:00Z',
      }),
    /inizio non valida/
  );
  assert.throws(
    () =>
      buildGoogleCalendarUrl({
        title: 'Sessione',
        startAt: '2026-01-01T10:00:00Z',
      }),
    /fine mancante/
  );
  assert.throws(
    () =>
      buildGoogleCalendarUrl({
        title: 'Sessione',
        startAt: '2026-01-01T10:00:00Z',
        endAt: '2026-01-01T09:59:00Z',
      }),
    /successiva/
  );
});

test('booking mapper calculates the end, uses the counterpart and excludes private notes', () => {
  const event = buildBookingCalendarEvent(
    {
      id: 42,
      status: 'accepted',
      scheduledFor: '2026-07-28T15:30:00Z',
      durationMin: 60,
      coachName: 'Giulia Coach',
      athleteName: 'Marco Atleta',
      viewerRole: 'athlete',
      appBaseUrl: 'https://kaipai.example',
      canView: true,
      isOnline: true,
    },
    new Date('2026-07-01T00:00:00Z')
  );

  assert.ok(event);
  assert.equal(event.input.title, 'Sessione KaiPai con Giulia Coach');
  assert.equal(event.endAt.toISOString(), '2026-07-28T16:30:00.000Z');
  assert.match(event.input.description ?? '', /Coach: Giulia Coach/);
  assert.match(event.input.description ?? '', /Atleta: Marco Atleta/);
  assert.match(
    event.input.description ?? '',
    /https:\/\/kaipai\.example\/dashboard\/appointments\/42/
  );
  assert.match(
    event.input.description ?? '',
    /https:\/\/kaipai\.example\/dashboard\/video\/42/
  );
  assert.doesNotMatch(event.input.description ?? '', /note|obiettivo|email/i);
});

test('booking mapper hides the CTA for closed, past, incomplete or unauthorized bookings', () => {
  const base = {
    id: 7,
    status: 'accepted',
    scheduledFor: '2026-08-01T10:00:00Z',
    durationMin: 50,
    viewerRole: 'coach' as const,
    appBaseUrl: 'https://kaipai.example',
    canView: true,
  };
  const now = new Date('2026-07-25T00:00:00Z');

  assert.equal(
    buildBookingGoogleCalendarUrl({ ...base, status: 'cancelled' }, now),
    null
  );
  assert.equal(
    buildBookingGoogleCalendarUrl(
      { ...base, scheduledFor: '2026-07-01T10:00:00Z' },
      now
    ),
    null
  );
  assert.equal(
    buildBookingGoogleCalendarUrl({ ...base, durationMin: null }, now),
    null
  );
  assert.equal(
    buildBookingGoogleCalendarUrl({ ...base, canView: false }, now),
    null
  );
});

test('missing counterpart name falls back to Sessione KaiPai', () => {
  const event = buildBookingCalendarEvent(
    {
      id: 8,
      status: 'requested',
      scheduledFor: '2026-08-01T10:00:00Z',
      durationMin: 50,
      viewerRole: 'athlete',
      appBaseUrl: 'https://kaipai.example',
      canView: true,
    },
    new Date('2026-07-25T00:00:00Z')
  );
  assert.equal(event?.input.title, 'Sessione KaiPai');
  assert.equal(event?.videoUrl, null);
});

