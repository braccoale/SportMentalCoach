import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MentalJourneyLinks } from './mental-journey-links';
import type { RelationshipAthlete } from '@/lib/core/bookings';

const athletes: RelationshipAthlete[] = [
  { userId: 7, name: 'Alessandro Bracco', avatarUrl: null },
  { userId: 9, name: 'Monia Barresi', avatarUrl: null },
];

test('senza la funzionalità AI la sezione non esiste proprio', () => {
  // Non nascosta con una classe, non svuotata: assente. I dati del percorso
  // sono già protetti dall'entitlement, ma un coach che non ha la funzione non
  // deve nemmeno vederne la porta.
  const html = renderToStaticMarkup(
    <MentalJourneyLinks athletes={athletes} enabled={false} />
  );
  assert.equal(html, '');
});

test('con la funzionalità attiva elenca gli atleti seguiti', () => {
  const html = renderToStaticMarkup(
    <MentalJourneyLinks athletes={athletes} enabled />
  );
  assert.match(html, /Mental Journey/);
  assert.match(html, /Alessandro Bracco/);
  assert.match(html, /Monia Barresi/);
  assert.match(html, /\/dashboard\/coach\/athletes\/7\/mental-journey/);
});

test('senza atleti non resta un titolo appeso nel vuoto', () => {
  const html = renderToStaticMarkup(
    <MentalJourneyLinks athletes={[]} enabled />
  );
  assert.equal(html, '');
});
