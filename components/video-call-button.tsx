'use client';

import Link from 'next/link';
import { Video } from 'lucide-react';
import { Tooltip } from 'radix-ui';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  canJoinVideoNow,
  nextVideoJoinAvailabilityChange,
} from '@/lib/core/sessions';

const MAX_TIMEOUT_MS = 2_147_483_647;

export function VideoCallButton({
  bookingId,
  enabled,
  scheduledFor,
  prominent = false,
  variant = 'default',
  durationMin,
  label = 'Apri videochiamata',
}: {
  bookingId: number;
  enabled: boolean;
  scheduledFor?: string | null;
  /** Durata concordata: la finestra per entrare si chiude quando finisce. */
  durationMin?: number | null;
  prominent?: boolean;
  variant?: 'default' | 'compact' | 'calendar';
  label?: string;
}) {
  const [isEnabled, setIsEnabled] = useState(enabled);

  useEffect(() => {
    if (!scheduledFor) {
      setIsEnabled(enabled);
      return;
    }

    const appointment = new Date(scheduledFor);
    if (Number.isNaN(appointment.getTime())) {
      setIsEnabled(enabled);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const synchronize = () => {
      if (timer) clearTimeout(timer);
      const now = new Date();
      setIsEnabled(canJoinVideoNow(appointment, durationMin, now));

      const nextChange = nextVideoJoinAvailabilityChange(
        appointment,
        durationMin,
        now
      );
      if (nextChange) {
        const delay = Math.max(
          0,
          Math.min(
            MAX_TIMEOUT_MS,
            nextChange.getTime() - now.getTime() + 25
          )
        );
        timer = setTimeout(synchronize, delay);
      }
    };
    const synchronizeWhenVisible = () => {
      if (document.visibilityState === 'visible') synchronize();
    };

    synchronize();
    window.addEventListener('focus', synchronize);
    document.addEventListener(
      'visibilitychange',
      synchronizeWhenVisible
    );
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', synchronize);
      document.removeEventListener(
        'visibilitychange',
        synchronizeWhenVisible
      );
    };
  }, [durationMin, enabled, scheduledFor]);

  const tooltip =
    'La videochiamata sarà disponibile 5 minuti prima dell’orario previsto.';
  /*
   * L'altezza della variante da scheda combacia con `Button size="default"`.
   *
   * Prima era `px-5 py-2.5` e basta: un'altezza calcolata dal padding, che non
   * coincideva con nessuno dei pulsanti accanto. In una riga dove `Modifica` e
   * `Aggiungi al calendario` stanno a `h-8` e gli altri a `h-9`, questo si
   * piazzava a meta' strada e faceva sembrare sbagliati anche quelli giusti.
   *
   * Non e' un dettaglio da pignoli: quando le altezze non tornano, l'occhio
   * legge la riga come un elenco di cose scollegate invece che come un gruppo
   * di azioni fra cui scegliere.
   */
  const controlClass = cn(
    'inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors',
    prominent
      ? 'h-12 w-full px-6 text-base'
      : variant === 'compact'
        ? 'h-9 w-full px-3'
        : variant === 'calendar'
          ? 'w-full px-4 py-2.5 font-medium'
          : 'h-9 px-4',
    isEnabled
      ? 'bg-green-600 text-white hover:bg-green-700'
      : variant === 'calendar'
        ? 'cursor-not-allowed bg-kp-line text-kp-low'
        : 'cursor-not-allowed bg-gray-100 text-gray-400'
  );

  const wrapperClass = cn(
    'inline-flex',
    (prominent || variant === 'compact' || variant === 'calendar') && 'w-full'
  );

  if (isEnabled) {
    return (
      <span className={wrapperClass} aria-live="polite">
        <Link href={`/dashboard/video/${bookingId}`} className={controlClass}>
          <Video className="h-4 w-4" />
          {label}
        </Link>
      </span>
    );
  }

  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        {/*
          * Radix rende il tooltip in un portale con collision detection
          * automatica: prima appariva sempre sopra il bottone con una
          * posizione CSS fissa, e nella scheda dettaglio sessione — dove il
          * bottone sta vicino al bordo superiore della card — veniva
          * tagliato. `side="top"` è solo la preferenza di partenza; Radix lo
          * sposta sotto da sé quando sopra non c'è spazio, qui e in ogni
          * altro punto dell'app dove questo bottone compare.
          */}
        <Tooltip.Trigger asChild>
          <span className={wrapperClass} tabIndex={0} aria-live="polite">
            <span className={controlClass} aria-disabled="true">
              <Video className="h-4 w-4" />
              {label}
            </span>
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="top"
            align="center"
            collisionPadding={8}
            sideOffset={8}
            className="z-50 w-64 rounded-lg bg-gray-950 px-3 py-2 text-center text-xs font-medium leading-5 text-white shadow-lg"
          >
            {tooltip}
            <Tooltip.Arrow className="fill-gray-950" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
