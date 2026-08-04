'use client';

import Link from 'next/link';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, User, Users, ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { signUp } from './actions';
import type { ActionState } from '@/lib/auth/middleware';
import { track } from '@/lib/core/analytics';

const INPUT =
  'appearance-none rounded-full relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-red-500 focus:border-red-500 sm:text-sm';

/** Red asterisk marking a mandatory field. */
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

const MIN_AGE = 15;
const ADULT_AGE = 18;

/** Full-date age (not a plain year subtraction). */
function ageFrom(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STEPS = ['Ruolo', 'Credenziali', 'Dati e condizioni'];

export function SignupWizard() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const priceId = searchParams.get('priceId');
  const inviteId = searchParams.get('inviteId');
  const ref = searchParams.get('ref');

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    signUp,
    { error: '' }
  );

  const [step, setStep] = useState(0);
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Persist the referral code across the flow (same as the old form).
  useEffect(() => {
    if (!ref) return;
    document.cookie = `kp_ref=${encodeURIComponent(ref)}; path=/; max-age=${
      60 * 60 * 24 * 30
    }; SameSite=Lax`;
  }, [ref]);

  const isAthlete = role === 'athlete';
  const age = useMemo(() => ageFrom(birthDate), [birthDate]);
  const underMin = isAthlete && age != null && age < MIN_AGE;
  const needsGuardian = isAthlete && age != null && age >= MIN_AGE && age < ADULT_AGE;

  function goCredentials() {
    if (!role) return;
    track('signup_role_selected', { role });
    setLocalError(null);
    setStep(1);
  }

  function goDetails() {
    setLocalError(null);
    if (!EMAIL_RE.test(email)) {
      setLocalError('Inserisci un’email valida.');
      return;
    }
    if (password.length < 8) {
      setLocalError('La password deve avere almeno 8 caratteri.');
      return;
    }
    if (password !== confirm) {
      setLocalError('Le password non coincidono.');
      return;
    }
    track('signup_credentials_completed');
    setStep(2);
  }

  // Fire the age telemetry once we can evaluate it on the last step.
  useEffect(() => {
    if (step !== 2 || !isAthlete || age == null) return;
    track(underMin ? 'signup_blocked_underage' : 'signup_age_verified');
  }, [step, isAthlete, age, underMin]);

  // The "Registrati" button only enables once every required field is valid —
  // role, credentials, name + surname, legal consents (and, for athletes, a
  // valid non-underage birth date).
  const canSubmit =
    !!role &&
    EMAIL_RE.test(email) &&
    password.length >= 8 &&
    password === confirm &&
    !!name.trim() &&
    !!lastName.trim() &&
    terms &&
    privacy &&
    (!isAthlete || (!!birthDate && !underMin));

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Link href="/" aria-label="KaiPai — home">
            <img src="/logo.jpg" alt="KaiPai" className="h-14 w-auto rounded-xl" />
          </Link>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Crea il tuo account
        </h2>

        {/* Progress */}
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900">{STEPS[step]}</span>
            <span className="text-gray-500">Passaggio {step + 1} di 3</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full bg-red-600 transition-all"
              style={{ width: `${((step + 1) / 3) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <form action={formAction} className="space-y-6">
          <input type="hidden" name="redirect" value={redirect || ''} />
          <input type="hidden" name="priceId" value={priceId || ''} />
          <input type="hidden" name="inviteId" value={inviteId || ''} />
          <input type="hidden" name="ref" value={ref || ''} />

          {/* Step 1 — role */}
          <div hidden={step !== 0} className="space-y-3">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${
                  role === r.value
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 bg-white hover:border-green-300'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                  className="sr-only"
                />
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    role === r.value
                      ? 'bg-green-100 text-green-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <r.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-semibold text-gray-900">
                    {r.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-gray-500">
                    {r.desc}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {/* Step 2 — credentials */}
          <div hidden={step !== 1} className="space-y-4">
            <div>
              <Label htmlFor="email">
                Email
                <Req />
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={100}
                className={`mt-1 ${INPUT}`}
                placeholder="nome@esempio.it"
              />
            </div>
            <div>
              <Label htmlFor="password">
                Password
                <Req />
              </Label>
              <PasswordInput
                id="password"
                name="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                maxLength={100}
                className={`mt-1 ${INPUT}`}
                placeholder="Almeno 8 caratteri"
              />
            </div>
            <div>
              <Label htmlFor="confirm">
                Conferma password
                <Req />
              </Label>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={8}
                maxLength={100}
                className={`mt-1 ${INPUT}`}
                placeholder="Ripeti la password"
              />
            </div>
          </div>

          {/* Step 3 — birth date + legal */}
          <div hidden={step !== 2} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">
                  Nome
                  <Req />
                </Label>
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="given-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className={`mt-1 ${INPUT}`}
                  placeholder="Mario"
                />
              </div>
              <div>
                <Label htmlFor="lastName">
                  Cognome
                  <Req />
                </Label>
                <Input
                  id="lastName"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={100}
                  className={`mt-1 ${INPUT}`}
                  placeholder="Rossi"
                />
              </div>
            </div>

            {isAthlete && (
              <div>
                <Label htmlFor="birthDate">
                  Data di nascita
                  <Req />
                </Label>
                <Input
                  id="birthDate"
                  name="birthDate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className={`mt-1 ${INPUT}`}
                />
              </div>
            )}

            {underMin && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
                <p className="font-semibold text-red-700">
                  KaiPai è disponibile a partire dai 15 anni.
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
                l’account da un genitore o tutore, che potrai invitare dalla tua
                area personale.
              </p>
            )}

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="acceptTerms"
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
                className="mt-0.5 accent-red-600"
              />
              <span>
                Accetto i{' '}
                <Link href="/terms" target="_blank" className="underline hover:text-gray-900">
                  Termini e condizioni
                </Link>{' '}
                di KaiPai.
                <Req />
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="acceptPrivacy"
                checked={privacy}
                onChange={(e) => setPrivacy(e.target.checked)}
                className="mt-0.5 accent-red-600"
              />
              <span>
                Dichiaro di aver letto l’{' '}
                <Link href="/privacy" target="_blank" className="underline hover:text-gray-900">
                  Informativa privacy
                </Link>
                .
                <Req />
              </span>
            </label>
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

            <p className="pt-1 text-xs text-gray-400">
              I campi contrassegnati con <span className="text-red-600">*</span>{' '}
              sono obbligatori.
            </p>
          </div>

          {(localError || state?.error) && (
            <p className="text-sm text-red-500">{localError || state?.error}</p>
          )}

          {/* Nav */}
          <div className="flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLocalError(null);
                  setStep((s) => s - 1);
                }}
                className="rounded-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Indietro
              </Button>
            ) : (
              <span />
            )}

            {step === 0 && (
              <Button
                type="button"
                onClick={goCredentials}
                disabled={!role}
                className="rounded-full"
              >
                Continua <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {step === 1 && (
              <Button type="button" onClick={goDetails} className="rounded-full">
                Continua <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {step === 2 && (
              <Button
                type="submit"
                disabled={pending || !canSubmit}
                className="rounded-full"
              >
                {pending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Caricamento…
                  </>
                ) : (
                  'Registrati'
                )}
              </Button>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Hai già un account?{' '}
          <Link href="/sign-in" className="font-medium text-red-600 hover:text-red-700">
            Accedi
          </Link>
        </p>
      </div>
    </div>
  );
}
