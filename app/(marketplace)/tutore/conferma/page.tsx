import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { getInvitationByToken } from '@/lib/core/guardians';
import { ActionForm } from '@/components/action-form';
import { confirmGuardianAction } from './actions';

export const metadata = {
  title: 'Autorizzazione genitore — KaiPai',
  // A one-off private link: keep it out of search results.
  robots: { index: false, follow: false },
};

/**
 * Where a guardian authorises a 15-17 year old athlete's path. Reached only
 * from the signed link in their email — there is no account and no password,
 * which is the whole point: asking a parent to register would cost more
 * authorisations than it would protect.
 */
export default async function GuardianConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invitation = token ? await getInvitationByToken(token) : null;

  const shell =
    'mx-auto w-full max-w-lg flex-1 px-4 py-14 sm:px-6 lg:px-8';

  if (!invitation) {
    return (
      <main className={shell}>
        <h1 className="text-2xl font-bold text-gray-900">
          Link non valido o scaduto
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          Questo link di autorizzazione non è più valido — i link scadono dopo
          14 giorni. Chiedi al giovane atleta di inviartene uno nuovo dalla sua
          area personale.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-red-600 hover:text-red-700"
        >
          Torna alla home
        </Link>
      </main>
    );
  }

  if (invitation.alreadyConfirmed) {
    return (
      <main className={shell}>
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-emerald-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            Autorizzazione già registrata
          </h1>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Hai già autorizzato il percorso di {invitation.athleteName}. Non devi
          fare altro.
        </p>
      </main>
    );
  }

  return (
    <main className={shell}>
      <h1 className="text-2xl font-bold text-gray-900">
        Autorizza il percorso di {invitation.athleteName}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-600">
        {invitation.athleteName} ti ha indicato come genitore o tutore di
        riferimento. Poiché è minorenne, il contratto con KaiPai va concluso da
        te: senza questa conferma non può richiedere sessioni.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm leading-relaxed text-gray-700">
        <p className="font-medium text-gray-900">Cosa stai autorizzando</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            L’avvio di un percorso di mental coaching sportivo, che{' '}
            <strong>non è una terapia psicologica</strong> e non sostituisce un
            percorso clinico.
          </li>
          <li>
            Sessioni in videochiamata con un coach approvato da KaiPai. Le
            chiamate non vengono registrate.
          </li>
          <li>
            Uno spazio di riservatezza per il ragazzo. La riservatezza non è mai
            un ostacolo alla tutela: se emerge qualcosa che riguarda la sua
            salute o la sua incolumità, il coach coinvolge la famiglia.
          </li>
          <li>
            Il trattamento dei suoi dati come descritto nella{' '}
            <Link href="/privacy" className="text-red-600 underline">
              Privacy Policy
            </Link>
            .
          </li>
        </ul>
      </div>

      <ActionForm
        action={confirmGuardianAction}
        className="mt-6 flex flex-col gap-4"
      >
        <input type="hidden" name="token" value={token} />

        <label className="flex items-start gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            name="bothParents"
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
          />
          <span>
            Dichiaro di esercitare la responsabilità genitoriale su{' '}
            {invitation.athleteName} e, se l’altro genitore è presente, di agire
            anche con il suo accordo. Dichiaro di aver letto e di accettare i{' '}
            <Link href="/terms" className="text-red-600 underline">
              Termini e Condizioni
            </Link>{' '}
            e la{' '}
            <Link href="/privacy" className="text-red-600 underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <button
          type="submit"
          className="rounded-full bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-700"
        >
          Autorizzo il percorso
        </button>
      </ActionForm>

      <p className="mt-6 text-xs leading-relaxed text-gray-400">
        Registriamo la data, l’ora e l’indirizzo di rete di questa conferma come
        prova dell’autorizzazione. Puoi revocarla in qualsiasi momento
        scrivendo a info@kaipai.com.
      </p>
    </main>
  );
}
