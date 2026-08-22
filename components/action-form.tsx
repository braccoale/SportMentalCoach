'use client';

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';
import { createPortal } from 'react-dom';
import { MessageSquareText, TriangleAlert, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';
import { CANCELLATION_NOTE_MAX_LENGTH } from '@/lib/core/bookings/cancellation-message';

type ConfirmationSubmission = {
  sendCancellationMessage: boolean;
  cancellationMessage: string;
};

export function ConfirmationDialog({
  open,
  title,
  message,
  actionLabel,
  collectCancellationMessage = false,
  busy = false,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title?: string;
  message: string;
  actionLabel?: string;
  collectCancellationMessage?: boolean;
  busy?: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: (submission?: ConfirmationSubmission) => void;
}) {
  const t = useTranslations('SharedActions');
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [sendMessage, setSendMessage] = useState(true);
  const [cancellationMessage, setCancellationMessage] = useState('');

  useEffect(() => {
    if (!open) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    setSendMessage(true);
    setCancellationMessage('');
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

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <button
        type="button"
        aria-label={t('closeConfirmation')}
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
          aria-label={t('close')}
          className="absolute right-4 top-4 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <TriangleAlert className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 id={titleId} className="mt-5 pr-8 text-xl font-semibold text-gray-950">
          {title ?? t('confirmOperation')}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm leading-6 text-gray-600">
          {message}
        </p>

        {collectCancellationMessage ? (
          <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={sendMessage}
                onChange={(event) => setSendMessage(event.target.checked)}
                className="mt-0.5 size-4 rounded border-gray-300 accent-red-600"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <MessageSquareText className="size-4 text-red-600" aria-hidden="true" />
                  Manda messaggio
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-gray-500">
                  Invieremo “Appuntamento Annullato” nella chat della sessione.
                </span>
              </span>
            </label>

            <label className="mt-3 block text-xs font-medium text-gray-700">
              Messaggio aggiuntivo <span className="font-normal text-gray-400">(opzionale)</span>
              <textarea
                value={cancellationMessage}
                onChange={(event) => setCancellationMessage(event.target.value)}
                disabled={!sendMessage}
                maxLength={CANCELLATION_NOTE_MAX_LENGTH}
                rows={3}
                placeholder="Aggiungi un breve messaggio…"
                className="mt-1.5 w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-normal leading-5 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
              />
            </label>
            {sendMessage ? (
              <p className="mt-1 text-right text-[11px] text-gray-400">
                {cancellationMessage.length}/{CANCELLATION_NOTE_MAX_LENGTH}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
            className="h-11 rounded-full px-5"
          >
            {t('back')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() =>
              onConfirm(
                collectCancellationMessage
                  ? { sendCancellationMessage: sendMessage, cancellationMessage }
                  : undefined
              )
            }
            className="h-11 rounded-full px-5"
          >
            {busy ? 'Annullamento…' : actionLabel ?? t('confirm')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Minimal client wrapper for a server action that returns an `ActionState`.
 * Renders the form children and surfaces `error` / `success` inline, so
 * form-action buttons no longer swallow domain failures.
 *
 * The action is dispatched by hand from `onSubmit` rather than through
 * `<form action={…}>`: React resets the form natively after an action passed
 * that way, and a native reset snaps every `<select>` back to its first option
 * without telling React. On a failed submit the fields would silently disagree
 * with the state driving them — the coach saw "Nuovo appuntamento" jump back to
 * the first athlete and the earliest hour, while the hidden date/time still
 * carried what they had picked before.
 */
export function ActionForm({
  action,
  children,
  className,
  formId,
  onSuccess,
  confirmMessage,
  confirmTitle,
  confirmActionLabel,
  collectCancellationMessage = false,
  messageFirst = false,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  formId?: string;
  /** Called once when the action reports success (e.g. close a drawer). */
  onSuccess?: (state: ActionState) => void;
  /** Optional confirmation shown before submitting a destructive action. */
  confirmMessage?: string;
  confirmTitle?: string;
  confirmActionLabel?: string;
  /** Aggiunge checkbox e nota opzionale al dialog di annullamento. */
  collectCancellationMessage?: boolean;
  /**
   * Renders the error/success line at the top of the form instead of after the
   * children. For tall forms — a dialog that fills the screen on a phone — a
   * message at the bottom is off-screen, and the submit reads as "nothing
   * happened". Requires a flex-column form.
   */
  messageFirst?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, {});
  const [, startTransition] = useTransition();
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const submitterRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (state?.success) onSuccess?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire per result
  }, [state]);

  function closeConfirmation() {
    setConfirmationOpen(false);
  }

  function confirmSubmission(submission?: ConfirmationSubmission) {
    const form = formRef.current;
    if (!form) return;

    setConfirmationOpen(false);
    dispatch(form, submitterRef.current, submission);
  }

  function dispatch(
    form: HTMLFormElement,
    submitter: HTMLElement | null,
    submission?: ConfirmationSubmission
  ) {
    const formData = new FormData(form);
    // `FormData(form)` never includes buttons, so the submitter's own
    // name/value (e.g. `startNow=1`) has to be carried over by hand.
    const button = submitter as HTMLButtonElement | null;
    if (button?.name && !formData.has(button.name)) {
      formData.append(button.name, button.value);
    }
    if (submission) {
      formData.set(
        'sendCancellationMessage',
        submission.sendCancellationMessage ? '1' : '0'
      );
      formData.set('cancellationMessage', submission.cancellationMessage);
    }
    startTransition(() => formAction(formData));
  }

  const message = state?.error ? (
    <p className={`text-sm text-red-500 ${messageFirst ? '' : 'mt-1'}`}>
      {state.error}
    </p>
  ) : state?.success ? (
    <p className={`text-sm text-green-600 ${messageFirst ? '' : 'mt-1'}`}>
      {state.success}
    </p>
  ) : null;

  return (
    <>
      <form
        ref={formRef}
        id={formId}
        className={className}
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const submitter =
            event.nativeEvent instanceof SubmitEvent
              ? (event.nativeEvent.submitter as HTMLElement | null)
              : null;

          if (confirmMessage) {
            submitterRef.current = submitter;
            setConfirmationOpen(true);
            return;
          }

          dispatch(form, submitter);
        }}
      >
        {messageFirst && message}
        {children}
        {!messageFirst && message}
      </form>

      {confirmMessage && (
        <ConfirmationDialog
          open={confirmationOpen}
          title={confirmTitle}
          message={confirmMessage}
          actionLabel={confirmActionLabel}
          collectCancellationMessage={collectCancellationMessage}
          onCancel={closeConfirmation}
          onConfirm={confirmSubmission}
        />
      )}
    </>
  );
}
