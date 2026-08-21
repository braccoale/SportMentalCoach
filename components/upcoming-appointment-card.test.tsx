import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpcomingAppointmentCard } from './upcoming-appointment-card';

test('appointment card exposes the requested date, sport and top action menu', () => {
  const html = renderToStaticMarkup(
    <UpcomingAppointmentCard
      data={{
        id: 25,
        athleteName: 'Giulia Martini',
        athleteAvatarUrl: null,
        sportKey: 'football',
        eyebrow: 'Atleta già in percorso',
        statusLabel: 'Accettata',
        date: {
          day: '25',
          monthYear: 'AGO 2026',
          weekday: 'Martedì',
          time: '19:00',
        },
        primaryNeed: 'Preparazione mentale',
        requestedAtLabel: '16 ago 2026',
      }}
      overflowActions={<span>Aggiungi al calendario</span>}
      detailContent={<p>Dettagli sessione</p>}
    />
  );

  assert.match(html, /aria-label="Azioni appuntamento"/);
  assert.match(html, /aria-label="Sport: Calcio"/);
  assert.match(html, /role="tooltip"[^>]*>Calcio/);
  assert.match(html, /Giulia Martini/);
  assert.ok(html.indexOf('AGO 2026') < html.indexOf('Martedì'));
  assert.ok(html.indexOf('Martedì') < html.indexOf('19:00'));
  assert.equal((html.match(/Azioni appuntamento/g) ?? []).length, 1);
});
