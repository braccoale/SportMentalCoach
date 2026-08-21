export type AppointmentNotificationActor = 'coach' | 'athlete';

export function coachCreatedAppointmentContent(ctx: {
  bookingId?: number;
  serviceTitle?: string | null;
}) {
  return {
    title: 'Nuovo appuntamento fissato dal coach',
    body: ctx.serviceTitle
      ? `Il coach ha fissato una sessione per “${ctx.serviceTitle}”. Apri l’appuntamento per controllare giorno e orario.`
      : 'Il coach ha fissato una sessione con te. Apri l’appuntamento per controllare giorno e orario.',
    data: {
      link: ctx.bookingId
        ? `/dashboard/appointments/${ctx.bookingId}`
        : '/dashboard/athlete',
      bookingId: ctx.bookingId,
    },
  };
}

/**
 * Il coach ha avviato la videochiamata adesso.
 *
 * Il link punta direttamente alla stanza, non alla scheda dell'appuntamento:
 * chi tocca questa notifica sta rispondendo a una chiamata, e ogni schermata
 * intermedia è un ostacolo mentre l'altra persona aspetta. Se non ha la
 * sessione aperta, il middleware lo manda al login conservando questo percorso
 * e ce lo riporta subito dopo.
 */
export function callStartedContent(ctx: {
  bookingId?: number;
  /** Chi riceve la notifica; chi chiama è per costruzione l'altro. */
  audience?: 'athlete' | 'coach';
  coachName?: string | null;
  athleteName?: string | null;
}) {
  const toCoach = ctx.audience === 'coach';
  const callerName = toCoach ? ctx.athleteName : ctx.coachName;
  const callerLabel = toCoach ? 'Un tuo atleta' : 'Il coach';

  return {
    title: callerName
      ? `${callerName} ti sta chiamando`
      : `${callerLabel} ti sta chiamando`,
    body: 'La videochiamata è iniziata. Tocca qui per entrare adesso.',
    data: {
      link: ctx.bookingId
        ? `/dashboard/video/${ctx.bookingId}`
        : toCoach
          ? '/dashboard/coach'
          : '/dashboard/athlete',
      bookingId: ctx.bookingId,
    },
  };
}

export function rescheduledAppointmentContent(ctx: {
  bookingId?: number;
  actor: AppointmentNotificationActor;
  audience?: 'athlete' | 'coach';
}) {
  const actorLabel = ctx.actor === 'coach' ? 'Il coach' : 'L’atleta';
  return {
    title: `${actorLabel} ha modificato l’appuntamento`,
    body: `${actorLabel} ha cambiato giorno o orario della sessione. Tocca qui per vedere l’orario corretto.`,
    data: {
      link: ctx.bookingId
        ? `/dashboard/appointments/${ctx.bookingId}`
        : ctx.audience === 'coach'
          ? '/dashboard/coach'
          : '/dashboard/athlete',
      bookingId: ctx.bookingId,
    },
  };
}

export function reminder24hContent(ctx: {
  bookingId?: number;
  sessionTime?: string;
}) {
  return {
    title: 'La tua sessione è domani',
    body: ctx.sessionTime
      ? `Domani alle ${ctx.sessionTime} hai una sessione. Tocca qui per controllare i dettagli.`
      : 'Domani hai una sessione. Tocca qui per controllare giorno e orario.',
    data: {
      link: ctx.bookingId
        ? `/dashboard/appointments/${ctx.bookingId}`
        : '/dashboard',
      bookingId: ctx.bookingId,
    },
  };
}

export function athleteReportReadyContent(ctx: { bookingId?: number }) {
  return {
    title: 'Il report della sessione è disponibile',
    body: 'Il coach ha condiviso il report con te. Tocca qui per aprire direttamente il report privato.',
    data: {
      link: ctx.bookingId
        ? `/dashboard/appointments/${ctx.bookingId}#session-compass`
        : '/dashboard/athlete',
      bookingId: ctx.bookingId,
    },
  };
}

export function securityAlertContent(ctx: { securityEvent?: string }) {
  return {
    title: 'Avviso di sicurezza',
    body: ctx.securityEvent
      ? `Attività rilevata: ${ctx.securityEvent}. Se non sei stato tu, cambia subito la password.`
      : 'Abbiamo rilevato un’attività sul tuo account. Se non sei stato tu, cambia subito la password.',
    data: { link: '/dashboard/settings?section=password' },
  };
}
