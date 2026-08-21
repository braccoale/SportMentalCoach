'use client';

import { useRef, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { track } from '@/lib/core/analytics';
import { cn } from '@/lib/utils';

export type GoogleCalendarUiSource =
  | 'booking_confirmation'
  | 'appointment_detail'
  | 'appointment_card';

type OpenWindow = (
  url?: string | URL,
  target?: string,
  features?: string
) => Window | null;

export type GoogleCalendarOpenResult = {
  status: 'opened' | 'blocked';
  url: string;
};

export function openGoogleCalendar(
  url: string,
  openWindow: OpenWindow
): GoogleCalendarOpenResult {
  const opened = openWindow(url, '_blank', 'noopener,noreferrer');
  return { status: opened ? 'opened' : 'blocked', url };
}

export function GoogleCalendarFeedback({
  result,
}: {
  result: GoogleCalendarOpenResult | null;
}) {
  if (!result) return null;
  const blocked = result.status === 'blocked';
  const message = blocked
    ? 'Il browser ha bloccato l’apertura di Google Calendar. Clicca qui per continuare.'
    : 'Google Calendar aperto in una nuova scheda.';

  return (
    <p
      role={blocked ? 'alert' : 'status'}
      aria-live="polite"
      className="max-w-md text-sm text-gray-600"
    >
      {blocked ? (
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-blue-700 underline underline-offset-2"
        >
          {message}
        </a>
      ) : (
        message
      )}
    </p>
  );
}

export function AddToGoogleCalendarButton({
  url,
  uiSource,
  userRole,
  sessionType = 'online',
  compact = false,
  menuItem = false,
  className,
}: {
  url: string | null;
  uiSource: GoogleCalendarUiSource;
  userRole: 'athlete' | 'coach';
  sessionType?: 'online' | 'in_person';
  compact?: boolean;
  menuItem?: boolean;
  className?: string;
}) {
  const opening = useRef(false);
  const [openResult, setOpenResult] =
    useState<GoogleCalendarOpenResult | null>(null);

  if (!url) return null;

  function handleClick() {
    if (opening.current) return;
    opening.current = true;
    setOpenResult(null);

    track('google_calendar_add_clicked', {
      role: userRole,
      session_type: sessionType,
      ui_source: uiSource,
    });

    const result = openGoogleCalendar(url!, window.open.bind(window));
    setOpenResult(result);

    window.setTimeout(() => {
      opening.current = false;
    }, 750);
  }

  if (menuItem) {
    return (
      <DropdownMenuItem
        onSelect={handleClick}
        className={cn('cursor-pointer gap-2', className)}
      >
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        Aggiungi al calendario
      </DropdownMenuItem>
    );
  }

  return (
    <div
      className={cn(
        compact ? 'flex flex-col items-start gap-1' : 'flex flex-col gap-2',
        className
      )}
    >
      <Button
        type="button"
        variant={compact ? 'outline' : 'default'}
        size={compact ? 'sm' : 'lg'}
        onClick={handleClick}
        className={cn(
          'rounded-full',
          compact ? 'w-auto' : 'w-full sm:w-auto'
        )}
        aria-label="Aggiungi a Google Calendar"
      >
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />
        {compact ? 'Aggiungi al calendario' : 'Aggiungi a Google Calendar'}
      </Button>

      <GoogleCalendarFeedback result={openResult} />
    </div>
  );
}
