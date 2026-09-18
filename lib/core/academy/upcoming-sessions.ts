/**
 * Vero se questa sessione è ancora da tenersi: programmata (non annullata,
 * non già completata) e nel futuro. Unica definizione di "prossima
 * sessione Academy" — la usano sia la lista sessioni della dashboard sia il
 * conteggio del badge, così i due non possono mai raccontare due storie
 * diverse sullo stesso dato.
 */
export function isUpcomingScheduledSession(
  session: { status: string; scheduledFor: Date },
  now: Date = new Date()
): boolean {
  return session.status === 'scheduled' && session.scheduledFor.getTime() > now.getTime();
}

/**
 * Quanti corsi distinti, tra quelli visibili a un coach (docente o
 * partecipante), hanno almeno una sessione futura ancora programmata —
 * il numero per il badge "Academy" della navigazione. Un corso con più
 * sessioni future conta una volta sola: è "hai qualcosa da seguire in
 * questo corso", non "quante sessioni hai".
 */
export function countCoursesWithUpcomingSessions(
  sessions: readonly { courseId: number; status: string; scheduledFor: Date }[],
  now: Date = new Date()
): number {
  const courseIds = new Set<number>();
  for (const session of sessions) {
    if (!isUpcomingScheduledSession(session, now)) continue;
    courseIds.add(session.courseId);
  }
  return courseIds.size;
}
