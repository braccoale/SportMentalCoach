/**
 * Italian UI strings for the SportMentalCoach vertical (Phase 1 locale).
 *
 * Keys are vertical-agnostic in spirit (core reads them by key), but the
 * values are SMC-specific. Grouped by area via a `dot.notation` key prefix.
 * This is basic copy only — no onboarding/marketing flows yet.
 */
export const copyIt: Record<string, string> = {
  // Brand
  'brand.name': 'SportMentalCoach',
  'brand.tagline': 'Coaching mentale per atleti e squadre',

  // Roles (sentence-friendly variants of the role labels)
  'role.client.singular': 'Atleta',
  'role.client.plural': 'Atleti',
  'role.provider.singular': 'Coach',
  'role.provider.plural': 'Coach',
  'role.organization.singular': 'Club',
  'role.organization.plural': 'Club',

  // Listing / marketplace surface
  'listing.title': 'Trova il tuo mental coach',
  'listing.subtitle':
    'Sfoglia i coach approvati e invia una richiesta di prenotazione.',
  'listing.filter.sport': 'Sport',
  'listing.filter.specialty': 'Specializzazione',
  'listing.empty': 'Nessun coach trovato con questi filtri.',

  // Provider (coach) profile
  'provider.headline.placeholder': 'Una frase che descrive il tuo approccio',
  'provider.specialties.label': 'Specializzazioni',
  'provider.sports.label': 'Sport seguiti',
  'provider.rate.label': 'Tariffa oraria',
  'provider.status.draft': 'Bozza',
  'provider.status.pending': 'In revisione',
  'provider.status.approved': 'Approvato',
  'provider.status.rejected': 'Rifiutato',

  // Client (athlete) profile
  'client.sport.label': 'Il tuo sport',
  'client.level.label': 'Livello',
  'client.goals.label': 'Obiettivi',

  // Services
  'service.title.label': 'Titolo del servizio',
  'service.duration.label': 'Durata (minuti)',
  'service.price.label': 'Prezzo',

  // Bookings
  'booking.cta': 'Richiedi una sessione',
  'booking.note.label': 'Messaggio per il coach',
  'booking.status.requested': 'Richiesta inviata',
  'booking.status.accepted': 'Accettata',
  'booking.status.declined': 'Rifiutata',
  'booking.status.cancelled': 'Annullata',
  'booking.status.completed': 'Completata',
};
