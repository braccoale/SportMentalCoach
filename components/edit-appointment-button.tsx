'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import type { BookableDay } from '@/lib/core/availability';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { SessionBookingForm } from '@/components/session-booking-form';
import { rescheduleBookingAction } from '@/app/(dashboard)/dashboard/appointments/actions';

/**
 * «Modifica» di un appuntamento: la stessa finestra e lo stesso modulo di
 * tutte le prenotazioni (`SessionBookingForm`), aperti sulla sessione com'è.
 * Si cambiano giorno, ora e durata; il servizio non c'entra, la sessione ce
 * l'ha già.
 *
 * I giorni arrivano dal server **senza** il posto che la sessione occupa
 * (`excludeBookingId`): spostarla libera il suo orario, quindi si può anche
 * solo accorciarla o allungarla senza uscire dalle opzioni. La regola vera è
 * di `rescheduleBooking`, che ricontrolla disponibilità, durata e collisioni.
 */
export function EditAppointmentButton({
  bookingId,
  bookableDays,
  currentDay,
  currentTime,
  durationMin,
  compact = false,
  counterpartName = 'Appuntamento',
  counterpartAvatarUrl = null,
  perspective = 'athlete',
}: {
  bookingId: number;
  bookableDays: BookableDay[];
  currentDay: string;
  currentTime: string;
  durationMin: number;
  compact?: boolean;
  /** L'altra persona della sessione: il coach per l'atleta, l'atleta per il coach. */
  counterpartName?: string;
  counterpartAvatarUrl?: string | null;
  /** Chi guarda: decide i testi («ti confermerà» non vale per il coach). */
  perspective?: 'athlete' | 'coach';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const firstName = counterpartName.split(' ')[0] || counterpartName;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={compact ? 'sm' : 'default'}
        className="rounded-full"
        onClick={() => setOpen(true)}
        disabled={bookableDays.length === 0}
        title={
          bookableDays.length === 0
            ? 'Il coach non ha configurato disponibilità modificabili.'
            : 'Modifica data e orario'
        }
      >
        <Pencil className="h-4 w-4" />
        Modifica
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto rounded-3xl p-6 sm:p-8">
          <DialogTitle className="pr-8 text-xl sm:text-3xl">
            Modifica appuntamento
          </DialogTitle>
          <DialogDescription>
            Cambia il giorno, l’orario o la durata della sessione.
          </DialogDescription>
          {/* Il modulo si monta all'apertura: ogni volta riparte dalla
              sessione com'è, non dall'ultima scelta abbandonata. */}
          {open && (
            <div className="mt-4">
              <SessionBookingForm
                slug=""
                coachName={counterpartName}
                coachFirstName={firstName}
                coachAvatarUrl={counterpartAvatarUrl}
                coachHeadline={null}
                services={[]}
                serviceless
                bookableDays={bookableDays}
                perspective={perspective}
                showNote={false}
                durationSelect
                initial={{ day: currentDay, time: currentTime, durationMin }}
                summaryTitle={`Appuntamento con ${firstName}`}
                submitLabel="Salva la modifica"
                hint={`${firstName} riceve una notifica con il nuovo orario.`}
                action={rescheduleBookingAction}
                hiddenFields={{ bookingId: String(bookingId) }}
                onSuccess={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
