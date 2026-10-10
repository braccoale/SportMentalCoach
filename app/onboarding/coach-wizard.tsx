'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { ArrowLeft, ArrowRight, Camera, Check, Clock, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RateHint } from '@/components/rate-hint';
import { PhotoForm } from '@/app/(dashboard)/dashboard/photo-form';
import { VideoUpload } from '@/app/(dashboard)/dashboard/coach/video-upload';
import { track } from '@/lib/core/analytics';
import type { RateLevel } from '@/lib/core/rate-suggestion';
import {
  AVAILABILITY_PRESETS,
  COACH_WIZARD_STEPS,
  DEFAULT_FIRST_SERVICE,
  clampWizardStep,
  WIZARD_MONTHS,
  coachSinceFromMonthYear,
  monthYearFromCoachSince,
  wizardYearOptions,
  parsePriceEuro,
  priceCentsToInput,
  type CoachWizardStepKey,
} from '@/lib/core/onboarding/coach-wizard';
import {
  applyAvailabilityPresets,
  completeCoachOnboarding,
  getCoachWizardSummary,
  saveCoachStep,
  saveWizardService,
  type CoachWizardSummary,
} from './actions';

type Taxo = { key: string; label: string };

export type CoachInitial = {
  name: string;
  lastName: string;
  headline: string;
  description: string;
  /** «Coach dal» già salvato (YYYY-MM-DD). */
  coachSince: string | null;
  languages: string[];
  categories: string[];
  specialties: string[];
  athleteLevels: string[];
  certifications: string[];
};

const HEADLINE_EXAMPLES = [
  'Mental coach per atleti di endurance',
  'Ti aiuto a gestire la pressione nelle gare decisive',
  'Psicologa dello sport per giovani agonisti',
];
const COMMON_LANGUAGES = ['Italiano', 'Inglese', 'Francese', 'Spagnolo', 'Tedesco'];
const DURATIONS = [30, 45, 60, 90];
const STORY_MIN = 300;

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

const Heading = ({ title, intro }: { title: string; intro?: string }) => (
  <div>
    <h1 className="text-2xl font-semibold tracking-tight text-gray-950">{title}</h1>
    {intro && <p className="mt-1.5 text-sm leading-6 text-gray-600">{intro}</p>}
  </div>
);

