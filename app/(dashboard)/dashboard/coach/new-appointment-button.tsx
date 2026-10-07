'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { SessionBookingForm } from '@/components/session-booking-form';
import type { RelationshipAthlete } from '@/lib/core/bookings';
import type { BookableDay } from '@/lib/core/availability';
import { dropPastStarts } from '@/lib/core/availability/validation';
import { createCoachBookingAction } from './actions';

type ServiceOption = { id: number; title: string; durationMin: number };

/**
 * «Nuovo appuntamento» del coach: crea una sessione già accettata con uno dei
 * suoi atleti. Stessa finestra e stesso modulo di tutto il sito
 * (`SessionBookingForm`), visti dalla parte del coach: la persona a destra è
 * l'**atleta**, non c'è il campo obiettivi, e durata e servizio si scelgono
 * sulla sessione.
 *
 *  - Nessuna scelta del servizio: ogni sessione è una «Sessione online», sul
 *    servizio principale del coach (la conoscitiva ha il suo pulsante).
 *  - La durata è della sessione, non del servizio: lo stesso servizio dura 30
 *    minuti con uno e 60 con un altro, ed è la durata a decidere quali orari
 *    restano liberi.
 *  - Giorni e orari sono calcolati dal server in ora di Roma: un campo libero
 *    `datetime-local` verrebbe letto nel fuso del browser e slitterebbe per un
 *    coach all'estero.
 *  - «Avvia sessione ora» è la stessa creazione con l'inizio impostato dal
 *    server: la sessione parte adesso, l'app dell'atleta squilla appena il
 *    coach entra nella stanza, e giorno e ora scelti non si usano.
 *
 * La protezione dei minori sta sul server: senza l'autorizzazione di un
 * tutore la sessione viene rifiutata.
 */
export function CoachNewAppointmentButton({
  athletes,
  services,
  bookableDays,
  tourAlreadySeen = true,
}: {
  athletes: RelationshipAthlete[];
  services: ServiceOption[];
  /** Giorni e orari dalla disponibilità settimanale del coach; vuoto se non c'è. */
  bookableDays: BookableDay[];
  /** Se il coach ha già visto il tour `coach_create_appointment`. */
  tourAlreadySeen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientUserId, setClientUserId] = useState(() => athletes[0]?.userId ?? 0);
  // Gli orari già passati si tolgono all'apertura, mai al primo render
  // (idratazione): una pagina rimasta aperta proporrebbe un orario rifiutato.
  const [openedAt, setOpenedAt] = useState<Date | null>(null);
  const days = useMemo(
    () => (openedAt ? dropPastStarts(bookableDays, openedAt) : bookableDays),
    [bookableDays, openedAt]
  );

  const athlete = athletes.find((a) => a.userId === clientUserId) ?? athletes[0];

  function openDialog() {
    setOpenedAt(new Date());
    setClientUserId(athletes[0]?.userId ?? 0);
    setOpen(true);
  }

  if (athletes.length === 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          disabled
          className="rounded-full bg-green-600 text-white opacity-50"
        >
          <CalendarPlus className="mr-2 h-4 w-4" />
          Nuovo appuntamento
        </Button>
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          type="button"
          disabled
          className="rounded-full bg-green-600 text-white opacity-50"
        >
          <CalendarPlus className="mr-2 h-4 w-4" />
          Nuovo appuntamento
        </Button>
        <Link
          href="/dashboard/coach/services"
          className="text-xs font-medium text-amber-700 hover:underline"
        >
          Configura un servizio con durata.
        </Link>
      </div>
    );
  }

  const firstName = athlete?.name.split(' ')[0] ?? 'l’atleta';

  return (
    <>
      <Button
        type="button"
        data-tour="coach-new-appointment"
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
            Crea una sessione con uno dei tuoi atleti.
          </DialogDescription>

          <label className="mt-4 flex max-w-sm flex-col gap-1.5">
            <span className="text-sm font-semibold text-gray-900">Atleta</span>
            <select
              value={clientUserId}
              onChange={(e) => setClientUserId(Number(e.target.value))}
              required
              className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900"
            >
              {athletes.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          {athlete && (
            <div className="mt-4">
              {/* Il modulo riparte da zero cambiando atleta: il servizio di
                  default è quello di quella persona, e giorno e orario scelti
                  per uno non valgono per l'altro. */}
              <SessionBookingForm
                key={athlete.userId}
                slug=""
                coachName={athlete.name}
                coachFirstName={firstName}
                coachAvatarUrl={athlete.avatarUrl}
                coachHeadline={null}
                services={services}
                bookableDays={days}
                perspective="coach"
                showNote={false}
                durationSelect
                showTour
                tourKey="coach_create_appointment"
                calendarTourId="coach-booking-datetime"
                tourAlreadySeen={tourAlreadySeen}
                submitLabel="Crea la sessione"
                action={createCoachBookingAction}
                hiddenFields={{ clientUserId: String(athlete.userId) }}
                // Avvia ora ignora giorno e ora scelti: la sessione parte adesso
                // e l'orario lo mette il server, quindi resta utilizzabile anche
                // quando non c'è nessuno slot libero.
                startNow={{
                  enabled: true,
                  hint: 'Crea la sessione con inizio adesso e apre la videochiamata: giorno e ora qui sopra non vengono usati.',
                }}
                onSuccess={(state) => {
                  if (typeof state.bookingId !== 'number') return;
                  setOpen(false);
                  // Sessione avviata ora: si entra direttamente nella stanza, ed
                  // è l'ingresso del coach a far squillare l'app dell'atleta.
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
