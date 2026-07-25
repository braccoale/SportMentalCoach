'use client';

import { useActionState, useEffect } from 'react';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * Minimal client wrapper for a server action that returns an `ActionState`.
 * Renders the form children and surfaces `error` / `success` inline, so
 * form-action buttons no longer swallow domain failures.
 */
export function ActionForm({
  action,
  children,
  className,
  onSuccess,
  confirmMessage,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  /** Called once when the action reports success (e.g. close a drawer). */
  onSuccess?: (state: ActionState) => void;
  /** Optional confirmation shown before submitting a destructive action. */
  confirmMessage?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state?.success) onSuccess?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire per result
  }, [state]);

  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(event) => {
        if (confirmMessage && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {children}
      {state?.error && (
        <p className="mt-1 text-sm text-red-500">{state.error}</p>
      )}
      {state?.success && (
        <p className="mt-1 text-sm text-green-600">{state.success}</p>
      )}
    </form>
  );
}
