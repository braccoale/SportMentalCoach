'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';
import { signIn } from '@/app/(login)/actions';
import type { ActionState } from '@/lib/auth/middleware';

const inputCls =
  'w-full rounded-full border border-kp-line bg-kp-surface px-4 py-2.5 text-sm text-kp-hi placeholder:text-kp-low focus:border-kp-red/50 focus:outline-none';

/**
 * Sign-in popup for the landing page. Reuses the `signIn` server action (which
 * redirects to the dashboard on success), so no page navigation is needed to
 * open it. Italian labels, Kai Pai logo, and a show/hide password toggle.
 */
export function SignInModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    signIn,
    { error: '' }
  );
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(state?.email ?? '');

  // Close on Escape, and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const errorMessage =
    state?.error === 'Invalid email or password. Please try again.'
      ? 'Email o password non corretti. Riprova.'
      : state?.error;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Accedi"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/70 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="relative w-full max-w-md rounded-2xl border border-kp-line bg-kp-ink2 p-8 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="absolute right-4 top-4 text-kp-mid transition-colors hover:text-kp-hi"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center">
          <img
            src="/logo-transparent-clean.png"
            alt="Kai Pai — Mental Coaching"
            width={626}
            height={178}
            className="h-28 w-auto sm:h-32"
          />
          <h2 className="mt-4 font-display text-2xl font-semibold text-kp-hi">
            Accedi al tuo account
          </h2>
        </div>

        <form className="mt-8 space-y-5" action={formAction}>
          <input type="hidden" name="redirect" value="" />

          <div>
            <label
              htmlFor="modal-email"
              className="mb-1.5 block text-sm font-medium text-kp-mid"
            >
              Email
            </label>
            <div className="relative">
              <input
                id="modal-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={255}
                className={`${inputCls} pr-11`}
                placeholder="nome@esempio.it"
              />
              {email && (
                <button
                  type="button"
                  onClick={() => setEmail('')}
                  aria-label="Cancella email"
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-kp-low transition-colors hover:text-kp-hi"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="modal-password"
              className="mb-1.5 block text-sm font-medium text-kp-mid"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="modal-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                defaultValue={state?.password}
                required
                minLength={8}
                maxLength={100}
                className={`${inputCls} pr-11`}
                placeholder="La tua password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={
                  showPassword ? 'Nascondi password' : 'Mostra password'
                }
                className="absolute inset-y-0 right-0 flex items-center pr-4 text-kp-low transition-colors hover:text-kp-hi"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <div className="mt-1.5 text-right">
              <Link
                href="/reset-password"
                onClick={onClose}
                className="text-xs text-kp-mid transition-colors hover:text-kp-hi"
              >
                Password dimenticata?
              </Link>
            </div>
          </div>

          {errorMessage && (
            <p className="text-sm text-kp-red">{errorMessage}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="kp-cta flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-semibold text-white disabled:opacity-70"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Accesso…
              </>
            ) : (
              'Accedi'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-kp-mid">
          Non hai un account?{' '}
          <Link
            href="/sign-up"
            className="font-semibold text-kp-red hover:underline"
            onClick={onClose}
          >
            Registrati
          </Link>
        </p>

        <p className="mt-4 text-center text-xs leading-relaxed text-kp-low">
          Accedendo accetti i{' '}
          <Link
            href="/terms"
            onClick={onClose}
            className="underline transition-colors hover:text-kp-mid"
          >
            Termini e Condizioni
          </Link>
          , la{' '}
          <Link
            href="/privacy"
            onClick={onClose}
            className="underline transition-colors hover:text-kp-mid"
          >
            Privacy Policy
          </Link>{' '}
          e la{' '}
          <Link
            href="/cookie"
            onClick={onClose}
            className="underline transition-colors hover:text-kp-mid"
          >
            Cookie Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
