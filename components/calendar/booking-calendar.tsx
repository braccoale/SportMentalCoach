'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  X,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { VideoCallButton } from '@/components/video-call-button';
import { cn } from '@/lib/utils';
import { canJoinVideoNow, isSessionJoinable } from '@/lib/core/sessions';
import type { ActionState } from '@/lib/auth/middleware';

/* ────────────────────────────────────────────────────────────────────────────
 * Internal booking calendar (no external calendar services).
 * Data source: the existing `bookings` table only (scheduled_for + status).
 * Views: month / week / agenda. Click → right-side drawer with details and
 * the existing booking actions. KaiPai dark design system.
 * ──────────────────────────────────────────────────────────────────────────── */

export type CalendarEvent = {
  id: number;
  status: string; // requested | accepted | completed | cancelled | declined
  /** ISO datetime; null = not scheduled (shown in the agenda only). */
  scheduledFor: string | null;
  requestedAt: string;
  /** Counterpart display name: athlete (coach view) or coach (athlete view). */
  title: string;
  serviceTitle: string | null;
  /** Durata concordata in minuti: decide quando la sessione diventa passata. */
  durationMin: number | null;
  note: string | null;
};

type BookingAction = (
  state: ActionState,
  formData: FormData
) => Promise<ActionState>;

export type BookingCalendarProps = {
  events: CalendarEvent[];
  role: 'coach' | 'athlete';
  /** Coach-only actions (server actions passed down from the page). */
  completeAction?: BookingAction;
  cancelAction?: BookingAction;
};

type View = 'month' | 'week' | 'agenda';

/* ── date helpers (local time, no timezone logic) ── */

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Monday-first start of week. */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const offset = (day.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(day, -offset);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

function fmtMonth(d: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    month: 'long',
    year: 'numeric',
  }).format(d);
}

function fmtDayLong(d: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d);
}

