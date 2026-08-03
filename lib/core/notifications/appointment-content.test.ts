import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coachCreatedAppointmentContent,
  rescheduledAppointmentContent,
} from './appointment-content';

test('a coach-created appointment is not described as an accepted request', () => {
  const content = coachCreatedAppointmentContent({
    bookingId: 42,
    serviceTitle: 'Gestione ansia',
  });

  assert.equal(content.title, 'Nuovo appuntamento fissato dal coach');
  assert.match(content.body, /coach ha fissato un nuovo appuntamento/);
  assert.doesNotMatch(`${content.title} ${content.body}`, /accettat/i);
  assert.equal(content.data.link, '/dashboard/appointments/42');
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
