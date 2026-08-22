'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { Loader2, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ActionState } from '@/lib/auth/middleware';
import { track } from '@/lib/core/analytics';
import {
  MIN_SIGNUP_AGE,
  ageFromBirthDate,
  isEligibleAge,
  requiresGuardian,
} from '@/lib/core/guardians/age';
import { completeGoogleSignup } from './actions';

/**
 * Quello che Google non sa di te.
 *
 * Le stesse domande del terzo passo del wizard, con le stesse parole: le
 * formule dei consensi sono atti giuridici, e riscriverle «più chiare» qui
 * significherebbe avere due versioni di ciò che l'utente ha accettato, senza
 * sapere quale mostrare se un giorno lo si dovesse dimostrare.
 *
 * Nome ed email arrivano già compilati da Google. Il nome resta modificabile —
 * è quello dell'account Google, non necessariamente quello con cui una persona
 * vuole farsi chiamare da un coach.
 */

const INPUT =
  'appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm';

function Req() {
  return (
    <span className="text-red-600" aria-hidden="true">
      {' '}
      *
    </span>
  );
}

const ROLES = [
  {
    value: 'athlete',
    icon: User,
    title: 'Sono un atleta',
    desc: 'Voglio migliorare le mie prestazioni mentali e trovare il coach più adatto.',
  },
  {
    value: 'coach',
    icon: Users,
    title: 'Sono un mental coach',
    desc: 'Voglio presentare il mio profilo e lavorare con nuovi atleti.',
  },
] as const;

