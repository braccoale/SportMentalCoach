'use client';

import { Suspense, useActionState } from 'react';
import useSWR from 'swr';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { updateAccount } from '@/app/(login)/actions';
import { fetcher } from '@/lib/fetcher';
import type { User } from '@/lib/db/schema';

type ActionState = {
  name?: string;
  lastName?: string;
  email?: string;
  error?: string;
  success?: string;
};

const mandatoryInputClass =
  'invalid:border-red-500 invalid:ring-2 invalid:ring-red-500/20';

function AccountFields({
  state,
  nameValue = '',
  lastNameValue = '',
  emailValue = '',
}: {
  state: ActionState;
  nameValue?: string;
  lastNameValue?: string;
  emailValue?: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="name" className="mb-2">
            Nome <span className="text-red-600" aria-hidden="true">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            placeholder="Il tuo nome"
            defaultValue={state.name || nameValue}
            required
            aria-required="true"
            className={mandatoryInputClass}
          />
        </div>
        <div>
          <Label htmlFor="lastName" className="mb-2">
            Cognome <span className="text-red-600" aria-hidden="true">*</span>
          </Label>
          <Input
            id="lastName"
            name="lastName"
            placeholder="Il tuo cognome"
            defaultValue={state.lastName || lastNameValue}
            required
            aria-required="true"
            className={mandatoryInputClass}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="email" className="mb-2">
          Email <span className="text-red-600" aria-hidden="true">*</span>
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="La tua email"
          defaultValue={state.email || emailValue}
          required
          aria-required="true"
          className={mandatoryInputClass}
        />
      </div>
    </>
  );
}

function AccountFieldsWithData({ state }: { state: ActionState }) {
  const { data: user, isLoading } = useSWR<User>('/api/user', fetcher);
  if (isLoading || !user) {
    return <div className="h-36 animate-pulse rounded-md bg-gray-100" />;
  }
  return (
    <AccountFields
      state={state}
      nameValue={user?.name ?? ''}
      lastNameValue={user?.lastName ?? ''}
      emailValue={user?.email ?? ''}
    />
  );
}

/** Account Information card — edit display name and email. */
export function AccountInfoCard() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateAccount,
    {}
  );

  return (
    <Card className="h-full gap-4 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-base">Informazioni account</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <form className="space-y-4" action={formAction}>
          <Suspense fallback={<AccountFields state={state} />}>
            <AccountFieldsWithData state={state} />
          </Suspense>
          {state.error && <p className="text-sm text-red-500">{state.error}</p>}
          {state.success && (
            <p className="text-sm text-green-600">{state.success}</p>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvataggio…
              </>
            ) : (
              'Salva modifiche'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
