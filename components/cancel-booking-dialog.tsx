'use client';

import { useActionState, useEffect, useTransition } from 'react';
import { ConfirmationDialog } from '@/components/action-form';
import type { ActionState } from '@/lib/auth/middleware';

export function CancelBookingDialog({
  open,
  onOpenChange,
  action,
  bookingId,
  cancellationWouldBeLate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  bookingId: number;
  /**
   * Il server ha già deciso: cancellare *ora* farebbe contare questa sessione
   * come consumata (preavviso minimo non rispettato). Non è un blocco — solo
   * un avviso prima che l'utente confermi, così la scelta è consapevole.
   */
  cancellationWouldBeLate?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state.success) onOpenChange(false);
  }, [onOpenChange, state.success]);

  return (
    <ConfirmationDialog
      open={open}
      title="Annullare la sessione?"
      message={
        cancellationWouldBeLate
          ? 'Confermi di voler annullare questo appuntamento? Sei sotto il preavviso minimo: la sessione verrà comunque conteggiata come effettuata. L’operazione non può essere annullata.'
          : 'Confermi di voler annullare questo appuntamento? L’operazione non può essere annullata.'
      }
      actionLabel="Annulla sessione"
      collectCancellationMessage
      busy={pending}
      error={state.error}
      onCancel={() => {
        if (!pending) onOpenChange(false);
      }}
      onConfirm={(submission) => {
        if (!submission || pending) return;
        const formData = new FormData();
        formData.set('bookingId', String(bookingId));
        formData.set(
          'sendCancellationMessage',
          submission.sendCancellationMessage ? '1' : '0'
        );
        formData.set('cancellationMessage', submission.cancellationMessage);
        startTransition(() => formAction(formData));
      }}
    />
  );
}
