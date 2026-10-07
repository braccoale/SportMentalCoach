'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CalendarPlus, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { SessionBookingForm } from '@/components/session-booking-form';
import type { RelationshipCoach } from '@/lib/core/bookings';
import { dropPastStarts } from '@/lib/core/availability/validation';
import { createBookingRequestAction } from './actions';

/**
 * «Nuovo appuntamento»: la richiesta rapida a un coach con cui l'atleta ha già
 * lavorato. Stessa finestra e stesso modulo del resto del sito
 * (`SessionBookingForm`): prima c'erano due modi diversi di prenotare, a
 * seconda da dove si partiva. Qui si aggiunge solo la scelta del coach e,
 * accanto all'invio, «Avvia sessione ora».
 *
 * Con nessun coach conosciuto resta il collegamento «Trova un coach».
 */
export function NewAppointmentButton({ coaches }: { coaches: RelationshipCoach[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Si parte dall'ultimo coach seguito (la lista è già ordinata per recente).
  const [slug, setSlug] = useState(coaches[0]?.slug ?? '');
  // Gli orari di oggi si filtrano sull'orologio al momento dell'apertura, mai
  // al primo render (idratazione): se la pagina è rimasta aperta, quelli
  // passati vanno tolti davvero, altrimenti si propone un orario rifiutato.
  const [openedAt, setOpenedAt] = useState<Date | null>(null);

  const selected = useMemo(
    () => coaches.find((c) => c.slug === slug),
    [coaches, slug]
  );
  const days = useMemo(() => {
    const all = selected?.bookableDays ?? [];
    return openedAt ? dropPastStarts(all, openedAt) : all;
  }, [selected, openedAt]);

  if (coaches.length === 0) {
    return (
      <Button
        asChild
        className="rounded-full bg-green-600 text-white hover:bg-green-700"
      >
        <Link href="/coaches">
          <UserRound className="mr-2 h-4 w-4" />
          Trova un coach
        </Link>
      </Button>
    );
  }

  function openDialog() {
    setOpenedAt(new Date());
    setSlug(coaches[0]?.slug ?? '');
    setOpen(true);
  }

  const credits = selected?.credits ?? null;
  const remaining = !credits
    ? null
    : credits.total === 0
      ? credits.extraSessions
      : credits.remainingNow === null
        ? null
        : credits.remainingNow + credits.extraSessions;
  const total = credits ? credits.total + credits.extraSessions : null;
  const firstName = selected?.name.split(' ')[0] ?? 'il coach';

  // Nessuna data ammessa: il motivo (sedute finite, abbonamento, orari passati)
  // si dice al posto di un calendario vuoto, che direbbe «il coach non è libero».
  const blockedNotice =
    selected && days.length === 0
      ? (selected.creditsNotice ??
        (selected.bookableDays.length > 0
          ? 'Gli orari proposti sono nel frattempo passati. Ricarica la pagina per vedere quelli ancora disponibili.'
          : null))
      : null;

  return (
    <>
      <Button
        type="button"
        onClick={openDialog}
        className="rounded-full bg-green-600 text-white hover:bg-green-700"
      >
        <CalendarPlus className="mr-2 h-4 w-4" />
        Nuovo appuntamento
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto rounded-3xl p-6 sm:p-8">
          <DialogTitle className="pr-8 text-xl sm:text-3xl">
            Nuovo appuntamento
          </DialogTitle>
          <DialogDescription>
            Richiedi una sessione a un coach con cui hai già lavorato.
          </DialogDescription>

          {coaches.length > 1 && (
            <label className="mt-4 flex max-w-sm flex-col gap-1.5">
              <span className="text-sm font-semibold text-gray-900">Coach</span>
              <select
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900"
              >
                {coaches.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.isFavorite ? `♥ ${c.name}` : c.name}
                    {c.credits && c.credits.remainingNow !== null
                      ? ` · ${c.credits.remainingNow} ${
                          c.credits.remainingNow === 1 ? 'rimasta' : 'rimaste'
                        } su ${c.credits.total}`
                      : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selected && blockedNotice && (
            <p
              role="status"
              className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              {blockedNotice}
            </p>
          )}

          {selected && !blockedNotice && (
            <div className="mt-4">
              {days.length > 0 && selected.creditsNotice && (
                <p className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-gray-700">
                  {selected.creditsNotice}
                </p>
              )}
              {/* Il modulo riparte da zero cambiando coach: giorno, orario e
                  servizio di uno non valgono per l'altro. */}
              <SessionBookingForm
                key={selected.slug}
                slug={selected.slug}
                coachName={selected.name}
                coachFirstName={firstName}
                coachAvatarUrl={selected.avatarUrl}
                coachHeadline={null}
                services={selected.services}
                bookableDays={days}
                remaining={remaining}
                total={total}
                submitLabel={`Invia la richiesta a ${firstName}`}
                action={createBookingRequestAction}
                hiddenFields={{ coachSlug: selected.slug }}
                startNow={{
                  enabled: selected.canCallNow,
                  hint:
                    !selected.canCallNow && selected.credits && selected.creditsNotice
                      ? selected.creditsNotice
                      : !selected.canCallNow
                        ? `${selected.name} non è disponibile in questo momento${
                            selected.availabilityHint
                              ? `: ${selected.availabilityHint}`
                              : ''
                          }.`
                        : 'Chiama subito il coach e apre la videochiamata: giorno e ora qui sopra non vengono usati.',
                }}
                onSuccess={(state) => {
                  if (typeof state.bookingId !== 'number') return;
                  setOpen(false);
                  // Chiamata avviata: si entra direttamente nella stanza, ed è
                  // l'ingresso dell'atleta a far squillare l'app del coach.
                  router.push(
                    state.startedNow
                      ? `/dashboard/video/${state.bookingId}`
                      : `/dashboard/appointments/${state.bookingId}?created=1`
                  );
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
