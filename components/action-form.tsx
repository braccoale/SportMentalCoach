'use client';

import { useActionState } from 'react';
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
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});

  return (
    <form action={formAction} className={className}>
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
