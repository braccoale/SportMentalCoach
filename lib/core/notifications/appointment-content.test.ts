import assert from 'node:assert/strict';
import test from 'node:test';
import {
  athleteReportReadyContent,
  callStartedContent,
  coachCreatedAppointmentContent,
  reminder24hContent,
  rescheduledAppointmentContent,
  securityAlertContent,
} from './appointment-content';

test('una chiamata avviata porta dentro la stanza, non alla scheda', () => {
  const content = callStartedContent({ bookingId: 42, coachName: 'Marco Ferrari' });

  assert.equal(content.data.link, '/dashboard/video/42');
  assert.equal(content.title, 'Marco Ferrari ti sta chiamando');
  // Una chiamata in corso non deve leggersi come un appuntamento futuro.
  assert.doesNotMatch(`${content.title} ${content.body}`, /fissat|in calendario/i);
});

test('senza il nome del coach la chiamata resta comprensibile', () => {
  const content = callStartedContent({ bookingId: 7 });

  assert.equal(content.title, 'Il coach ti sta chiamando');
  assert.equal(content.data.link, '/dashboard/video/7');
});

test('a coach-created appointment is not described as an accepted request', () => {
  const content = coachCreatedAppointmentContent({
    bookingId: 42,
    serviceTitle: 'Gestione ansia',
  });

  assert.equal(content.title, 'Nuovo appuntamento fissato dal coach');
  assert.match(content.body, /coach ha fissato una sessione/);
  assert.doesNotMatch(`${content.title} ${content.body}`, /accettat/i);
  assert.equal(content.data.link, '/dashboard/appointments/42');
});

test('il promemoria del giorno prima apre il dettaglio, non la chat', () => {
  const content = reminder24hContent({ bookingId: 42, sessionTime: '19:00' });

  assert.equal(content.data.link, '/dashboard/appointments/42');
  assert.match(content.body, /Domani alle 19:00/);
});

test('il report condiviso apre direttamente il Compass', () => {
  const content = athleteReportReadyContent({ bookingId: 42 });

  assert.equal(
    content.data.link,
    '/dashboard/appointments/42#session-compass'
  );
  assert.match(content.body, /report privato/);
});

test('l’avviso di sicurezza porta al cambio password', () => {
  const content = securityAlertContent({ securityEvent: 'Nuovo accesso' });

  assert.equal(content.data.link, '/dashboard/settings?section=password');
  assert.match(content.body, /cambia subito la password/);
});

test('reschedule copy identifies who changed the appointment', () => {
  const coachEdit = rescheduledAppointmentContent({
    bookingId: 7,
    actor: 'coach',
    audience: 'athlete',
  });
  const athleteEdit = rescheduledAppointmentContent({
    bookingId: 7,
    actor: 'athlete',
    audience: 'coach',
  });

  assert.equal(coachEdit.title, 'Il coach ha modificato l’appuntamento');
  assert.equal(athleteEdit.title, 'L’atleta ha modificato l’appuntamento');
  assert.equal(coachEdit.data.link, '/dashboard/appointments/7');
  assert.equal(athleteEdit.data.link, '/dashboard/appointments/7');
});