export function CoachWizard({
  startStep,
  sports,
  specialties,
  levels,
  avatarUrl,
  videoUrl,
  rateLevel,
  existingServices,
  availabilityCount,
  initialSummary = null,
  initial,
}: {
  startStep: number;
  sports: Taxo[];
  specialties: Taxo[];
  levels: Taxo[];
  avatarUrl: string | null;
  videoUrl: string | null;
  rateLevel: RateLevel | null;
  existingServices: { id: number; title: string; durationMin: number; price: number | null }[];
  availabilityCount: number;
  /** Il riepilogo già pronto, se si riprende dall'ultimo passo: niente attesa né lampeggio. */
  initialSummary?: CoachWizardSummary | null;
  initial: CoachInitial;
}) {
  const steps = COACH_WIZARD_STEPS;
  const [step, setStep] = useState(clampWizardStep(startStep));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [headline, setHeadline] = useState(initial.headline);
  const [description, setDescription] = useState(initial.description);
  const savedStart = monthYearFromCoachSince(initial.coachSince);
  const [startYear, setStartYear] = useState(savedStart ? String(savedStart.year) : '');
  const [startMonth, setStartMonth] = useState(savedStart ? String(savedStart.month) : '');
  const coachSince = coachSinceFromMonthYear(
    startYear ? Number(startYear) : null,
    startMonth ? Number(startMonth) : null
  );
  const startPartial = (startYear === '') !== (startMonth === '');
  const startInvalid = startYear !== '' && startMonth !== '' && coachSince == null;
  const [languages, setLanguages] = useState(initial.languages.join(', '));
  const [certifications, setCertifications] = useState(initial.certifications.join('\n'));
  const [categories, setCategories] = useState<string[]>(initial.categories);
  const [specs, setSpecs] = useState<string[]>(initial.specialties);
  const [athleteLevels, setAthleteLevels] = useState<string[]>(initial.athleteLevels);
  const [hasPhoto, setHasPhoto] = useState(!!avatarUrl);

  // Il servizio principale si modifica sempre qui: se ne esiste già uno, il
  // modulo parte dai suoi valori e lo aggiorna; altrimenti ne crea uno.
  const [serviceList, setServiceList] = useState(existingServices);
  const primary = serviceList[0] ?? null;
  const [svcTitle, setSvcTitle] = useState<string>(primary?.title || DEFAULT_FIRST_SERVICE.title);
  const [svcDuration, setSvcDuration] = useState<number>(primary?.durationMin || DEFAULT_FIRST_SERVICE.durationMin);
  const [svcPrice, setSvcPrice] = useState(priceCentsToInput(primary?.price));

  const [presetKeys, setPresetKeys] = useState<string[]>([]);
  const [slotsCount, setSlotsCount] = useState(availabilityCount);
  const [summary, setSummary] = useState<CoachWizardSummary | null>(initialSummary);
  // Il riepilogo letto in anticipo vale finché non si lascia l'ultimo passo.
  const [summaryFresh, setSummaryFresh] = useState(initialSummary != null);

  const key: CoachWizardStepKey = steps[step].key;

  useEffect(() => {
    track('onboarding_started', { role: 'coach', step });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Il riepilogo si legge dal server quando ci si arriva: è lui a sapere cosa manca davvero.
  useEffect(() => {
    if (key !== 'review') {
      setSummaryFresh(false);
      return;
    }
    if (summaryFresh) return;
    let cancelled = false;
    getCoachWizardSummary()
      .then((s) => !cancelled && setSummary(s))
      .catch(() => !cancelled && setError('Non riusciamo a leggere il riepilogo. Riprova.'));
    return () => {
      cancelled = true;
    };
  }, [key, summaryFresh]);

  function payload() {
    return {
      headline,
      description,
      // Gli anni li ricava il server dalla data: nessun secondo dato da tenere allineato.
      ...(coachSince ? { coachSince } : {}),
      languages: languages.split(',').map((l) => l.trim()).filter(Boolean),
      certifications: certifications.split(/\r?\n/).map((c) => c.trim()).filter(Boolean),
      categories,
      specialties: specs,
      athleteLevels,
    };
  }

  const toggle = (list: string[], set: (v: string[]) => void, k: string) =>
    set(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  /** Salva il passo e passa a `target`. `before` può bloccare (servizio, orari) con un messaggio. */
  function go(target: number, before?: () => Promise<string | null>) {
    setError(null);
    startTransition(async () => {
      try {
        const blocked = before ? await before() : null;
        if (blocked) {
          setError(blocked);
          return;
        }
        await saveCoachStep({ ...payload(), step: target });
        track('onboarding_step_completed', { role: 'coach', step });
        setStep(target);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        setError('Salvataggio non riuscito. Riprova.');
      }
    });
  }

  async function saveService(): Promise<string | null> {
    const title = svcTitle.trim();
    if (!title) return 'Dai un nome al servizio.';
    const price = parsePriceEuro(svcPrice);
    if (price === 'invalid') return 'Scrivi il prezzo in euro, per esempio 60 o 60,50.';
    const res = await saveWizardService({
      id: primary && primary.id > 0 ? primary.id : null,
      title,
      durationMin: svcDuration,
      priceEuro: price,
    });
    if (!res.ok) return res.error;
    setServiceList((list) => [res.service, ...list.slice(1)]);
    return null;
  }

  async function applyHoursIfChosen(): Promise<string | null> {
    if (presetKeys.length === 0) return null;
    const res = await applyAvailabilityPresets(presetKeys);
    if (!res.ok) return res.error;
    setSlotsCount((c) => c + res.added);
    setPresetKeys([]);
    return null;
  }

  function finish(submitForReview: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await completeCoachOnboarding({ ...payload(), submitForReview });
        // Se il server non ha reindirizzato, ha rifiutato l'invio e dice perché.
        if (result && result.ok === false) {
          setError(result.error);
          return;
        }
        if (submitForReview) track('coach_profile_submitted');
        track('onboarding_completed', { role: 'coach' });
      } catch (e) {
        if (e instanceof Error && e.message.includes('NEXT_REDIRECT')) {
          if (submitForReview) track('coach_profile_submitted');
          track('onboarding_completed', { role: 'coach' });
          return;
        }
        setError('Non è stato possibile completare. Riprova.');
      }
    });
  }

  const storyLen = description.trim().length;
  const isOptional = steps[step].optional;
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const stepNumber = step; // il Benvenuto non conta: «Chi sei» è il passo 1
  const totalNumbered = steps.length - 1;
  const parsedPrice = parsePriceEuro(svcPrice);
  const priceNumber = typeof parsedPrice === 'number' ? parsedPrice : 0;
  const durationChoices = Array.from(new Set([...DURATIONS, svcDuration])).sort((x, y) => x - y);

  const blockersJump: Record<string, number> = useMemo(
    () => ({
      'Profilo base': steps.findIndex((s) => s.key === 'story'),
      'Foto del profilo': steps.findIndex((s) => s.key === 'who'),
      'Sport e specializzazioni': steps.findIndex((s) => s.key === 'what'),
      Servizi: steps.findIndex((s) => s.key === 'service'),
    }),
    [steps]
  );

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={() => finish(false)}
          disabled={pending}
          className="text-sm text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-50"
        >
          Esci e continua dalla dashboard
        </button>
      </div>

      {!isFirst && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-900">{steps[step].label}</span>
            <span className="text-gray-500">
              Passo {stepNumber} di {totalNumbered}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={totalNumbered}
            aria-valuenow={stepNumber}
          >
            <div
              className="h-full rounded-full bg-green-600 transition-all motion-reduce:transition-none"
              style={{ width: `${(stepNumber / totalNumbered) * 100}%` }}
            />
          </div>
        </div>
      )}

      {key === 'welcome' && (
        <section className="flex flex-col gap-5">
          <Heading
            title={`Benvenuto${initial.name ? `, ${initial.name}` : ''}`}
            intro="Ti guidiamo a costruire il tuo profilo in circa 10 minuti. Si salva a ogni passo: puoi fermarti e riprendere quando vuoi."
          />
          <ol className="flex flex-col gap-2 text-sm text-gray-700">
            {steps.slice(1, -1).map((s, i) => (
              <li key={s.key} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-50 text-xs font-semibold text-green-700">
                  {i + 1}
                </span>
                {s.label}
                {s.optional && <span className="ml-auto text-xs text-gray-400">facoltativo</span>}
              </li>
            ))}
          </ol>
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Per inviare il profilo servono: <strong>foto, frase di presentazione, descrizione, sport, specializzazioni e un
            servizio</strong>. Dopo l’invio un admin lo controlla e ti avvisiamo per email quando è online.
          </p>
        </section>
      )}

      {key === 'who' && (
        <section className="flex flex-col gap-6">
          <Heading
            title="Chi sei"
            intro="La foto è la prima cosa che un atleta guarda. Scegline una del tuo volto, ben illuminata e riconoscibile."
          />
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <PhotoForm
              bare
              name={[initial.name, initial.lastName].filter(Boolean).join(' ') || null}
              avatarUrl={avatarUrl}
              onChange={(url) => setHasPhoto(!!url)}
            />
            <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
              <Camera className="h-3.5 w-3.5" aria-hidden />
              {hasPhoto
                ? 'Foto caricata. Puoi cambiarla quando vuoi.'
                : 'Serve una foto per inviare il profilo. Da telefono puoi scattarla subito.'}
            </p>
          </div>
          <div>
            <Label htmlFor="c-headline">Frase di presentazione</Label>
            <Input
              id="c-headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              maxLength={140}
              className="mt-1 rounded-lg"
              placeholder="Es. Mental coach per atleti di endurance"
            />
            <p className="mt-1 text-xs text-gray-500">
              Compare sotto il tuo nome nell’elenco dei coach. Una frase sola, concreta (almeno 15 caratteri).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {HEADLINE_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setHeadline(ex)}
                  className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {key === 'what' && (
        <section className="flex flex-col gap-6">
          <Heading
            title="Cosa fai"
            intro="Gli atleti ti trovano filtrando per sport, tema e livello: se un campo è vuoto, non compari in quei risultati."
          />
          <div>
            <Label>Sport che segui</Label>
            <div className="mt-2">
              <Chips options={sports} selected={categories} onToggle={(k) => toggle(categories, setCategories, k)} />
            </div>
          </div>
          <div>
            <Label>Su cosa lavori (almeno una)</Label>
            <div className="mt-2">
              <Chips options={specialties} selected={specs} onToggle={(k) => toggle(specs, setSpecs, k)} />
            </div>
          </div>
          <div>
            <Label>Con quali atleti</Label>
            <div className="mt-2">
              <Chips options={levels} selected={athleteLevels} onToggle={(k) => toggle(athleteLevels, setAthleteLevels, k)} />
            </div>
          </div>
        </section>
      )}

      {key === 'story' && (
        <section className="flex flex-col gap-4">
          <Heading
            title="Raccontati"
            intro="È il testo che si legge prima di chiedere una sessione: più è chiaro, meno domande restano all’atleta."
          />
          <ul className="list-disc space-y-1 pl-5 text-sm text-gray-600">
            <li>Con chi lavori e su quali difficoltà?</li>
            <li>Come lavori: che metodo, che percorso?</li>
            <li>Che risultato può aspettarsi l’atleta?</li>
          </ul>
          <div>
            <Label htmlFor="c-bio">Descrizione</Label>
            <textarea
              id="c-bio"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={9}
              maxLength={4000}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              placeholder="Racconta il tuo approccio e la tua esperienza."
            />
            <p className={`mt-1 text-xs ${storyLen >= STORY_MIN ? 'text-green-700' : 'text-gray-500'}`}>
              {storyLen} caratteri
              {storyLen < STORY_MIN ? ` · ne bastano ${STORY_MIN} per un testo che convince` : ' · ottimo'}
            </p>
          </div>
        </section>
      )}

      {key === 'experience' && (
        <section className="flex flex-col gap-5">
          <Heading title="La tua esperienza" intro="Facoltativo, ma dà fiducia. Scrivi solo ciò che puoi dimostrare." />
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset>
              <legend className="text-sm font-medium leading-none">Da quando fai il coach</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <select
                  aria-label="Mese di inizio"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900"
                >
                  <option value="">Mese</option>
                  {WIZARD_MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Anno di inizio"
                  value={startYear}
                  onChange={(e) => setStartYear(e.target.value)}
                  className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900"
                >
                  <option value="">Anno</option>
                  {wizardYearOptions().map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <p className={`mt-1 text-xs ${startPartial || startInvalid ? 'text-amber-700' : 'text-gray-500'}`}>
                {startInvalid
                  ? 'Questo mese è nel futuro: scegli quando hai cominciato davvero.'
                  : startPartial
                    ? 'Scegli sia il mese sia l’anno, oppure lascia vuoto.'
                    : 'Mese e anno in cui hai iniziato: se sei all’inizio, quello di quest’anno.'}
              </p>
            </fieldset>
            <div>
              <Label htmlFor="c-lang">Lingue in cui lavori</Label>
              <Input
                id="c-lang"
                value={languages}
                onChange={(e) => setLanguages(e.target.value)}
                className="mt-1 rounded-lg"
                placeholder="Italiano, Inglese"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {COMMON_LANGUAGES.map((l) => {
                  const list = languages.split(',').map((x) => x.trim()).filter(Boolean);
                  const on = list.includes(l);
                  return (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setLanguages((on ? list.filter((x) => x !== l) : [...list, l]).join(', '))}
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        on ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="c-certs">Titoli e certificazioni</Label>
            <textarea
              id="c-certs"
              value={certifications}
              onChange={(e) => setCertifications(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              placeholder={'Albo Psicologi\nMental Coach certificato'}
            />
            <p className="mt-1 text-xs text-gray-500">Uno per riga. Li verifica il team KaiPai: quelli verificati contano di più.</p>
          </div>
        </section>
      )}

      {key === 'service' && (
        <section className="flex flex-col gap-5">
          <Heading
            title="Il tuo servizio"
            intro={
              primary
                ? 'Hai già questo servizio: controllalo e, se vuoi, modificalo. Gli altri e i prezzi si cambiano dalla dashboard.'
                : 'Il tipo di sessione che offri. Potrai aggiungerne altri e cambiare i prezzi dalla dashboard.'
            }
          />
          <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4">
            <div>
              <Label htmlFor="s-title">Nome del servizio</Label>
              <Input id="s-title" value={svcTitle} onChange={(e) => setSvcTitle(e.target.value)} maxLength={160} className="mt-1 rounded-lg" />
            </div>
            <div>
              <Label>Durata</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {durationChoices.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={svcDuration === d}
                    onClick={() => setSvcDuration(d)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${
                      svcDuration === d ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {d} min
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="s-price">Prezzo (euro)</Label>
              <Input
                id="s-price"
                inputMode="decimal"
                value={svcPrice}
                onChange={(e) => setSvcPrice(e.target.value)}
                aria-invalid={parsedPrice === 'invalid'}
                className="mt-1 max-w-[10rem] rounded-lg"
                placeholder="Es. 60"
              />
              {parsedPrice === 'invalid' && (
                <p className="mt-1 text-xs text-red-600">Scrivi il prezzo in euro, per esempio 60 o 60,50.</p>
              )}
              <RateHint
                level={rateLevel}
                durationMin={svcDuration}
                price={priceNumber}
                disabled={pending}
                onUse={(euros) => setSvcPrice(String(euros))}
              />
            </div>
          </div>
          {serviceList.length > 1 && (
            <div>
              <p className="text-sm font-medium text-gray-900">Gli altri tuoi servizi</p>
              <ul className="mt-2 flex flex-col gap-2">
                {serviceList.slice(1).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm">
                    <span className="font-medium text-gray-900">{s.title}</span>
                    <span className="text-gray-600">
                      {s.durationMin} min
                      {s.price != null ? ` · ${(s.price / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-gray-500">Gli altri servizi restano come sono: da qui non si modificano.</p>
            </div>
          )}
        </section>
      )}

      {key === 'hours' && (
        <section className="flex flex-col gap-5">
          <Heading
            title="Quando ricevi"
            intro="Scegli una o più fasce tipiche: le potrai cambiare, o disegnare la tua settimana, dalla pagina Disponibilità."
          />
          {slotsCount > 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-800">
              <Check className="h-4 w-4" aria-hidden /> Hai già {slotsCount} {slotsCount === 1 ? 'fascia' : 'fasce'} di orario.
            </p>
          )}
          <div className="flex flex-col gap-2">
            {AVAILABILITY_PRESETS.map((p) => {
              const on = presetKeys.includes(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(presetKeys, setPresetKeys, p.key)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                    on ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <Clock className={`h-5 w-5 ${on ? 'text-green-600' : 'text-gray-400'}`} aria-hidden />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">{p.label}</span>
                    <span className="block text-xs text-gray-500">{p.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {key === 'video' && (
        <section className="flex flex-col gap-4">
          <Heading
            title="Un video di presentazione"
            intro="Facoltativo, ma fa sentire la tua voce prima della sessione e aiuta molto a essere scelti. Puoi farlo anche dopo."
          />
          <VideoUpload videoUrl={videoUrl} />
        </section>
      )}

      {key === 'review' && (
        <section className="flex flex-col gap-5">
          <Heading title="Ci siamo" intro="Ecco come ti vedranno gli atleti e cosa serve per inviare il profilo." />
          {!summary ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparo il riepilogo…
            </p>
          ) : (
            <>
              <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-4">
                {summary.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={summary.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl font-semibold text-gray-400">
                    {summary.name.charAt(0).toUpperCase() || '?'}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold text-gray-950">{summary.name || 'Il tuo nome'}</p>
                  <p className="text-sm text-gray-600">{summary.headline || 'Manca la frase di presentazione'}</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-2xl font-bold tabular-nums text-gray-950">{summary.score}%</p>
                  <p className="text-xs text-gray-500">{summary.levelLabel}</p>
                </div>
              </div>

              {summary.blockers.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-900">Per inviare il profilo manca ancora:</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {summary.blockers.map((b) => (
                      <li key={b} className="flex items-center justify-between gap-3 text-sm text-amber-900">
                        {b}
                        {blockersJump[b] != null && blockersJump[b] >= 0 && (
                          <button
                            type="button"
                            onClick={() => go(blockersJump[b])}
                            disabled={pending}
                            className="shrink-0 font-medium underline underline-offset-2"
                          >
                            Sistema
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="flex items-start gap-2 rounded-xl bg-green-50 p-4 text-sm text-green-900">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  Il profilo è pronto per essere inviato. Un admin lo controlla e ti avvisiamo per email quando è online.
                </p>
              )}

              {summary.suggestions.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-900">Per farti trovare di più, più avanti:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-600">
                    {summary.suggestions.slice(0, 3).map((s) => (
                      <li key={s.key}>{s.label}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        {!isFirst ? (
          <Button type="button" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={pending} className="rounded-full">
            <ArrowLeft className="mr-2 h-4 w-4" /> Indietro
          </Button>
        ) : (
          <span />
        )}

        {!isLast ? (
          <div className="flex items-center gap-3">
            {isOptional && !isFirst && (
              <button
                type="button"
                onClick={() => go(step + 1)}
                disabled={pending}
                className="text-sm text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-50"
              >
                Salta questo passo
              </button>
            )}
            <Button
              type="button"
              onClick={() =>
                go(
                  step + 1,
                  key === 'service' ? saveService : key === 'hours' ? applyHoursIfChosen : undefined
                )
              }
              disabled={pending}
              className="rounded-full"
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isFirst ? 'Cominciamo' : 'Continua'} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => finish(false)} disabled={pending} className="rounded-full">
              Vai alla dashboard
            </Button>
            <Button
              type="button"
              onClick={() => finish(true)}
              disabled={pending || !summary?.canSubmit}
              title={summary && !summary.canSubmit ? 'Completa ciò che manca per poter inviare.' : undefined}
              className="rounded-full"
            >
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Invia per la revisione
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
