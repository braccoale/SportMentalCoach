'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InviteModal } from './invite-modal';

/**
 * Inline "Invita un amico" trigger. Light-blue fill so it reads as its own,
 * friendly action distinct from the green "Nuovo appuntamento" primary. Shared
 * by the athlete and coach dashboards.
 */
export function InviteFriendButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-sky-500 text-white hover:bg-sky-600"
      >
        <UserPlus className="mr-2 h-4 w-4" />
        Invita un amico
      </Button>
      <InviteModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
