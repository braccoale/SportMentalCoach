import Link from 'next/link';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { getGuardianManagementByToken } from '@/lib/core/guardians';
import { LEGAL_CONTACT_EMAIL } from '@/lib/core/legal/processors';
import { revokeGuardianAction } from './actions';

export const metadata = {
  title: 'Gestisci autorizzazione tutore — KaiPai',
  referrer: 'no-referrer' as const,
  robots: { index: false, follow: false },
};

export default async function ManageGuardianPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = String((await searchParams).token ?? '');
  const authorization = token
    ? await getGuardianManagementByToken(token)
    : null;
  const shell = 'mx-auto w-full max-w-lg flex-1 px-4 py-14 sm:px-6 lg:px-8';

  if (!authorization) {
    return (
      <main className={shell}>
        <h1 className="text-2xl font-bold text-gray-950">
          Collegamento non valido
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          Usa il collegamento personale contenuto nella ricevuta oppure scrivi a{' '}
          <a className="text-red-600 underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </main>
    );
  }

  if (authorization.status === 'revoked') {
    return (
      <main className={shell}>
        <div className="flex items-center gap-3">
          <ShieldX className="h-7 w-7 text-red-600" />
          <h1 className="text-2xl font-bold text-gray-950">
            Autorizzazione revocata
          </h1>
        </div>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          L’autorizzazione per {authorization.athleteName} è stata revocata
          {authorization.revokedAt
            ? ` il ${authorization.revokedAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}`
            : ''}
          . Non sono possibili altre sessioni finché non viene completata una
          nuova autorizzazione.
        </p>
      </main>
    );
  }

  return (
    <main className={shell}>
      <div className="flex items-center gap-3">
        <ShieldCheck className="h-7 w-7 text-emerald-600" />
        <h1 className="text-2xl font-bold text-gray-950">
          Autorizzazione attiva
        </h1>
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-600">
        Hai autorizzato il percorso di {authorization.athleteName} il{' '}
        {authorization.confirmedAt.toLocaleString('it-IT', {
          timeZone: 'Europe/Rome',
        })}
        . Appunti AI:{' '}
        <strong>
          {authorization.aiRecordingAuthorized
            ? 'autorizzati con consenso per singola sessione'
            : 'non autorizzati'}
        </strong>
        .
      </p>

      <section className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-5">
        <h2 className="font-semibold text-red-950">Revoca immediata</h2>
        <p className="mt-2 text-sm leading-6 text-red-900">
          La revoca annulla le sessioni richieste o confermate, rende le chat
          collegate di sola lettura, blocca nuovi accessi alla videochiamata e
          interrompe registrazioni ed elaborazioni AI ancora in corso.
        </p>
        <ActionForm
          action={revokeGuardianAction}
          className="mt-5 space-y-4"
          confirmTitle="Revocare l’autorizzazione?"
          confirmMessage="L’operazione è immediata: le sessioni non concluse verranno annullate e il coach sarà avvisato."
          confirmActionLabel="Revoca autorizzazione"
        >
          <input type="hidden" name="token" value={token} />
          <label className="block text-sm font-medium text-red-950">
            Digita nuovamente il tuo nome completo
            <input
              type="text"
              name="signatureName"
              required
              minLength={3}
              maxLength={200}
              autoComplete="name"
              placeholder={authorization.guardianName}
              className="mt-1 w-full rounded-xl border border-red-200 bg-white px-4 py-3 text-gray-950 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/20"
            />
          </label>
          <label className="block text-sm font-medium text-red-950">
            Motivo (facoltativo)
            <textarea
              name="reason"
              maxLength={500}
              rows={3}
              className="mt-1 w-full rounded-xl border border-red-200 bg-white px-4 py-3 font-normal text-gray-950 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/20"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-full bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700"
          >
            Revoca autorizzazione
          </button>
        </ActionForm>
      </section>

      <p className="mt-6 text-xs leading-5 text-gray-500">
        Se non riesci a usare questa procedura, contatta{' '}
        <a className="text-red-600 underline" href={`mailto:${LEGAL_CONTACT_EMAIL}`}>
          {LEGAL_CONTACT_EMAIL}
        </a>
        . <Link href="/privacy" className="text-red-600 underline">Privacy Policy</Link>
      </p>
    </main>
  );
}