export function CompleteSignupForm({
  email,
  presetRole,
  presetName,
  presetLastName,
  redirectTo,
}: {
  email: string;
  presetRole: string;
  presetName: string;
  presetLastName: string;
  redirectTo: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    completeGoogleSignup,
    { error: '' }
  );

  const [role, setRole] = useState(presetRole);
  const [birthDate, setBirthDate] = useState('');
  const [terms, setTerms] = useState(false);
  const [vexatious, setVexatious] = useState(false);
  const [marketing, setMarketing] = useState(false);

  /**
   * Gli stessi eventi del wizard, con `method` a distinguerli.
   *
   * Non eventi nuovi: il funnel deve restare confrontabile fra i due modi di
   * registrarsi. Senza questi, `signup_age_verified` sarebbe sceso verso zero
   * mentre gli account continuavano a nascere — e la metrica sui minori
   * bloccati avrebbe smesso di contare proprio i minori per cui esiste.
   *
   * Qui l'identita' e' gia' stata ottenuta, quindi il passo credenziali e'
   * concluso nel momento in cui questa pagina compare.
   */
  useEffect(() => {
    track('signup_credentials_completed', { method: 'google' });
  }, []);


  const isAthlete = role === 'athlete';
  const isProfessional = role === 'coach' || role === 'club';
  // Le soglie non si riscrivono qui: `lib/core/guardians/age.ts` dichiara di
  // esistere proprio perche' il modulo e l'azione validino sulle stesse. Se un
  // giorno il pavimento si sposta dai quindici anni, si sposta in un punto
  // solo — e questa e' l'area dove sbagliare non significa una schermata rotta.
  const age = useMemo(() => ageFromBirthDate(birthDate), [birthDate]);
  const underMin = isAthlete && age != null && !isEligibleAge(age);
  const needsGuardian = isAthlete && requiresGuardian(age);
  /**
   * L'eta', una volta sola.
   *
   * Non nell'`onChange` del campo data: quello e' l'evento nativo `input`, e
   * digitando l'anno cifra per cifra passa da valori completi e assurdi —
   * 0002, 0020, 0201 — ognuno dei quali sembra un'eta' validissima. Tre
   * `signup_age_verified` e poi un `signup_blocked_underage` per la stessa
   * persona: la metrica sui minori, che esiste per contarli, diventava
   * inservibile. Il wizard lo fa gia' cosi'.
   */
  useEffect(() => {
    if (!isAthlete || age == null) return;
    track(underMin ? 'signup_blocked_underage' : 'signup_age_verified', {
      method: 'google',
    });
  }, [isAthlete, age, underMin]);

  const canSubmit =
    Boolean(role) &&
    terms &&
    (!isProfessional || vexatious) &&
    (!isAthlete || (Boolean(birthDate) && !underMin));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-bold tracking-tight text-gray-900">
        Ci manca poco
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Sei entrato come <span className="font-medium">{email}</span>. Restano
        due cose che Google non può dirci al posto tuo.
      </p>

      <form action={formAction} className="mt-6 space-y-5">
        <input type="hidden" name="redirect" value={redirectTo ?? ''} />
        <input type="hidden" name="role" value={role} />

        {/* Il ruolo arriva dal cookie messo da parte prima di andare su
            Google. Se manca — cookie scaduto, o accesso partito dalla pagina
            di login — si chiede qui, invece di indovinare. */}
        {!presetRole && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-gray-700">
              Come vuoi usare KaiPai?
              <Req />
            </legend>
            <div className="space-y-2">
              {ROLES.map((option) => {
                const Icon = option.icon;
                const selected = role === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setRole(option.value);
                      track('signup_role_selected', {
                        role: option.value,
                        method: 'google',
                      });
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                      selected
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Icon
                      className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? 'text-red-600' : 'text-gray-400'}`}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">
                        {option.title}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {option.desc}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="name" className="text-sm text-gray-700">
              Nome
              <Req />
            </Label>
            <Input
              id="name"
              name="name"
              required
              maxLength={50}
              defaultValue={presetName}
              className={INPUT}
            />
          </div>
          <div>
            <Label htmlFor="lastName" className="text-sm text-gray-700">
              Cognome
              <Req />
            </Label>
            <Input
              id="lastName"
              name="lastName"
              required
              maxLength={50}
              defaultValue={presetLastName}
              className={INPUT}
            />
          </div>
        </div>

        {/* Solo l'atleta dichiara la data di nascita: un coach si registra in
            veste professionale. Ed è questa data che fa scattare il tutore. */}
        {isAthlete && (
          <div>
            <Label htmlFor="birthDate" className="text-sm text-gray-700">
              Data di nascita
              <Req />
            </Label>
            <Input
              id="birthDate"
              name="birthDate"
              type="date"
              required
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className={INPUT}
            />
          </div>
        )}

        {underMin && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
            <p className="font-semibold text-red-700">
              KaiPai è disponibile a partire dai {MIN_SIGNUP_AGE} anni.
            </p>
            <p className="mt-1 text-red-600">
              Al momento non è possibile creare un account. Per maggiori
              informazioni, chiedi a un genitore o tutore di contattarci.
            </p>
          </div>
        )}

        {needsGuardian && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Hai meno di 18 anni: dopo la registrazione dovrai far autorizzare
            l’account da un genitore o tutore, che potrai invitare dalla tua area
            personale.
          </p>
        )}

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => setTerms(e.target.checked)}
            className="mt-0.5 accent-red-600"
          />
          <span>
            Ho letto e accetto i{' '}
            <Link
              href="/terms"
              target="_blank"
              className="underline hover:text-gray-900"
            >
              Termini e Condizioni
            </Link>{' '}
            e l’{' '}
            <Link
              href="/privacy"
              target="_blank"
              className="underline hover:text-gray-900"
            >
              Informativa Privacy
            </Link>
            .
            <Req />
          </span>
        </label>
        <input type="hidden" name="acceptTerms" value={terms ? 'on' : ''} />
        <input type="hidden" name="acceptPrivacy" value={terms ? 'on' : ''} />

        {isProfessional && (
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              name="acceptVexatious"
              checked={vexatious}
              onChange={(e) => setVexatious(e.target.checked)}
              className="mt-0.5 accent-red-600"
            />
            <span>
              Approvo specificamente, ai sensi degli artt. 1341 e 1342 c.c., le
              clausole dei{' '}
              <Link
                href="/terms"
                target="_blank"
                className="underline hover:text-gray-900"
              >
                Termini e Condizioni
              </Link>{' '}
              relative a chiusura dell’account e cancellazione dei dati
              (art. 19), sospensione e risoluzione (art. 20), disponibilità del
              servizio (art. 21) e limitazione di responsabilità (art. 22).
              <Req />
            </span>
          </label>
        )}

        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="marketing"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
            className="mt-0.5 accent-red-600"
          />
          <span>
            Desidero ricevere novità e comunicazioni da KaiPai.{' '}
            <span className="text-gray-400">(facoltativo)</span>
          </span>
        </label>

        {state?.error && <p className="text-sm text-red-500">{state.error}</p>}

        <Button
          type="submit"
          disabled={!canSubmit || pending}
          className="w-full rounded-full bg-red-600 py-2.5 text-white hover:bg-red-700"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creazione account…
            </>
          ) : (
            'Crea il mio account'
          )}
        </Button>

        <p className="text-xs text-gray-400">
          I campi contrassegnati con <span className="text-red-600">*</span> sono
          obbligatori.
        </p>
      </form>
    </div>
  );
}
