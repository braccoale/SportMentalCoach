'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { requestPasswordReset } from '../actions';
import type { ActionState } from '@/lib/auth/middleware';

function ResetForm() {
  const searchParams = useSearchParams();
  const linkError = searchParams.get('error') === 'link';
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    requestPasswordReset,
    { error: '' }
  );

  return (
    <div className="flex min-h-[100dvh] flex-col justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Link href="/" aria-label="Kai Pai — home">
            <img
              src="/logo.jpg"
              alt="Kai Pai"
              width={127}
              height={141}
              className="h-14 w-auto rounded-xl"
            />
          </Link>
        </div>
        <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Reimposta la password
        </h1>
        <p className="mt-2 text-center text-sm text-gray-500">
          Inserisci la tua email: ti invieremo un link per scegliere una nuova
          password.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        {linkError && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Il link non è più valido. Richiedine uno nuovo qui sotto.
          </p>
        )}
        <form className="space-y-6" action={formAction}>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={255}
              placeholder="nome@esempio.it"
              className="mt-1 rounded-full"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-500">{state.error}</p>
          )}
          {state?.success && (
            <p className="text-sm text-green-600">{state.success}</p>
          )}

          <Button
            type="submit"
            disabled={pending}
            className="w-full rounded-full bg-red-600 text-white hover:bg-red-700"
          >
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Invio…
              </>
            ) : (
              'Invia link di reimpostazione'
            )}
          </Button>

          <p className="text-center text-sm text-gray-500">
            <Link href="/sign-in" className="font-medium text-red-600 hover:underline">
              Torna all’accesso
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
