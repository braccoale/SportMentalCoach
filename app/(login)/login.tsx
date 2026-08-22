'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { signIn, signUp } from './actions';
import { GoogleButton } from '@/components/auth/google-button';
import { ActionState } from '@/lib/auth/middleware';

export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  // Only athletes declare a birth date, so the field follows the role choice.
  const [role, setRole] = useState<string>('athlete');
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const priceId = searchParams.get('priceId');
  const inviteId = searchParams.get('inviteId');
  // Friend-referral code (from /invita/[code] → /sign-up?ref=CODE). Distinct
  // from `inviteId`, which is a team/club membership invitation.
  const ref = searchParams.get('ref');
  /**
   * L'accesso con Google e' fallito prima ancora di partire, oppure lo scambio
   * del codice non e' andato a buon fine. Senza questo, l'azione reindirizzava
   * qui con `?error=google` e la pagina si ridisegnava identica: l'utente
   * premeva il pulsante, sembrava una ricarica, non succedeva niente — e
   * poteva ripetere all'infinito senza capire.
   */
  const googleError = searchParams.get('error') === 'google';
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    mode === 'signin' ? signIn : signUp,
    { error: '' }
  );

  // Persist the referral code so it survives navigation within the auth flow
  // (e.g. sign-up ↔ sign-in). The signUp action reads formData first, then this
  // cookie. A referral code is not sensitive, so a plain lax cookie is fine.
  useEffect(() => {
    if (!ref) return;
    document.cookie = `kp_ref=${encodeURIComponent(ref)}; path=/; max-age=${
      60 * 60 * 24 * 30
    }; SameSite=Lax`;
  }, [ref]);

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Link href="/" aria-label="KaiPai — home">
            <img
              src="/logo.jpg"
              alt="KaiPai"
              width={127}
              height={141}
              className="h-14 w-auto rounded-xl"
            />
          </Link>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          {mode === 'signin'
            ? 'Accedi al tuo account'
            : 'Crea il tuo account'}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        {/* Google sta sopra le credenziali perche' per chi ce l'ha e' la via
            piu' corta, e chi non la usa scorre di due centimetri. Sotto resta
            tutto quello che c'era: nessuno perde il proprio modo di entrare. */}
        {googleError && (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            Non siamo riusciti a completare l’accesso con Google. Riprova, o
            entra con email e password.
          </p>
        )}

        <GoogleButton redirect={redirect} />

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-gray-50 px-2 text-gray-500">oppure</span>
          </div>
        </div>

        <form className="space-y-6" action={formAction}>
          <input type="hidden" name="redirect" value={redirect || ''} />
          <input type="hidden" name="priceId" value={priceId || ''} />
          <input type="hidden" name="inviteId" value={inviteId || ''} />
          <input type="hidden" name="ref" value={ref || ''} />

          {mode === 'signup' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700"
                >
                  Nome
                </Label>
                <div className="mt-1">
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    autoComplete="given-name"
                    required
                    maxLength={100}
                    className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-red-500 focus:border-red-500 focus:z-10 sm:text-sm"
                    placeholder="Mario"
                  />
                </div>
              </div>
              <div>
                <Label
                  htmlFor="lastName"
                  className="block text-sm font-medium text-gray-700"
                >
                  Cognome
                </Label>
                <div className="mt-1">
                  <Input
                    id="lastName"
                    name="lastName"
                    type="text"
                    autoComplete="family-name"
                    required
                    maxLength={100}
                    className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-red-500 focus:border-red-500 focus:z-10 sm:text-sm"
                    placeholder="Rossi"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <Label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </Label>
            <div className="mt-1">
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={state.email}
                required
                maxLength={50}
                className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-red-500 focus:border-red-500 focus:z-10 sm:text-sm"
                placeholder="nome@esempio.it"
              />
            </div>
          </div>

          <div>
            <Label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </Label>
            <div className="mt-1">
              <PasswordInput
                id="password"
                name="password"
                autoComplete={
                  mode === 'signin' ? 'current-password' : 'new-password'
                }
                defaultValue={state.password}
                required
                minLength={8}
                maxLength={100}
                className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-red-500 focus:border-red-500 focus:z-10 sm:text-sm"
                placeholder="La tua password"
              />
            </div>
          </div>

          {mode === 'signup' && (
            <div>
              <Label className="block text-sm font-medium text-gray-700">
                Mi registro come
              </Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    ['athlete', 'Atleta'],
                    ['coach', 'Coach'],
                    ['club', 'Club']
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className="flex items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 cursor-pointer has-[:checked]:border-red-500 has-[:checked]:bg-red-50 has-[:checked]:text-red-700"
                  >
                    <input
                      type="radio"
                      name="role"
                      value={value}
                      checked={role === value}
                      onChange={() => setRole(value)}
                      className="accent-red-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {mode === 'signup' && role === 'athlete' && (
            <div>
              <Label
                htmlFor="birthDate"
                className="block text-sm font-medium text-gray-700"
              >
                Data di nascita
              </Label>
              <div className="mt-1">
                <Input
                  id="birthDate"
                  name="birthDate"
                  type="date"
                  required
                  className="appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 text-gray-900 focus:outline-none focus:ring-red-500 focus:border-red-500 focus:z-10 sm:text-sm"
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                KaiPai è riservato agli atleti dai 15 anni in su. Sotto i 18
                serve l’autorizzazione di un genitore o tutore, che potrai
                invitare subito dopo la registrazione.
              </p>
            </div>
          )}

          {state?.error && (
            <div className="text-red-500 text-sm">{state.error}</div>
          )}

          <div>
            <Button
              type="submit"
              className="w-full rounded-full"
              disabled={pending}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin mr-2 h-4 w-4" />
                  Caricamento…
                </>
              ) : mode === 'signin' ? (
                'Accedi'
              ) : (
                'Registrati'
              )}
            </Button>
          </div>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-50 text-gray-500">
                {mode === 'signin'
                  ? 'Nuovo su KaiPai?'
                  : 'Hai già un account?'}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <Link
              href={`${mode === 'signin' ? '/sign-up' : '/sign-in'}${
                redirect ? `?redirect=${redirect}` : ''
              }${priceId ? `&priceId=${priceId}` : ''}${
                ref ? `${redirect ? '&' : '?'}ref=${ref}` : ''
              }`}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-full shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              {mode === 'signin'
                ? 'Crea un account'
                : 'Accedi con un account esistente'}
            </Link>
          </div>
        </div>

        {/* Same acceptance notice as the landing modals — this route is a
            fully functional entry point, so it can't be the one place where
            the legal links are missing. */}
        <p className="mt-6 text-center text-xs leading-relaxed text-gray-500">
          {mode === 'signup' ? 'Creando un account accetti' : 'Accedendo accetti'}{' '}
          i{' '}
          <Link href="/terms" className="underline hover:text-gray-700">
            Termini e Condizioni
          </Link>
          , la{' '}
          <Link href="/privacy" className="underline hover:text-gray-700">
            Privacy Policy
          </Link>{' '}
          e la{' '}
          <Link href="/cookie" className="underline hover:text-gray-700">
            Cookie Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
