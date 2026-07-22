'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2, X } from 'lucide-react';
import { signUp } from '@/app/(login)/actions';
import type { ActionState } from '@/lib/auth/middleware';

const inputCls =
  'w-full rounded-full border border-kp-line bg-kp-surface px-4 py-2.5 text-sm text-kp-hi placeholder:text-kp-low focus:border-kp-red/50 focus:outline-none';

const ROLES = [
  ['athlete', 'Atleta'],
  ['coach', 'Coach'],
  ['club', 'Club'],
] as const;

/**
 * Sign-up popup for the landing page. Mirrors {@link SignInModal}: reuses the
 * `signUp` server action (which redirects to the dashboard on success), KaiPai
 * logo, Italian labels, and a show/hide password toggle. `onSwitch` flips to the
 * sign-in modal without a page navigation.
 */
export function SignUpModal({
  open,
  onClose,
  onSwitch,
}: {
  open: boolean;
  onClose: () => void;
  onSwitch: () => void;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    signUp,
    { error: '' }
  );
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState(state?.email ?? '');
  // Only athletes declare a birth date: the age rules exist to protect young
  // athletes, not to vet a coach or a club signing up professionally.
  const [role, setRole] = useState<string>('athlete');

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

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Registrati"
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
            alt="KaiPai — Mental Coaching"
            width={626}
            height={178}
            className="h-28 w-auto sm:h-32"
          />
          <h2 className="mt-4 font-display text-2xl font-semibold text-kp-hi">
            Crea il tuo account
          </h2>
        </div>

        <form className="mt-8 space-y-5" action={formAction}>
          <input type="hidden" name="redirect" value="" />
          <input type="hidden" name="priceId" value="" />
          <input type="hidden" name="inviteId" value="" />

          <div>
            <label
              htmlFor="signup-email"
              className="mb-1.5 block text-sm font-medium text-kp-mid"
            >
              Email
            </label>
            <div className="relative">
              <input
                id="signup-email"
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
              htmlFor="signup-password"
              className="mb-1.5 block text-sm font-medium text-kp-mid"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="signup-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                defaultValue={state?.password}
                required
                minLength={8}
                maxLength={100}
                className={`${inputCls} pr-11`}
                placeholder="Almeno 8 caratteri"
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
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-kp-mid">
              Mi registro come
            </span>
            <div className="grid grid-cols-3 gap-2">
              {ROLES.map(([value, label]) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-kp-line bg-kp-surface px-3 py-2 text-sm text-kp-mid transition-colors has-[:checked]:border-kp-red/60 has-[:checked]:bg-kp-red/10 has-[:checked]:text-kp-hi"
                >
                  <input
                    type="radio"
                    name="role"
                    value={value}
                    checked={role === value}
                    onChange={() => setRole(value)}
                    className="accent-kp-red"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {role === 'athlete' && (
            <div>
              <label
                htmlFor="birthDate"
                className="mb-1.5 block text-sm font-medium text-kp-mid"
              >
                Data di nascita
              </label>
              <input
                id="birthDate"
                name="birthDate"
                type="date"
                required
                className={inputCls}
              />
              <p className="mt-1.5 text-xs text-kp-low">
                KaiPai è riservato agli atleti dai 15 anni in su. Sotto i 18
                serve l’autorizzazione di un genitore o tutore, che potrai
                invitare subito dopo la registrazione.
              </p>
            </div>
          )}

          {state?.error && (
            <p className="text-sm text-kp-red">{state.error}</p>
          )}

          {/* Acceptance sits above the submit button, not below it: this is the
              moment consent is actually given, so it has to be readable before
              the click rather than after it. */}
          <p className="text-xs leading-relaxed text-kp-low">
            Creando un account dichiari di aver letto e di accettare i{' '}
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
            . Se hai meno di 18 anni, ti serve il consenso di un genitore o
            tutore.
          </p>

          <button
            type="submit"
            disabled={pending}
            className="kp-cta flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 font-semibold text-white disabled:opacity-70"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creazione…
              </>
            ) : (
              'Registrati'
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-kp-mid">
          Hai già un account?{' '}
          <button
            type="button"
            onClick={onSwitch}
            className="font-semibold text-kp-red hover:underline"
          >
            Accedi
          </button>
        </p>
      </div>
    </div>
  );
}