function fmtTime(d: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function fmtFull(d: Date): string {
  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(d);
}

/* ── status visuals (KaiPai dark) ── */

const STATUS_LABELS: Record<string, string> = {
  requested: 'In attesa',
  accepted: 'Accettata',
  completed: 'Completata',
  cancelled: 'Annullata',
  declined: 'Rifiutata',
  expired: 'Scaduta',
};

/**
 * Semantic status colours (shared by pill, badge and dot):
 *   requested → amber (needs a decision), accepted → blue (scheduled/future),
 *   completed → green (done), expired/declined → red (unhandled/failed),
 *   cancelled → gray (closed, inactive).
 */
function statusDotCls(status: string): string {
  switch (status) {
    case 'accepted':
      return 'bg-blue-500';
    case 'completed':
      return 'bg-emerald-500';
    case 'requested':
      return 'bg-amber-500';
    case 'expired':
    case 'declined':
      return 'bg-red-500';
    default: // cancelled
      return 'bg-zinc-500';
  }
}

/** Event pill classes per status. */
function pillCls(status: string): string {
  switch (status) {
    case 'accepted':
      return 'bg-blue-600 text-white';
    case 'completed':
      return 'bg-emerald-600 text-white';
    case 'requested':
      return 'bg-amber-500 text-white';
    case 'expired':
    case 'declined':
      return 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40 line-through';
    default: // cancelled
      return 'bg-white/5 text-kp-low line-through';
  }
}

function badgeCls(status: string): string {
  switch (status) {
    case 'accepted':
      return 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/40';
    case 'completed':
      return 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/40';
    case 'requested':
      return 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/40';
    case 'expired':
    case 'declined':
      return 'bg-red-500/15 text-red-300 ring-1 ring-red-500/40';
    default: // cancelled
      return 'bg-white/5 text-kp-low ring-1 ring-white/10';
  }
}

/* ── parsed event ── */

type ParsedEvent = CalendarEvent & { when: Date | null };

function useParsedEvents(events: CalendarEvent[]) {
  return useMemo(() => {
    const parsed: ParsedEvent[] = events.map((e) => ({
      ...e,
      when: e.scheduledFor ? new Date(e.scheduledFor) : null,
    }));
    const byDay = new Map<string, ParsedEvent[]>();
    for (const e of parsed) {
      if (!e.when) continue;
      const k = dayKey(e.when);
      const list = byDay.get(k) ?? [];
      list.push(e);
      byDay.set(k, list);
    }
    for (const list of byDay.values()) {
      list.sort((a, b) => a.when!.getTime() - b.when!.getTime());
    }
    const unscheduled = parsed.filter((e) => !e.when);
    return { parsed, byDay, unscheduled };
  }, [events]);
}

/* ── event pill ── */

function EventPill({
  e,
  role,
  onSelect,
  showTime = true,
}: {
  e: ParsedEvent;
  role: 'coach' | 'athlete';
  onSelect: (e: ParsedEvent) => void;
  showTime?: boolean;
}) {
  const counterpart = role === 'coach' ? 'Atleta' : 'Coach';
  return (
    <button
      type="button"
      onClick={() => onSelect(e)}
      className={cn(
        'block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium leading-tight transition-opacity hover:opacity-80 sm:text-xs',
        pillCls(e.status)
      )}
      title={`${counterpart}: ${e.title}${e.serviceTitle ? ` — ${e.serviceTitle}` : ''}`}
    >
      {showTime && e.when && (
        <span className="mr-1 opacity-80">{fmtTime(e.when)}</span>
      )}
      {e.title}
    </button>
  );
}

/* ── month view ── */

function MonthView({
  cursor,
  byDay,
  role,
  onSelect,
}: {
  cursor: Date;
  byDay: Map<string, ParsedEvent[]>;
  role: 'coach' | 'athlete';
  onSelect: (e: ParsedEvent) => void;
}) {
  const today = startOfDay(new Date());
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    weeks.push(
      Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i))
    );
  }
  // Drop a trailing week that is entirely in the next month.
  const visibleWeeks = weeks.filter((week) =>
    week.some((d) => d.getMonth() === cursor.getMonth())
  );

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-kp-line text-center">
        {WEEKDAYS_SHORT.map((w) => (
          <div
            key={w}
            className="py-2 text-[11px] font-semibold uppercase tracking-wide text-kp-low sm:text-xs"
          >
            {w}
          </div>
        ))}
      </div>
      {visibleWeeks.map((week, wi) => (
        <div
          key={wi}
          className="grid grid-cols-7 border-b border-kp-line last:border-b-0"
        >
          {week.map((day) => {
            const inMonth = day.getMonth() === cursor.getMonth();
            const isToday = isSameDay(day, today);
            const dayEvents = byDay.get(dayKey(day)) ?? [];
            const maxVisible = 3;
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'min-h-16 border-r border-kp-line p-1 last:border-r-0 sm:min-h-24 sm:p-1.5',
                  !inMonth && 'bg-white/[0.02]'
                )}
              >
                <span
                  className={cn(
                    'mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs sm:mx-0',
                    isToday
                      ? 'bg-kp-red font-semibold text-white'
                      : inMonth
                        ? 'text-kp-hi'
                        : 'text-kp-low'
                  )}
                >
                  {day.getDate()}
                </span>

                {/* Mobile: dots. Desktop: pills. */}
                {dayEvents.length > 0 && (
                  <>
                    <div className="mt-1 flex flex-wrap justify-center gap-0.5 sm:hidden">
                      {dayEvents.slice(0, 4).map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          aria-label={`${e.title} — ${STATUS_LABELS[e.status] ?? e.status}`}
                          onClick={() => onSelect(e)}
                          className={cn(
                            'h-2 w-2 rounded-full',
                            statusDotCls(e.status)
                          )}
                        />
                      ))}
                    </div>
                    <div className="mt-1 hidden flex-col gap-0.5 sm:flex">
                      {dayEvents.slice(0, maxVisible).map((e) => (
                        <EventPill key={e.id} e={e} role={role} onSelect={onSelect} />
                      ))}
                      {dayEvents.length > maxVisible && (
                        <span className="px-1.5 text-[11px] text-kp-low">
                          +{dayEvents.length - maxVisible} altri
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ── week view ── */

function WeekView({
  cursor,
  byDay,
  role,
  onSelect,
}: {
  cursor: Date;
  byDay: Map<string, ParsedEvent[]>;
  role: 'coach' | 'athlete';
  onSelect: (e: ParsedEvent) => void;
}) {
  const today = startOfDay(new Date());
  const weekStart = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="flex flex-col sm:grid sm:grid-cols-7">
      {days.map((day, i) => {
        const isToday = isSameDay(day, today);
        const dayEvents = byDay.get(dayKey(day)) ?? [];
        return (
          <div
            key={day.toISOString()}
            className={cn(
              'border-b border-kp-line p-2 sm:min-h-48 sm:border-b-0 sm:border-r sm:last:border-r-0',
              dayEvents.length === 0 && 'hidden sm:block'
            )}
          >
            <p
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide',
                isToday ? 'text-kp-red2' : 'text-kp-low'
              )}
            >
              {WEEKDAYS_SHORT[i]}
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-xs',
                  isToday ? 'bg-kp-red text-white' : 'text-kp-hi'
                )}
              >
                {day.getDate()}
              </span>
            </p>
            <div className="mt-2 flex flex-col gap-1">
              {dayEvents.length === 0 ? (
                <p className="hidden text-xs text-kp-low/60 sm:block">—</p>
              ) : (
                dayEvents.map((e) => (
                  <EventPill key={e.id} e={e} role={role} onSelect={onSelect} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── agenda view ── */

function AgendaView({
  cursor,
  byDay,
  unscheduled,
  onSelect,
}: {
  cursor: Date;
  byDay: Map<string, ParsedEvent[]>;
  unscheduled: ParsedEvent[];
  onSelect: (e: ParsedEvent) => void;
}) {
  // All scheduled events of the visible month, in chronological order.
  const monthEvents = useMemo(() => {
    const list: ParsedEvent[] = [];
    for (const evts of byDay.values()) {
      for (const e of evts) {
        if (
          e.when!.getFullYear() === cursor.getFullYear() &&
          e.when!.getMonth() === cursor.getMonth()
        ) {
          list.push(e);
        }
      }
    }
    return list.sort((a, b) => a.when!.getTime() - b.when!.getTime());
  }, [byDay, cursor]);

  // Group by day preserving order.
  const groups: { day: Date; events: ParsedEvent[] }[] = [];
  for (const e of monthEvents) {
    const last = groups[groups.length - 1];
    if (last && isSameDay(last.day, e.when!)) last.events.push(e);
    else groups.push({ day: startOfDay(e.when!), events: [e] });
  }

  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4">
      {groups.length === 0 && unscheduled.length === 0 && (
        <p className="py-8 text-center text-sm text-kp-mid">
          Nessuna sessione in {fmtMonth(cursor)}.
        </p>
      )}

      {groups.map(({ day, events }) => (
        <div key={day.toISOString()}>
          <p className="text-xs font-semibold uppercase tracking-wide text-kp-low">
            {fmtDayLong(day)}
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {events.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e)}
                  className="flex w-full items-center gap-3 rounded-lg border border-kp-line bg-kp-surface px-3 py-2.5 text-left transition-colors hover:border-white/20"
                >
                  <span
                    className={cn(
                      'h-9 w-1 shrink-0 rounded-full',
                      statusDotCls(e.status)
                    )}
                  />
                  <span className="w-12 shrink-0 text-sm font-medium text-kp-hi">
                    {fmtTime(e.when!)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm font-medium',
                        ['cancelled', 'declined', 'expired'].includes(e.status)
                          ? 'text-kp-low line-through'
                          : 'text-kp-hi'
                      )}
                    >
                      {e.title}
                    </span>
                    {e.serviceTitle && (
                      <span className="block truncate text-xs text-kp-mid">
                        {e.serviceTitle}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      badgeCls(e.status)
                    )}
                  >
                    {STATUS_LABELS[e.status] ?? e.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {unscheduled.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-kp-low">
            Senza data pianificata
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {unscheduled.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e)}
                  className="flex w-full items-center gap-3 rounded-lg border border-dashed border-kp-line bg-transparent px-3 py-2.5 text-left transition-colors hover:border-white/20"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-kp-hi">
                      {e.title}
                    </span>
                    {e.serviceTitle && (
                      <span className="block truncate text-xs text-kp-mid">
                        {e.serviceTitle}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      badgeCls(e.status)
                    )}
                  >
                    {STATUS_LABELS[e.status] ?? e.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── event drawer ── */

function EventDrawer({
  event,
  role,
  completeAction,
  cancelAction,
  onClose,
}: {
  event: ParsedEvent;
  role: 'coach' | 'athlete';
  completeAction?: BookingAction;
  cancelAction?: BookingAction;
  onClose: () => void;
}) {
  const counterpartLabel = role === 'coach' ? 'Atleta' : 'Coach';
  const isAccepted = event.status === 'accepted';
  const isPast = !isSessionJoinable(event.when, event.durationMin);
  const canJoin = isAccepted && !isPast;
  const canManage = role === 'coach' && isAccepted;

  // After a successful action, keep the confirmation visible briefly, then
  // close the drawer (the page revalidates underneath).
  function closeAfterSuccess() {
    setTimeout(onClose, 1200);
  }

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />

      {/* Panel: bottom sheet on mobile, right drawer on sm+ */}
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-kp-line bg-kp-ink2 p-5 text-kp-hi shadow-2xl sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:border-y-0 sm:border-r-0 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-kp-low">
              Sessione
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold">
              {event.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi dettagli"
            className="rounded-full p-1.5 text-kp-mid transition-colors hover:bg-white/10 hover:text-kp-hi"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <span
          className={cn(
            'mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
            badgeCls(event.status)
          )}
        >
          {STATUS_LABELS[event.status] ?? event.status}
        </span>

        <dl className="mt-5 flex flex-col gap-4 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-kp-low">
              {counterpartLabel}
            </dt>
            <dd className="mt-0.5 font-medium">{event.title}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-kp-low">
              Servizio
            </dt>
            <dd className="mt-0.5">
              {event.serviceTitle ?? 'Richiesta generica'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-kp-low">
              Data programmata
            </dt>
            <dd className="mt-0.5">
              {event.when ? fmtFull(event.when) : 'Da definire'}
            </dd>
          </div>
          {event.note && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-kp-low">
                Note
              </dt>
              <dd className="mt-0.5 rounded-lg border border-kp-line bg-kp-surface px-3 py-2 text-kp-mid">
                “{event.note}”
              </dd>
            </div>
          )}
        </dl>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-2 border-t border-kp-line pt-5">
          {isAccepted ? (
            canJoin ? (
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={`/dashboard/chat/${event.id}`}
                  className="flex items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  <MessageSquare className="h-4 w-4" />
                  Apri chat
                </Link>
                <VideoCallButton
                  bookingId={event.id}
                  enabled={canJoinVideoNow(event.when, event.durationMin)}
                  scheduledFor={event.when?.toISOString() ?? null}
                  variant="calendar"
                  label="Videochiamata"
                />
              </div>
            ) : (
              <p className="text-xs text-kp-low">
                La sessione è già trascorsa: chat e videochiamata non sono più
                disponibili.
              </p>
            )
          ) : (
            <p className="text-xs text-kp-low">
              Chat e videochiamata sono disponibili per le sessioni accettate.
            </p>
          )}

          {canManage && completeAction && cancelAction && (
            <div
              className={cn(
                'mt-1 grid gap-2',
                isPast ? 'grid-cols-1' : 'grid-cols-2'
              )}
            >
              <ActionForm action={completeAction} onSuccess={closeAfterSuccess}>
                <input type="hidden" name="bookingId" value={event.id} />
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full rounded-full border-emerald-500/50 bg-transparent text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                >
                  Completa
                </Button>
              </ActionForm>
              {/* A past session can no longer be cancelled — only completed. */}
              {!isPast && (
                <ActionForm action={cancelAction} onSuccess={closeAfterSuccess}>
                  <input type="hidden" name="bookingId" value={event.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full rounded-full border-kp-red/50 bg-transparent text-kp-red2 hover:bg-kp-red/10 hover:text-kp-red2"
                  >
                    Annulla
                  </Button>
                </ActionForm>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── main component ── */

export function BookingCalendar({
  events,
  role,
  completeAction,
  cancelAction,
}: BookingCalendarProps) {
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState<Date>(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<ParsedEvent | null>(null);

  const { byDay, unscheduled } = useParsedEvents(events);

  function shift(dir: -1 | 1) {
    setCursor((c) =>
      view === 'week'
        ? addDays(c, dir * 7)
        : new Date(c.getFullYear(), c.getMonth() + dir, 1)
    );
  }

  const weekStart = startOfWeek(cursor);
  const weekEnd = addDays(weekStart, 6);
  const periodLabel =
    view === 'week'
      ? `${weekStart.getDate()}–${weekEnd.getDate()} ${fmtMonth(weekEnd)}`
      : fmtMonth(cursor);

  const views: { key: View; label: string }[] = [
    { key: 'month', label: 'Mese' },
    { key: 'week', label: 'Settimana' },
    { key: 'agenda', label: 'Agenda' },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-kp-line bg-kp-ink2 text-kp-hi">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-kp-line p-3 sm:p-4">
        <CalendarDays className="hidden h-5 w-5 text-kp-red sm:block" />
        <h2 className="min-w-32 font-display text-base font-semibold capitalize sm:text-lg">
          {periodLabel}
        </h2>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Periodo precedente"
            className="rounded-full p-1.5 text-kp-mid transition-colors hover:bg-white/10 hover:text-kp-hi"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor(startOfDay(new Date()))}
            className="rounded-full border border-kp-line px-3 py-1 text-xs font-medium text-kp-mid transition-colors hover:text-kp-hi"
          >
            Oggi
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Periodo successivo"
            className="rounded-full p-1.5 text-kp-mid transition-colors hover:bg-white/10 hover:text-kp-hi"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* View switcher */}
        <div className="ml-auto flex rounded-full border border-kp-line p-0.5">
          {views.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors sm:text-sm',
                view === v.key
                  ? 'bg-kp-red text-white'
                  : 'text-kp-mid hover:text-kp-hi'
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' && (
        <MonthView cursor={cursor} byDay={byDay} role={role} onSelect={setSelected} />
      )}
      {view === 'week' && (
        <WeekView cursor={cursor} byDay={byDay} role={role} onSelect={setSelected} />
      )}
      {view === 'agenda' && (
        <AgendaView
          cursor={cursor}
          byDay={byDay}
          unscheduled={unscheduled}
          onSelect={setSelected}
        />
      )}

      {/* Legend — below the calendar, explains the event colors. Each event
          shows the counterpart's name (the athlete for a coach, and vice versa). */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-kp-line px-3 py-3 text-xs text-kp-mid sm:px-4">
        <span className="font-semibold uppercase tracking-wide text-kp-low">
          Legenda
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> In attesa
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Accettata
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Completata
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Scaduta
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" /> Annullata
        </span>
        <span className="ml-auto hidden text-kp-low sm:inline">
          {role === 'coach'
            ? 'Ogni evento mostra l’atleta che ha prenotato.'
            : 'Ogni evento mostra il coach della sessione.'}
        </span>
      </div>

      {selected && (
        <EventDrawer
          event={selected}
          role={role}
          completeAction={completeAction}
          cancelAction={cancelAction}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
