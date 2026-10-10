'use client';

import Link from 'next/link';
import { useCallback, useState, useTransition, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { listUsersForWidgetAction } from '@/app/(dashboard)/dashboard/admin/utilizzo/actions';
import type { WidgetList } from '@/lib/core/usage/queries-users';
import { shortDay } from '@/lib/core/usage/series';
import { ActivityChart, CountBars, DailyBars } from './usage-charts';

/**
 * I popup della pagina «Utilizzo»: un numero o una barra, cliccati, aprono
 * l'elenco di chi c'è dietro. L'elenco si legge solo al clic (e solo per
 * l'amministratore): la pagina non porta con sé i nomi di nessuno finché non li
 * chiedi.
 */

type State =
  | { phase: 'closed' }
  | { phase: 'loading'; title: string }
  | { phase: 'ready'; title: string; list: WidgetList }
  | { phase: 'error'; title: string; message: string };

const roleLabel = (roles: string) =>
  roles
    .split(', ')
    .filter(Boolean)
    .map((r) => (r === 'coach' ? 'Coach' : r === 'athlete' ? 'Atleta' : r === 'club' ? 'Club' : r))
    .join(', ');

export function useUsersDialog(days: number) {
  const [state, setState] = useState<State>({ phase: 'closed' });
  const [, startTransition] = useTransition();

  const open = useCallback(
    (spec: string, title: string) => {
      setState({ phase: 'loading', title });
      startTransition(async () => {
        try {
          const result = await listUsersForWidgetAction(spec, days);
          setState(
            result.ok
              ? { phase: 'ready', title, list: result.list }
              : { phase: 'error', title, message: result.error }
          );
        } catch {
          setState({ phase: 'error', title, message: 'Non riesco a leggere l’elenco. Riprova.' });
        }
      });
    },
    [days]
  );

  const node = (
    <Dialog open={state.phase !== 'closed'} onOpenChange={(o) => !o && setState({ phase: 'closed' })}>
      <DialogContent className="max-h-[85vh] max-w-xl">
        <DialogTitle className="pr-10 text-lg font-semibold text-gray-950">
          {state.phase === 'closed' ? '' : state.title}
        </DialogTitle>
        <DialogDescription className="text-sm text-gray-500">
          {state.phase === 'ready'
            ? `${state.list.rows.length} ${state.list.rows.length === 1 ? 'riga' : 'righe'}`
            : 'Le persone dietro il numero.'}
        </DialogDescription>
        <div className="mt-4">
          {state.phase === 'loading' && (
            <ul className="space-y-2" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <li key={i} className="h-10 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </ul>
          )}
          {state.phase === 'error' && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>}
          {state.phase === 'ready' && (
            <>
              {state.list.note && <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{state.list.note}</p>}
              {state.list.rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">Nessuno: non c’è nessuna persona dietro questo numero.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {state.list.rows.map((row, i) => (
                    <li key={`${row.id ?? 'anon'}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-gray-900">
                          {row.name}
                          {row.roles ? (
                            <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-600">
                              {roleLabel(row.roles)}
                            </span>
                          ) : null}
                        </span>
                        <span className="block truncate text-xs text-gray-500">{row.detail}</span>
                      </span>
                      {row.id != null && (
                        <Link
                          href={`/dashboard/admin/utilizzo?vista=attivita&giorni=${days}&utente=${row.id}`}
                          className="shrink-0 text-xs font-medium text-green-700 hover:underline"
                        >
                          Attività
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );

  return { open, node };
}

/** Avvolge un riquadro del server: cliccato, apre l'elenco. Si naviga anche da tastiera. */
export function UsersTrigger({
  spec,
  title,
  days,
  className = '',
  children,
}: {
  spec: string;
  title: string;
  days: number;
  className?: string;
  children: ReactNode;
}) {
  const { open, node } = useUsersDialog(days);
  return (
    <>
      <button
        type="button"
        onClick={() => open(spec, title)}
        title="Clicca per vedere chi c’è dietro"
        className={`block w-full cursor-pointer text-left transition-shadow hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 ${className}`}
      >
        {children}
      </button>
      {node}
    </>
  );
}

export function ClickableActivityChart({
  data,
  days,
}: {
  data: { day: string; events: number; users: number }[];
  days: number;
}) {
  const { open, node } = useUsersDialog(days);
  return (
    <>
      <ActivityChart data={data} onDayClick={(day) => open(`active_day:${day}`, `Persone attive il ${shortDay(day)}`)} />
      <p className="mt-1 text-xs text-gray-400">Clicca una barra per vedere chi era attivo quel giorno.</p>
      {node}
    </>
  );
}

export function ClickableSignupsChart({ data, days }: { data: { day: string; value: number }[]; days: number }) {
  const { open, node } = useUsersDialog(days);
  return (
    <>
      <DailyBars data={data} label="Iscritti" onDayClick={(day) => open(`signup_day:${day}`, `Iscritti il ${shortDay(day)}`)} />
      <p className="mt-1 text-xs text-gray-400">Clicca una barra per vedere chi si è iscritto quel giorno.</p>
      {node}
    </>
  );
}

export function ClickableCountBars({
  data,
  days,
}: {
  data: { label: string; n: number; event: string }[];
  days: number;
}) {
  const { open, node } = useUsersDialog(days);
  return (
    <>
      <CountBars data={data} onBarClick={(item) => open(`event:${item.event}`, `Prenotazioni: ${item.label.toLowerCase()}`)} />
      <p className="mt-1 text-xs text-gray-400">Clicca una barra per vedere chi c’è dietro.</p>
      {node}
    </>
  );
}
