'use client';

import Link from 'next/link';
import { Video } from 'lucide-react';
import { Tooltip } from 'radix-ui';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { canJoinVideoNow, nextVideoJoinAvailabilityChange } from '@/lib/core/sessions';

const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Gemello di `VideoCallButton` (components/video-call-button.tsx) ma verso
 * `/dashboard/video/academy/[sessionId]`, non `/dashboard/video/[bookingId]`
 * — copia deliberata, non una generalizzazione del componente prenotazioni:
 * così un errore qui non può toccare il pulsante già in produzione per le
 * chiamate coach-atleta.
 */
export function AcademyVideoCallButton({
  sessionId,
  scheduledFor,
  durationMin,
  compact = false,
}: {
  sessionId: number;
  scheduledFor: string;
  durationMin: number;
  compact?: boolean;
}) {
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    const appointment = new Date(scheduledFor);
    if (Number.isNaN(appointment.getTime())) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const synchronize = () => {
      if (timer) clearTimeout(timer);
      const now = new Date();
      setIsEnabled(canJoinVideoNow(appointment, durationMin, now));

      const nextChange = nextVideoJoinAvailabilityChange(appointment, durationMin, now);
      if (nextChange) {
        const delay = Math.max(
          0,
          Math.min(MAX_TIMEOUT_MS, nextChange.getTime() - now.getTime() + 25)
        );
        timer = setTimeout(synchronize, delay);
      }
    };
    const synchronizeWhenVisible = () => {
      if (document.visibilityState === 'visible') synchronize();
    };

    synchronize();
    window.addEventListener('focus', synchronize);
    document.addEventListener('visibilitychange', synchronizeWhenVisible);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('focus', synchronize);
      document.removeEventListener('visibilitychange', synchronizeWhenVisible);
    };
  }, [durationMin, scheduledFor]);

  const tooltip = 'La videochiamata sarà disponibile 5 minuti prima dell’orario previsto.';
  const controlClass = cn(
    'inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors',
    compact ? 'h-9 px-3 text-xs' : 'h-9 px-4',
    isEnabled ? 'bg-green-600 text-white hover:bg-green-700' : 'cursor-not-allowed bg-gray-100 text-gray-400'
  );

  if (isEnabled) {
    return (
      <Link href={`/dashboard/video/academy/${sessionId}`} className={controlClass}>
        <Video className="h-4 w-4" />
        Entra in chiamata
      </Link>
    );
  }

  return (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span tabIndex={0} aria-live="polite">
            <span className={controlClass} aria-disabled="true">
              <Video className="h-4 w-4" />
              Entra in chiamata
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
