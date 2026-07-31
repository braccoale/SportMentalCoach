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
