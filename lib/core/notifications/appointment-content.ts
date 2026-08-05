export type AppointmentNotificationActor = 'coach' | 'athlete';

export function coachCreatedAppointmentContent(ctx: {
  bookingId?: number;
  serviceTitle?: string | null;
}) {
  return {
    title: 'Nuovo appuntamento fissato dal coach',
    body: ctx.serviceTitle
      ? `Il coach ha fissato un nuovo appuntamento per “${ctx.serviceTitle}”.`
      : 'Il coach ha fissato un nuovo appuntamento.',
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
    body: 'La videochiamata è iniziata: tocca per entrare.',
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
    body: `${actorLabel} ha modificato la data o l’orario della sessione.`,
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
