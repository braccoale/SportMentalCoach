'use client';

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';

export function ConfirmationDialog({
  open,
  title,
  message,
  actionLabel = 'Conferma',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  actionLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cancelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      requestAnimationFrame(() => previouslyFocusedRef.current?.focus());
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <button
        type="button"
        aria-label="Chiudi finestra di conferma"
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-gray-950/55 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        className="relative w-full max-w-md rounded-t-3xl border border-gray-200 bg-white p-6 shadow-2xl sm:rounded-3xl sm:p-7"
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Chiudi"
          className="absolute right-4 top-4 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <TriangleAlert className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 id={titleId} className="mt-5 pr-8 text-xl font-semibold text-gray-950">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-gray-600">
          {message}
        </p>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onCancel}
            className="h-11 rounded-full px-5"
          >
            Torna indietro
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            className="h-11 rounded-full px-5"
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

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
  confirmTitle = 'Conferma operazione',
  confirmActionLabel = 'Conferma',
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  /** Called once when the action reports success (e.g. close a drawer). */
  onSuccess?: (state: ActionState) => void;
  /** Optional confirmation shown before submitting a destructive action. */
  confirmMessage?: string;
  confirmTitle?: string;
  confirmActionLabel?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submitterRef = useRef<HTMLElement | null>(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    if (state?.success) onSuccess?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire per result
  }, [state]);

  function closeConfirmation() {
    setConfirmationOpen(false);
  }

  function confirmSubmission() {
    const form = formRef.current;
    if (!form) return;

    setConfirmationOpen(false);
    confirmedRef.current = true;
    const submitter = submitterRef.current;
    if (submitter && form.contains(submitter)) {
      form.requestSubmit(submitter);
    } else {
      form.requestSubmit();
    }
  }

  return (
    <>
      <form
        ref={formRef}
        action={formAction}
        className={className}
        onSubmit={(event) => {
          if (!confirmMessage) return;
          if (confirmedRef.current) {
            confirmedRef.current = false;
            return;
          }

          event.preventDefault();
          submitterRef.current =
            event.nativeEvent instanceof SubmitEvent
              ? (event.nativeEvent.submitter as HTMLElement | null)
              : null;
          setConfirmationOpen(true);
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

      {confirmMessage && (
        <ConfirmationDialog
          open={confirmationOpen}
          title={confirmTitle}
          message={confirmMessage}
          actionLabel={confirmActionLabel}
          onCancel={closeConfirmation}
          onConfirm={confirmSubmission}
        />
      )}
    </>
  );
}
