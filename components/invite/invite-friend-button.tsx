'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { InviteModal } from './invite-modal';

/**
 * Inline "Invita un amico" trigger, styled as a SECONDARY (outline) button so
 * it sits next to the primary "Nuovo appuntamento" without competing with it —
 * one filled primary + one outline secondary keeps the hierarchy clear.
 */
export function InviteFriendButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="rounded-full"
      >
        <UserPlus className="mr-2 h-4 w-4" />
        Invita un amico
      </Button>
      <InviteModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
