'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { track } from '@/lib/core/analytics';
import { saveCoachStep, completeCoachOnboarding } from './actions';

type Taxo = { key: string; label: string };

const LEVELS: Taxo[] = [
  { key: 'amateur', label: 'Amatoriale' },
  { key: 'semi_pro', label: 'Agonistico' },
  { key: 'pro', label: 'Professionistico' },
  { key: 'youth', label: 'Settore giovanile' },
];

// Name + surname are already collected at registration, so the wizard skips the
// recap and starts at the professional profile. Everything here is optional.
const STEP_LABELS = ['Profilo professionale', 'Fatto'];
const TOTAL = STEP_LABELS.length;

export type CoachInitial = {
  name: string;
  lastName: string;
  headline: string;
  description: string;
  yearsExperience: number | null;
  languages: string[];
  categories: string[];
  specialties: string[];
  athleteLevels: string[];
};

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: Taxo[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(o.key)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              on
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function CoachWizard({
  startStep,
  sports,
  specialties,
  initial,
}: {
  startStep: number;
  sports: Taxo[];
  specialties: Taxo[];
  initial: CoachInitial;
}) {
  const [step, setStep] = useState(Math.min(Math.max(startStep, 0), TOTAL - 1));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [headline, setHeadline] = useState(initial.headline);
  const [description, setDescription] = useState(initial.description);
  const [years, setYears] = useState(
    initial.yearsExperience != null ? String(initial.yearsExperience) : ''
  );
  const [languages, setLanguages] = useState(initial.languages.join(', '));
  const [categories, setCategories] = useState<string[]>(initial.categories);
  const [specs, setSpecs] = useState<string[]>(initial.specialties);
  const [levels, setLevels] = useState<string[]>(initial.athleteLevels);

  useEffect(() => {
    track('onboarding_started', { role: 'coach', step });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function payload() {
    return {
      headline,
      description,
      yearsExperience: years.trim() ? Number(years) : null,
      languages: languages
        .split(',')
        .map((l) => l.trim())
        .filter(Boolean),
      categories,
      specialties: specs,
      athleteLevels: levels,
    };
  }

  const canPublish = useMemo(
    () =>
      !!headline.trim() &&
      !!description.trim() &&
      categories.length > 0 &&
      specs.length > 0,
    [headline, description, categories, specs]
  );

  function toggle(list: string[], set: (v: string[]) => void, key: string) {
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  }

  function next() {
    setError(null);
    const target = step + 1;
    startTransition(async () => {
      try {
        await saveCoachStep({ ...payload(), step: target });
        track('onboarding_step_completed', { role: 'coach', step });
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

  function finish(submitForReview: boolean) {
    setError(null);
    if (submitForReview) track('coach_profile_submitted');
    track('onboarding_completed', { role: 'coach' });
    startTransition(async () => {
      try {
        await completeCoachOnboarding({ ...payload(), submitForReview });
      } catch (e) {
        if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) return;
        setError('Non è stato possibile completare. Riprova.');
      }
    });
  }

  return (
    <div>
      {/* Skip — onboarding is optional; the profile can be completed later. */}
      <div className="mb-3 flex justify-end">
        {step < TOTAL - 1 && (
          <button
            type="button"
            onClick={() => finish(false)}
            disabled={pending}
            className="text-sm font-medium text-gray-900 underline-offset-2 transition-colors hover:underline disabled:opacity-50"
          >
            Salta per ora
          </button>
        )}
      </div>

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
        <section className="flex flex-col gap-5">
          <h1 className="text-xl font-semibold text-gray-900">
            Il tuo profilo professionale
          </h1>
          <p className="text-sm text-gray-500">
            Puoi completarlo ora o in seguito dalla dashboard. Serve per
            pubblicare il profilo nel marketplace.
          </p>
          <div>
            <Label htmlFor="c-headline">Titolo / headline</Label>
            <Input
              id="c-headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={140}
              className="mt-1 rounded-lg"
              placeholder="Es. Mental coach per atleti di endurance"
            />
          </div>
          <div>
            <Label htmlFor="c-bio">Biografia</Label>
            <textarea
              id="c-bio"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              placeholder="Racconta il tuo approccio e la tua esperienza."
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="c-years">Anni di esperienza</Label>
              <Input
                id="c-years"
                type="number"
                min={0}
                max={70}
                value={years}
                onChange={(e) => setYears(e.target.value)}
                className="mt-1 rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="c-lang">Lingue</Label>
              <Input
                id="c-lang"
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                className="mt-1 rounded-lg"
                placeholder="Italiano, Inglese"
              />
            </div>
          </div>
          <div>
            <Label>Sport seguiti</Label>
            <div className="mt-2">
              <Chips
                options={sports}
                selected={categories}
                onToggle={(k) => toggle(categories, setCategories, k)}
              />
            </div>
          </div>
          <div>
            <Label>Specializzazioni</Label>
            <div className="mt-2">
              <Chips
                options={specialties}
                selected={specs}
                onToggle={(k) => toggle(specs, setSpecs, k)}
              />
            </div>
          </div>
          <div>
            <Label>Tipologie di atleti</Label>
            <div className="mt-2">
              <Chips
                options={LEVELS}
                selected={levels}
                onToggle={(k) => toggle(levels, setLevels, k)}
              />
            </div>
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="flex flex-col items-center gap-4 py-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
            <Check className="h-7 w-7" />
          </span>
          <h1 className="text-2xl font-semibold text-gray-900">Ci siamo</h1>
          <p className="max-w-md text-gray-500">
            Il tuo spazio è pronto. Puoi entrare nella dashboard e, quando il
            profilo è completo (servizi, certificazioni), inviarlo per la
            verifica dell’admin. Non pubblichiamo profili incompleti.
          </p>
        </section>
      )}

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

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
            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continua <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => finish(false)}
              disabled={pending}
              className="rounded-full"
            >
              Vai alla dashboard
            </Button>
            <Button
              type="button"
              onClick={() => finish(true)}
              disabled={pending || !canPublish}
              title={
                canPublish
                  ? undefined
                  : 'Completa headline, bio, almeno uno sport e una specializzazione per inviare.'
              }
              className="rounded-full"
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Invia per la verifica
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
