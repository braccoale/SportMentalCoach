'use client';

import Link from 'next/link';
import { Video } from 'lucide-react';
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
  const controlClass = cn(
    'inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors',
    prominent
      ? 'h-12 w-full px-6 text-base'
      : variant === 'compact'
        ? 'h-9 w-full px-3'
        : variant === 'calendar'
          ? 'w-full px-4 py-2.5 font-medium'
          : 'px-5 py-2.5',
    isEnabled
      ? 'bg-green-600 text-white hover:bg-green-700'
      : variant === 'calendar'
        ? 'cursor-not-allowed bg-kp-line text-kp-low'
        : 'cursor-not-allowed bg-gray-100 text-gray-400'
  );

  return (
    <span
      className={cn(
        'group relative inline-flex',
        (prominent ||
          variant === 'compact' ||
          variant === 'calendar') &&
          'w-full'
      )}
      tabIndex={isEnabled ? undefined : 0}
      aria-label={!isEnabled ? tooltip : undefined}
      aria-live="polite"
    >
      {isEnabled ? (
        <Link
          href={`/dashboard/video/${bookingId}`}
          className={controlClass}
        >
          <Video className="h-4 w-4" />
          {label}
        </Link>
      ) : (
        <span className={controlClass} aria-disabled="true">
          <Video className="h-4 w-4" />
          {label}
        </span>
      )}
      {!isEnabled && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-64 -translate-x-1/2 rounded-lg bg-gray-950 px-3 py-2 text-center text-xs font-medium leading-5 text-white shadow-lg group-hover:block group-focus:block group-focus-within:block"
        >
          {tooltip}
        </span>
      )}
    </span>
  );
}
