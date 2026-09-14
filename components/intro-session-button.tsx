'use client';

import { Dialog } from 'radix-ui';
import Link from 'next/link';
import { CalendarCheck, CheckCircle2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BookingRequest } from '@/app/(marketplace)/coaches/[slug]/booking-request';
import type { BookableDay } from '@/lib/core/availability';
import { DEMO_READONLY_MESSAGE } from '@/lib/auth/demo-readonly';

export function IntroSessionButton({ slug, coachFirstName, loggedIn, isAthlete, bookableDays, alreadyUsed, isDemo = false }: {
  slug: string; coachFirstName: string; loggedIn: boolean; isAthlete: boolean; bookableDays: BookableDay[];
  /**
   * Un atleta ha una sola sessione conoscitiva gratuita per coach — altrimenti
   * la si potrebbe rifare ogni giorno. Quando è già stata usata (o è ancora
   * aperta una richiesta) il bottone resta visibile ma disabilitato, con il
   * motivo nel tooltip: proporla e poi rifiutarla al momento dell'invio
   * sembrerebbe un difetto, non una regola.
   */
  alreadyUsed: boolean;
  /** Account demo: il server rifiuta comunque la scrittura, ma il bottone
   * disabilitato lo dice subito invece di far scoprire il blocco al submit. */
  isDemo?: boolean;
}) {
  if (isDemo) {
    return (
      <span
        className="inline-block w-full sm:w-auto"
        title={DEMO_READONLY_MESSAGE}
      >
        <Button
          type="button"
          variant="outline"
          disabled
          className="w-full rounded-full sm:w-auto"
        >
          <CalendarCheck />Sessione conoscitiva (gratis)
        </Button>
      </span>
    );
  }
  if (alreadyUsed) {
    // Il title sull'elemento in sé non basta: alcuni browser sopprimono
    // hover/tooltip su un <button disabled>. Lo <span> attorno non è
    // disabilitato, quindi il tooltip risponde ovunque.
    return (
      <span
        className="inline-block w-full sm:w-auto"
        title={`Hai già usato la tua sessione conoscitiva gratuita con ${coachFirstName}.`}
      >
        <Button
          type="button"
          variant="outline"
          disabled
          className="w-full rounded-full sm:w-auto"
        >
          <CheckCircle2 />Sessione conoscitiva già usata
        </Button>
      </span>
    );
  }
  return <Dialog.Root>
    {/*
      * Outline, non piena: accanto a "Prenota un incontro" (l'azione vera,
      * verde piena) due bottoni ugualmente pieni si equivalgono e competono
      * per l'attenzione invece di guidarla. Niente bottoni rossi sulla
      * piattaforma, per scelta esplicita — bordo e scritta verdi invece.
      */}
    <Dialog.Trigger asChild><Button type="button" variant="outline" className="w-full rounded-full border-green-600 text-green-600 hover:bg-green-50 hover:text-green-700 sm:w-auto"><CalendarCheck />Sessione conoscitiva (gratis)</Button></Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
      <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl bg-white p-6 shadow-xl focus:outline-none">
        <Dialog.Title className="pr-8 text-xl font-semibold">Sessione conoscitiva con {coachFirstName}</Dialog.Title>
        <Dialog.Description className="mb-5 mt-2 text-sm text-gray-600">20 minuti gratuiti per conoscervi e parlare dei tuoi obiettivi.</Dialog.Description>
        <Dialog.Close asChild><Button type="button" variant="ghost" size="icon" className="absolute right-3 top-3 rounded-full" aria-label="Chiudi"><X /></Button></Dialog.Close>
        {!loggedIn ? <Button asChild className="w-full rounded-full"><Link href={`/sign-in?redirect=${encodeURIComponent(`/coaches/${slug}?intro=1`)}`}>Accedi per prenotare</Link></Button> : isAthlete ? <BookingRequest slug={slug} coachFirstName={coachFirstName} services={[]} bookableDays={bookableDays} introductory /> : <p className="text-sm text-gray-600">Accedi con un account atleta per richiedere la sessione.</p>}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
