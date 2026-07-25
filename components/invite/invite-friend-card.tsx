'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InviteModal } from './invite-modal';

/**
 * Primary entry point for "Invita un amico": a calm, human card for the athlete
 * dashboard (no rewards, no ad-banner energy). Opens the shared share modal.
 */
export function InviteFriendCard() {
  const [open, setOpen] = useState(false);

  return (
    <div
      id="invita-amico"
      className="scroll-mt-24 flex flex-col items-start gap-4 rounded-2xl border border-gray-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <UserPlus className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Conosci qualcuno che potrebbe averne bisogno?
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Invitalo a trovare il mental coach giusto per i suoi obiettivi
            sportivi.
          </p>
        </div>
      </div>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full"
      >
        <UserPlus className="mr-2 h-4 w-4" />
        Invita un amico
      </Button>

      <InviteModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
