/**
 * The notification event catalogue — the single source of truth for WHAT the
 * platform notifies about.
 *
 * Deliberately in code, not in the database:
 *   * which events exist, and their stable keys;
 *   * which channels they use and their per-channel defaults;
 *   * whether a user may opt out (mandatory events);
 *   * which template variables the copy is allowed to read.
 *
 * The database (`email_templates`) may only change the words: subject and body.
 * It can never introduce an event, change a recipient, widen a variable
 * whitelist, or make a mandatory email optional.
 *
 * No `server-only` import here: this module is pure data + pure functions, so
 * the preferences UI and the tests can read it from anywhere.
 */

/** User-facing grouping. Drives the sections of the preferences page. */
export const NOTIFICATION_CATEGORIES = [
  'appointments',
  'messages',
  'ai_reports',
  'account',
  'security',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<
  NotificationCategory,
  { title: string; description: string }
> = {
  appointments: {
    title: 'Appuntamenti',
    description:
      'Richieste, conferme, spostamenti, annullamenti e promemoria delle sessioni.',
  },
  messages: {
    title: 'Messaggi',
    description: 'Nuovi messaggi in chat con il tuo coach o con i tuoi atleti.',
  },
  ai_reports: {
    title: 'Report delle sessioni',
    description: 'Quando un report AI di una sessione è pronto da leggere.',
  },
  account: {
    title: 'Account e profilo',
    description: 'Inviti, stato del profilo coach e recensioni ricevute.',
  },
  security: {
    title: 'Sicurezza',
    description:
      'Avvisi su accessi e modifiche sensibili al tuo account. Non disattivabili.',
  },
};

/**
 * Every placeholder a template may use, per event. A template referencing
 * anything outside its event's list is rejected at render time — the email is
 * not sent and the failure is logged, rather than delivering broken copy.
 *
 * These lists hold only values that are ALWAYS resolvable at runtime, because
 * the renderer fails closed. Everything optional — the proposed time, the
 * athlete's sport, their note — lives in the details card, which is built in
 * code and silently omits the rows it has no value for. That is the division:
 * prose may only use guaranteed facts, the card carries the rest.
 *
 * `recipient.*` and `actionUrl` are available everywhere.
 */
const COMMON_VARIABLES = [
  'recipient.firstName',
  'recipient.fullName',
  'actionUrl',
] as const;

/**
 * Guaranteed for every booking event: both participants always exist, and
 * `session.title` falls back to the common noun "sessione" when the booking has
 * no service attached (a generic word is not invented data).
 */
const BOOKING_VARIABLES = [
  /** Noun phrase, e.g. "una sessione Conoscitiva" or plain "una sessione". */
  'session.label',
  'coach.fullName',
  'athlete.fullName',
  /** The other participant, from the recipient's point of view. */
  'counterpart.fullName',
  /** Who performed the action, and their role ("Atleta" / "Coach"). */
  'actor.fullName',
  'actor.role',
] as const;

export type NotificationEventKey =
  | 'booking_requested'
  | 'booking_created_by_coach'
  | 'call_started'
  | 'booking_accepted'
  | 'booking_declined'
  | 'booking_cancelled'
  | 'booking_rescheduled'
  | 'booking_completed'
  | 'booking_reminder_24h'
  | 'booking_reminder_1h'
  | 'new_message'
  | 'ai_report_ready'
  | 'coach_invitation'
  | 'security_alert'
  | 'provider_review_requested'
  | 'provider_approved'
  | 'provider_rejected'
  | 'review_received';

export type NotificationEvent = {
  key: NotificationEventKey;
  category: NotificationCategory;
  /** Label shown to the user in the preferences page. Never the raw key. */
  label: string;
  /** Optional one-liner clarifying when the event fires. */
  hint?: string;
  /** `email_templates.key` of the copy for this event. */
  templateKey: string;
  /**
   * When true the email is transactional and cannot be switched off: the
   * preference row (if any) is ignored and the toggle renders locked.
   */
  mandatoryEmail: boolean;
  /** Why it is mandatory — shown next to the locked toggle. */
  mandatoryReason?: string;
  /** Default when the user has no stored preference row. */
  emailDefault: boolean;
  inAppDefault: boolean;
  /**
   * False for events with no in-app twin (e.g. an invitation to someone who is
   * not a user yet). Those emails carry no `notification_id`.
   */
  hasInApp: boolean;
  /** Placeholders the template may read. */
  variables: readonly string[];
};

function event(e: NotificationEvent): NotificationEvent {
  return e;
}

export const NOTIFICATION_EVENTS: Record<
  NotificationEventKey,
  NotificationEvent
> = {
  // --- Appointments --------------------------------------------------------
  booking_requested: event({
    key: 'booking_requested',
    category: 'appointments',
    label: 'Nuova richiesta di sessione',
    hint: 'Quando un atleta ti invia una richiesta.',
    templateKey: 'booking_requested',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, ...BOOKING_VARIABLES],
  }),
  booking_created_by_coach: event({
    key: 'booking_created_by_coach',
    category: 'appointments',
    label: 'Nuovo appuntamento fissato dal coach',
    templateKey: 'booking_created_by_coach',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, ...BOOKING_VARIABLES],
  }),
  /**
   * Il coach ha aperto la stanza adesso e l'atleta è atteso subito. È un
   * evento a sé, non una variante di `booking_created_by_coach`: quello
   * annuncia un appuntamento da segnare in agenda, questo è un telefono che
   * squilla, e il link porta dentro la stanza invece che alla scheda.
   *
   * Entrambi i canali sono accesi di default. La notifica sul dispositivo è
   * quella che arriva in tempo per rispondere; l'email può arrivare a chiamata
   * già finita, ma resta la traccia scritta per chi in quel momento non era
   * davanti al telefono — e chi non la vuole la spegne dal centro notifiche.
   */
  call_started: event({
    key: 'call_started',
    category: 'appointments',
    label: 'Il coach ti sta chiamando',
    templateKey: 'call_started',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, ...BOOKING_VARIABLES],
  }),
  booking_accepted: event({
    key: 'booking_accepted',
    category: 'appointments',
    label: 'Richiesta accettata',
    templateKey: 'booking_accepted',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, ...BOOKING_VARIABLES],
  }),
  booking_declined: event({
    key: 'booking_declined',
    category: 'appointments',
    label: 'Richiesta rifiutata o scaduta',
    templateKey: 'booking_declined',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, ...BOOKING_VARIABLES],
  }),
  booking_cancelled: event({
    key: 'booking_cancelled',
    category: 'appointments',
    label: 'Sessione annullata',
    templateKey: 'booking_cancelled',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, ...BOOKING_VARIABLES],
  }),
  booking_rescheduled: event({
    key: 'booking_rescheduled',
    category: 'appointments',
    label: 'Orario della sessione modificato',
    templateKey: 'booking_rescheduled',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, ...BOOKING_VARIABLES],
  }),
  booking_completed: event({
    key: 'booking_completed',
    category: 'appointments',
    label: 'Sessione completata',
    templateKey: 'booking_completed',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, ...BOOKING_VARIABLES],
  }),
  booking_reminder_24h: event({
    key: 'booking_reminder_24h',
    category: 'appointments',
    label: 'Promemoria 24 ore prima',
    templateKey: 'booking_reminder_24h',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, ...BOOKING_VARIABLES],
  }),
  booking_reminder_1h: event({
    key: 'booking_reminder_1h',
    category: 'appointments',
    label: 'Promemoria 1 ora prima',
    templateKey: 'booking_reminder_1h',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, ...BOOKING_VARIABLES],
  }),

  // --- Messages ------------------------------------------------------------
  new_message: event({
    key: 'new_message',
    category: 'messages',
    label: 'Nuovo messaggio in chat',
    templateKey: 'new_message',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, 'sender.fullName'],
  }),

  // --- AI reports ----------------------------------------------------------
  ai_report_ready: event({
    key: 'ai_report_ready',
    category: 'ai_reports',
    label: 'Report della sessione pronto',
    hint: 'Quando il coach condivide con te il report di una sessione.',
    templateKey: 'ai_report_ready',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, 'coach.fullName'],
  }),

  // --- Account -------------------------------------------------------------
  coach_invitation: event({
    key: 'coach_invitation',
    category: 'account',
    label: 'Invito a entrare su KaiPai',
    templateKey: 'coach_invitation',
    mandatoryEmail: true,
    mandatoryReason:
      'È l’email che contiene il link di invito: senza non potresti accedere.',
    emailDefault: true,
    inAppDefault: false,
    // The recipient may not have an account yet, so there is no in-app twin.
    hasInApp: false,
    variables: [...COMMON_VARIABLES, 'inviter.name'],
  }),
  provider_review_requested: event({
    key: 'provider_review_requested',
    category: 'account',
    label: 'Nuovo profilo coach da approvare',
    hint: 'Solo per gli amministratori.',
    templateKey: 'provider_review_requested',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, 'coach.fullName'],
  }),
  provider_approved: event({
    key: 'provider_approved',
    category: 'account',
    label: 'Profilo coach approvato',
    templateKey: 'provider_approved',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES],
  }),
  provider_rejected: event({
    key: 'provider_rejected',
    category: 'account',
    label: 'Profilo coach da rivedere',
    templateKey: 'provider_rejected',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES],
  }),
  review_received: event({
    key: 'review_received',
    category: 'account',
    label: 'Nuova recensione ricevuta',
    templateKey: 'review_received',
    mandatoryEmail: false,
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, 'review.rating', 'athlete.fullName'],
  }),

  // --- Security ------------------------------------------------------------
  security_alert: event({
    key: 'security_alert',
    category: 'security',
    label: 'Avvisi di sicurezza',
    hint: 'Accessi da un nuovo dispositivo, cambio password o email.',
    templateKey: 'security_alert',
    mandatoryEmail: true,
    mandatoryReason:
      'Ti avvisa di attività sospette sul tuo account: per la tua sicurezza non può essere disattivata.',
    emailDefault: true,
    inAppDefault: true,
    hasInApp: true,
    variables: [...COMMON_VARIABLES, 'security.event', 'security.occurredAt'],
  }),
};

export const NOTIFICATION_EVENT_KEYS = Object.keys(
  NOTIFICATION_EVENTS
) as NotificationEventKey[];

/** Events a user can actually configure, grouped for the preferences page. */
export function getConfigurableEventsByCategory(): {
  category: NotificationCategory;
  title: string;
  description: string;
  events: NotificationEvent[];
}[] {
  return NOTIFICATION_CATEGORIES.map((category) => ({
    category,
    ...NOTIFICATION_CATEGORY_LABELS[category],
    events: NOTIFICATION_EVENT_KEYS.map((k) => NOTIFICATION_EVENTS[k]).filter(
      (e) => e.category === category
    ),
  })).filter((group) => group.events.length > 0);
}

export function getEvent(key: string): NotificationEvent | null {
  return (NOTIFICATION_EVENTS as Record<string, NotificationEvent>)[key] ?? null;
}

/** True when the user is not allowed to switch the email off. */
export function isMandatoryEmail(key: string): boolean {
  return getEvent(key)?.mandatoryEmail ?? false;
}
