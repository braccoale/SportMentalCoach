'use client';

import { useEffect, useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { track } from '@/lib/core/analytics';
import { formatDate } from '@/lib/core/format';
import { saveAthleteStep, completeAthleteOnboarding } from './actions';

type Sport = { key: string; label: string };

const LEVELS: { key: string; label: string }[] = [
  { key: 'amateur', label: 'Amatoriale' },
  { key: 'semi_pro', label: 'Agonistico' },
  { key: 'pro', label: 'Professionistico' },
];

const GOALS: { key: string; label: string }[] = [
  { key: 'anxiety', label: 'Gestire l’ansia' },
  { key: 'focus', label: 'Migliorare la concentrazione' },
  { key: 'motivation', label: 'Ritrovare motivazione' },
  { key: 'injury', label: 'Tornare dopo un infortunio' },
  { key: 'routine', label: 'Costruire una routine pre-gara' },
  { key: 'confidence', label: 'Aumentare la fiducia' },
  { key: 'mistakes', label: 'Gestire gli errori' },
  { key: 'other', label: 'Altro' },
];

const STEP_LABELS = ['Informazioni', 'Sport', 'Obiettivi', 'Fatto'];
const TOTAL = STEP_LABELS.length;

export type AthleteInitial = {
  name: string;
  lastName: string;
  birthDate: string | null;
  city: string;
  category: string;
  level: string;
  goals: string[];
};

export function AthleteWizard({
  startStep,
  sports,
  initial,
}: {
  startStep: number;
  sports: Sport[];
  initial: AthleteInitial;
}) {
  const [step, setStep] = useState(Math.min(Math.max(startStep, 0), TOTAL - 1));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial.name);
  const [lastName, setLastName] = useState(initial.lastName);
  const [city, setCity] = useState(initial.city);
  const [category, setCategory] = useState(initial.category);
  const [level, setLevel] = useState(initial.level);
  const [goals, setGoals] = useState<string[]>(initial.goals);

  useEffect(() => {
    track('onboarding_started', { step });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fields() {
    return { name, lastName, city, category, level, goals };
  }

  function toggleGoal(key: string) {
    setGoals((g) => (g.includes(key) ? g.filter((x) => x !== key) : [...g, key]));
  }

  function next() {
    setError(null);
    // Step 1 is the only one with required fields.
    if (step === 0 && (!name.trim() || !lastName.trim())) {
      setError('Nome e cognome sono obbligatori.');
      return;
    }
    const target = step + 1;
    startTransition(async () => {
      try {
        await saveAthleteStep({ ...fields(), step: target });
        track('onboarding_step_completed', { step });
        setStep(target);
      } catch {
        setError('Salvataggio non riuscito. Riprova.');
      }
    });
  }

  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function finish() {
    setError(null);
    track('onboarding_completed');
    startTransition(async () => {
      try {
        // Redirects server-side on success (navigation follows automatically).
        await completeAthleteOnboarding(fields());
      } catch (e) {
        // A Next redirect throws a control-flow signal — not a real error.
        if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) return;
        setError('Non è stato possibile completare. Riprova.');
      }
    });
  }

  return (
    <div>
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-900">{STEP_LABELS[step]}</span>
          <span className="text-gray-500">
            Passaggio {step + 1} di {TOTAL}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-red-600 transition-all"
            style={{ width: `${((step + 1) / TOTAL) * 100}%` }}
          />
        </div>
      </div>

      {step === 0 && (
        <section className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-gray-900">
            Le tue informazioni
          </h1>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ob-name">
                Nome <span className="text-red-600">*</span>
              </Label>
              <Input
                id="ob-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                className="mt-1 rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="ob-lastName">
                Cognome <span className="text-red-600">*</span>
              </Label>
              <Input
                id="ob-lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                maxLength={100}
                className="mt-1 rounded-lg"
              />
            </div>
          </div>
          <div>
            <Label>Data di nascita</Label>
            <p className="mt-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {initial.birthDate ? formatDate(new Date(initial.birthDate)) : '—'}
              <span className="ml-2 text-xs text-gray-400">(non modificabile)</span>
            </p>
          </div>
          <div>
            <Label htmlFor="ob-city">
              Città <span className="text-gray-400">(facoltativo)</span>
            </Label>
            <Input
              id="ob-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={120}
              className="mt-1 rounded-lg"
              placeholder="Es. Milano"
            />
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-gray-900">Il tuo sport</h1>
          <p className="text-sm text-gray-500">Facoltativo, puoi saltarlo.</p>
          <div>
            <Label htmlFor="ob-sport">Sport principale</Label>
            <select
              id="ob-sport"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Seleziona…</option>
              {sports.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="ob-level">Livello</Label>
            <select
              id="ob-level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Seleziona…</option>
              {LEVELS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-gray-900">
            Cosa vuoi migliorare?
          </h1>
          <p className="text-sm text-gray-500">
            Scegli uno o più obiettivi (facoltativo).
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GOALS.map((g) => {
              const on = goals.includes(g.key);
              return (
                <label
                  key={g.key}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
                    on
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleGoal(g.key)}
                    className="accent-red-600"
                  />
                  {g.label}
                </label>
              );
            })}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="flex flex-col items-center gap-4 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
            <Check className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-semibold text-gray-900">
            Il tuo profilo è pronto
          </h1>
          <p className="max-w-md text-gray-500">
            Ora possiamo mostrarti i mental coach più adatti alle tue esigenze.
          </p>
        </section>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between gap-3">
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={back}
            disabled={pending}
            className="rounded-full"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Indietro
          </Button>
        ) : (
          <span />
        )}

        {step < TOTAL - 1 ? (
          <Button
            type="button"
            onClick={next}
            disabled={pending}
            className="rounded-full"
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Continua <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={finish}
            disabled={pending}
            className="rounded-full"
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Trova il tuo coach <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
