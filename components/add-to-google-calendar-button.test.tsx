import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AddToGoogleCalendarButton,
  GoogleCalendarFeedback,
  openGoogleCalendar,
} from './add-to-google-calendar-button';

const calendarUrl =
  'https://calendar.google.com/calendar/render?action=TEMPLATE';

test('calendar button renders an accessible responsive CTA', () => {
  const html = renderToStaticMarkup(
    <AddToGoogleCalendarButton
      url={calendarUrl}
      uiSource="appointment_detail"
      userRole="athlete"
    />
  );

  assert.match(html, /Aggiungi a Google Calendar/);
  assert.match(html, /aria-label="Aggiungi a Google Calendar"/);
  assert.match(html, /w-full sm:w-auto/);
  assert.match(html, /type="button"/);
});

test('calendar button is absent when eligibility produced no URL', () => {
  const html = renderToStaticMarkup(
    <AddToGoogleCalendarButton
      url={null}
      uiSource="appointment_card"
      userRole="coach"
    />
  );
  assert.equal(html, '');
});

test('opening uses a new tab with noopener and noreferrer', () => {
  const calls: unknown[][] = [];
  const result = openGoogleCalendar(calendarUrl, (...args) => {
    calls.push(args);
    return {} as Window;
  });

  assert.equal(result.status, 'opened');
  assert.deepEqual(calls, [
    [calendarUrl, '_blank', 'noopener,noreferrer'],
  ]);
});

test('popup-blocked result preserves the URL and renders a safe direct link', () => {
  const result = openGoogleCalendar(calendarUrl, () => null);
  assert.deepEqual(result, { status: 'blocked', url: calendarUrl });

  const html = renderToStaticMarkup(
    <GoogleCalendarFeedback result={result} />
  );
  assert.match(html, /browser ha bloccato/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /calendar\.google\.com/);
});

