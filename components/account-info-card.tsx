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
  error?: string;
  success?: string;
};

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
            Nome
          </Label>
          <Input
            id="name"
            name="name"
            placeholder="Il tuo nome"
            defaultValue={state.name || nameValue}
            required
          />
        </div>
        <div>
          <Label htmlFor="lastName" className="mb-2">
            Cognome
          </Label>
          <Input
            id="lastName"
            name="lastName"
            placeholder="Il tuo cognome"
            defaultValue={state.lastName || lastNameValue}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="email" className="mb-2">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="La tua email"
          defaultValue={emailValue}
          required
        />
      </div>
    </>
  );
}

function AccountFieldsWithData({ state }: { state: ActionState }) {
  const { data: user } = useSWR<User>('/api/user', fetcher);
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
    <Card>
      <CardHeader>
        <CardTitle>Informazioni account</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" action={formAction}>
          <Suspense fallback={<AccountFields state={state} />}>
            <AccountFieldsWithData state={state} />
          </Suspense>
          {state.error && <p className="text-sm text-red-500">{state.error}</p>}
          {state.success && (
            <p className="text-sm text-green-600">{state.success}</p>
          )}
          <Button
            type="submit"
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={isPending}
          >
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
