import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { getInvitationByToken } from '@/lib/core/guardians';
import {
  GUARDIAN_CONSENT_HASH,
  GUARDIAN_CONSENT_SECTIONS,
  GUARDIAN_CONSENT_VERSION,
} from '@/lib/core/guardians/consent-document';
import { LEGAL_CONTACT_EMAIL } from '@/lib/core/legal/processors';
import { ActionForm } from '@/components/action-form';
import { confirmGuardianAction } from './actions';

export const metadata = {
  title: 'Autorizzazione genitore — KaiPai',
  referrer: 'no-referrer' as const,
  // A one-off private link: keep it out of search results.
  robots: { index: false, follow: false },
};

/**
 * Where a guardian authorises a 15-17 year old athlete's path. Reached only
 * from the one-time link in their email — there is no account and no password,
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
          Questo link monouso non è più valido — i link scadono dopo 72 ore.
          Chiedi al giovane atleta di inviartene uno nuovo dalla sua
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

      <div className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-5 text-sm leading-relaxed text-gray-700">
        {GUARDIAN_CONSENT_SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="font-semibold text-gray-950">{section.title}</h2>
            <p className="mt-1">{section.text}</p>
          </section>
        ))}
        <p className="border-t border-gray-200 pt-3 text-xs text-gray-500">
          Documento {GUARDIAN_CONSENT_VERSION} · SHA-256{' '}
          <span className="break-all font-mono">{GUARDIAN_CONSENT_HASH}</span>
        </p>
      </div>

      <ActionForm
        action={confirmGuardianAction}
        className="mt-6 flex flex-col gap-4"
      >
        <input type="hidden" name="token" value={token} />

        <label className="text-sm font-medium text-gray-800">
          Digita il tuo nome e cognome completo
          <input
            name="signatureName"
            type="text"
            required
            minLength={3}
            maxLength={200}
            autoComplete="name"
            placeholder={invitation.guardianName}
            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-normal text-gray-950 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/20"
          />
          <span className="mt-1 block text-xs font-normal text-gray-500">
            Deve coincidere con “{invitation.guardianName}”, indicato nell’invito.
          </span>
        </label>

        <fieldset className="rounded-xl border border-gray-200 p-4">
          <legend className="px-1 text-sm font-medium text-gray-900">
            A quale titolo autorizzi?
          </legend>
          {invitation.relationship === 'tutore-legale' ? (
            <label className="mt-2 flex items-start gap-3 text-sm text-gray-700">
              <input type="radio" name="authorityBasis" value="legal_guardian" required />
              Sono il tutore legale del minore.
            </label>
          ) : (
            <div className="mt-2 space-y-3">
              <label className="flex items-start gap-3 text-sm text-gray-700">
                <input type="radio" name="authorityBasis" value="joint_agreement" required />
                Esercito la responsabilità genitoriale con l’accordo dell’altro genitore, se presente.
              </label>
              <label className="flex items-start gap-3 text-sm text-gray-700">
                <input type="radio" name="authorityBasis" value="sole_responsibility" required />
                Esercito legittimamente la responsabilità genitoriale in via esclusiva e posso documentarlo su richiesta.
              </label>
            </div>
          )}
        </fieldset>

        <label className="flex items-start gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            name="adultDeclared"
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
          />
          <span>
            Dichiaro di essere maggiorenne e che i dati identificativi inseriti
            sono miei, veritieri e aggiornati.
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            name="parentalResponsibilityDeclared"
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
          />
          <span>
            Dichiaro di esercitare la responsabilità genitoriale o tutela su{' '}
            {invitation.athleteName} e di poter fornire documentazione se
            richiesta per la sicurezza del minore.
          </span>
        </label>

        <label className="flex items-start gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            name="acceptedTerms"
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
          />
          <span>
            Ho letto e accetto il documento sopra, i{' '}
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

        <label className="flex items-start gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            name="acceptedVexatious"
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
          />
          <span>
            Approvo specificamente le clausole dei Termini su sospensione e
            cessazione del servizio, responsabilità, manleva per dichiarazioni
            non veritiere, modifiche dei Termini e legge applicabile.
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
          <input
            type="checkbox"
            name="aiRecordingAuthorized"
            className="mt-0.5 h-4 w-4 shrink-0 accent-blue-700"
          />
          <span>
            <strong>Facoltativo — Appunti AI.</strong> Autorizzo la possibile
            registrazione della sola traccia audio, trascrizione e preparazione
            del report. Coach e atleta dovranno comunque accettare separatamente
            prima di ogni registrazione. Se non seleziono questa opzione, le
            normali sessioni restano disponibili senza registrazione.
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
        Registriamo versione e impronta del documento, firma digitata, email,
        data, ora, indirizzo di rete e browser come prova. Riceverai una copia
        completa e un collegamento personale per revocare immediatamente. Puoi
        anche scrivere a {LEGAL_CONTACT_EMAIL}.
      </p>
    </main>
  );
}
