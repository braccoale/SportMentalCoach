'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { InviteModal } from './invite-modal';

/**
 * Discreet, low-emphasis entry point for "Invita un amico" — meant for
 * secondary spots (e.g. after a completed session) where a full card would be
 * too much. Opens the same share modal.
 */
export function InviteFriendLink({
  label = 'Conosci qualcuno a cui potrebbe servire? Invita un amico',
}: {
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
      >
        <UserPlus className="h-4 w-4" />
        {label}
      </button>
      <InviteModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
