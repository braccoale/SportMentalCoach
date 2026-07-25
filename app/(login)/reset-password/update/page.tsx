'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { confirmPasswordReset } from '../../actions';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * Second step of the reset flow: the email link created a session via
 * /auth/callback; here the user picks the new password.
 */
export default function UpdatePasswordPage() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    confirmPasswordReset,
    { error: '' }
  );

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img
            src="/logo.jpg"
            alt="KaiPai"
            width={127}
            height={141}
            className="h-14 w-auto rounded-xl"
          />
        </div>
        <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Scegli la nuova password
        </h1>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <form className="space-y-6" action={formAction}>
          <div>
            <Label htmlFor="password">Nuova password</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={100}
              placeholder="Minimo 8 caratteri"
              className="mt-1 rounded-full"
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword">Conferma password</Label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={100}
              placeholder="Ripeti la password"
              className="mt-1 rounded-full"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-500">
              {state.error}{' '}
              <Link href="/reset-password" className="font-medium underline">
                Richiedi un nuovo link
              </Link>
            </p>
          )}

          <Button
            type="submit"
            disabled={pending}
            className="w-full rounded-full"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvataggio…
              </>
            ) : (
              'Salva nuova password'
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
