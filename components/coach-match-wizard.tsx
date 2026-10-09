'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, LifeBuoy, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  MATCH_MOMENTS,
  MATCH_STYLES,
  MATCH_THEMES,
  MAX_FREE_TEXT_LENGTH,
  MAX_THEMES_SELECTED,
  type MatchAnswers,
  type MatchMomentKey,
  type MatchStyleKey,
  type MatchThemeKey,
} from '@/lib/core/coach-match/answers';
import type { MatchResult } from '@/lib/core/coach-match/match';
import { cn } from '@/lib/utils';

type Option = { key: string; label: string };
type StepId = 'profile' | 'theme' | 'text' | 'style' | 'budget';

const BUDGETS = [
  { label: 'Fino a 40 €', cents: 4000 },
  { label: 'Fino a 60 €', cents: 6000 },
  { label: 'Fino a 80 €', cents: 8000 },
  { label: 'Non importa', cents: null },
] as const;

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-full border px-4 py-2 text-left text-sm transition',
        selected
          ? 'border-green-600 bg-green-600 text-white'
          : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500'
      )}
    >
      {children}
    </button>
  );
}

const selectCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800';

export function CoachMatchWizard({
  sports,
  levels,
  known,
  askBudget,
  embedded = false,
  onClose,
}: {
  sports: Option[];
  levels: Option[];
  /** Sport e livello dal profilo dell'atleta, se c'è: quel passo si salta. */
  known: { sport: string | null; level: string | null } | null;
  askBudget: boolean;
  /** Dentro una finestra: niente link «Tutti i coach» e titoli di secondo livello. */
  embedded?: boolean;
  onClose?: () => void;
}) {
  const Heading = embedded ? 'h2' : 'h1';
  const profileKnown = !!known && (!!known.sport || !!known.level);
  const steps = useMemo<StepId[]>(() => {
    const list: StepId[] = profileKnown ? [] : ['profile'];
    list.push('theme', 'text', 'style');
    if (askBudget) list.push('budget');
    return list;
  }, [profileKnown, askBudget]);

  const [index, setIndex] = useState(0);
  const [sport, setSport] = useState<string | null>(known?.sport ?? null);
  const [level, setLevel] = useState<string | null>(known?.level ?? null);
  const [themes, setThemes] = useState<MatchThemeKey[]>([]);
  const [moments, setMoments] = useState<MatchMomentKey[]>([]);
  const [freeText, setFreeText] = useState('');
  const [styles, setStyles] = useState<MatchStyleKey[]>([]);
  const [budget, setBudget] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const canContinue = step !== 'theme' || themes.length > 0;
  const minutes = Math.max(1, Math.round(steps.length / 3));

  function toggle<T>(list: T[], value: T, max: number): T[] {
    if (list.includes(value)) return list.filter((v) => v !== value);
    return list.length >= max ? [...list.slice(1), value] : [...list, value];
  }

  async function submit() {
    setLoading(true);
    setError(null);
    const answers: Partial<MatchAnswers> = {
      sport,
      level,
      themes,
      moments,
      freeText,
      styles,
      budgetMaxCents: budget,
    };
    try {
      const res = await fetch('/api/coaches/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      });
      const data = (await res.json()) as MatchResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Qualcosa non ha funzionato.');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Qualcosa non ha funzionato.');
    } finally {
      setLoading(false);
    }
  }

  function next() {
    if (isLast) void submit();
    else setIndex((i) => i + 1);
  }

  function restart() {
    setResult(null);
    setIndex(0);
    setError(null);
  }

  if (result) {
    return (
      <Results
        result={result}
        onRestart={restart}
        sportLabel={sports.find((s) => s.key === sport)?.label ?? null}
        embedded={embedded}
        onClose={onClose}
      />
    );
  }

  return (
    <div>
      {!embedded && (
        <Link
          href="/coaches"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft className="h-4 w-4" /> Tutti i coach
        </Link>
      )}

      <div
        className={cn(
          'flex items-center gap-2 text-sm font-medium text-gray-500',
          !embedded && 'mt-4'
        )}
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        Aiutami a scegliere
      </div>

      {index === 0 && (
        <p className="mt-1 text-sm text-gray-500">
          {steps.length} domande, circa {minutes === 1 ? 'un minuto' : `${minutes} minuti`}. Puoi
          saltare quasi tutto.
        </p>
      )}

      <div
        className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={index + 1}
      >
        <div
          className="h-full rounded-full bg-green-600 transition-all"
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>

      {profileKnown && index === 0 && (
        <p className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Usiamo il tuo profilo
          {sport ? `: ${sports.find((s) => s.key === sport)?.label ?? sport}` : ''}
          {level ? `, ${levels.find((l) => l.key === level)?.label?.toLowerCase() ?? level}` : ''}.{' '}
          <Link href="/dashboard/athlete/profile" className="underline">
            Modifica
          </Link>
        </p>
      )}

      <section className="mt-6" aria-live="polite">
        {step === 'profile' && (
          <div className="space-y-4">
            <Heading className="text-2xl font-semibold tracking-tight text-gray-950">
              Prima, due cose su di te
            </Heading>
            <label className="block space-y-1.5 text-sm text-gray-700">
              Che sport pratichi?
              <select
                className={selectCls}
                value={sport ?? ''}
                onChange={(e) => setSport(e.target.value || null)}
              >
                <option value="">Preferisco non dirlo</option>
                {sports.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5 text-sm text-gray-700">
              A che livello?
              <select
                className={selectCls}
                value={level ?? ''}
                onChange={(e) => setLevel(e.target.value || null)}
              >
                <option value="">Preferisco non dirlo</option>
                {levels.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {step === 'theme' && (
          <div className="space-y-6">
            <div>
              <Heading className="text-2xl font-semibold tracking-tight text-gray-950">
                Cosa vuoi migliorare?
              </Heading>
              <p className="mt-1 text-sm text-gray-500">Scegli fino a {MAX_THEMES_SELECTED} cose.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {MATCH_THEMES.map((t) => (
                  <Chip
                    key={t.key}
                    selected={themes.includes(t.key)}
                    onClick={() => setThemes((v) => toggle(v, t.key, MAX_THEMES_SELECTED))}
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                Quando lo senti di più? <span className="font-normal text-gray-500">(facoltativo)</span>
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {MATCH_MOMENTS.map((m) => (
                  <Chip
                    key={m.key}
                    selected={moments.includes(m.key)}
                    onClick={() => setMoments((v) => toggle(v, m.key, MATCH_MOMENTS.length))}
                  >
                    {m.label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'text' && (
          <div className="space-y-3">
            <Heading className="text-2xl font-semibold tracking-tight text-gray-950">
              Raccontaci con parole tue
            </Heading>
            <p className="text-sm text-gray-500">
              Cosa ti sta succedendo e cosa vorresti che cambiasse? È facoltativo, ma è ciò che ci
              aiuta di più a trovare chi ti somiglia.
            </p>
            <textarea
              className={cn(selectCls, 'min-h-32 resize-y')}
              maxLength={MAX_FREE_TEXT_LENGTH}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="Per esempio: nei set decisivi mi irrigidisco e smetto di giocare come in allenamento…"
            />
            <p className="text-right text-xs text-gray-400">
              {freeText.length}/{MAX_FREE_TEXT_LENGTH}
            </p>
            <p className="text-xs leading-5 text-gray-500">
              Il testo serve solo a cercare i coach: non lo salviamo. Per confrontarlo con i profili
              lo inviamo, senza il tuo nome, a un servizio di intelligenza artificiale (OpenAI).
              Evita dati che non vuoi condividere.
            </p>
          </div>
        )}

        {step === 'style' && (
          <div className="space-y-3">
            <Heading className="text-2xl font-semibold tracking-tight text-gray-950">
              Che tipo di coach preferisci?
            </Heading>
            <p className="text-sm text-gray-500">Scegline fino a 2, oppure salta.</p>
            <div className="flex flex-wrap gap-2">
              {MATCH_STYLES.map((s) => (
                <Chip
                  key={s.key}
                  selected={styles.includes(s.key)}
                  onClick={() => setStyles((v) => toggle(v, s.key, 2))}
                >
                  {s.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {step === 'budget' && (
          <div className="space-y-3">
            <Heading className="text-2xl font-semibold tracking-tight text-gray-950">
              Hai un budget a seduta?
            </Heading>
            <div className="flex flex-wrap gap-2">
              {BUDGETS.map((b) => (
                <Chip key={b.label} selected={budget === b.cents} onClick={() => setBudget(b.cents)}>
                  {b.label}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={index === 0 || loading}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <ArrowLeft /> Indietro
        </Button>
        <div className="flex items-center gap-2">
          {step !== 'theme' && step !== 'profile' && (
            <Button type="button" variant="ghost" disabled={loading} onClick={next}>
              Salta
            </Button>
          )}
          <Button type="button" disabled={!canContinue || loading} onClick={next}>
            {loading ? (
              <>
                <Loader2 className="animate-spin" /> Cerco…
              </>
            ) : isLast ? (
              'Trova i miei coach'
            ) : (
              <>
                Avanti <ArrowRight />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Results({
  result,
  onRestart,
  sportLabel,
  embedded,
  onClose,
}: {
  result: MatchResult;
  onRestart: () => void;
  sportLabel: string | null;
  embedded: boolean;
  onClose?: () => void;
}) {
  const Heading = embedded ? 'h2' : 'h1';
  return (
    <div>
      <Heading className="text-2xl font-semibold tracking-tight text-gray-950">
        {result.coaches.length === 0
          ? 'Nessun coach corrisponde del tutto'
          : result.coaches.length === 1
            ? 'Il coach più adatto a te'
            : `I ${result.coaches.length} coach più adatti a te`}
      </Heading>

      {result.distress && (
        <div
          role="note"
          className="mt-4 flex gap-3 rounded-xl border border-gray-300 bg-gray-50 p-4 text-sm leading-6 text-gray-700"
        >
          <LifeBuoy className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            Da quello che hai scritto sembra un momento difficile, e viene prima di qualsiasi
            percorso sportivo. Se stai pensando di farti del male chiama il <strong>112</strong>.
            Puoi anche parlare con qualcuno al <strong>Telefono Amico: 02 2327 2327</strong>
            (per i minorenni, Telefono Azzurro: <strong>19696</strong>). Un coach non sostituisce un
            supporto psicologico.
          </p>
        </div>
      )}

      {result.sportRelaxed && (
        <p className="mt-4 text-sm text-gray-600">
          Per ora nessun coach segue {sportLabel ? `atleti di ${sportLabel}` : 'il tuo sport'}: ti
          mostriamo chi è più vicino alle altre risposte.
        </p>
      )}

      {result.status === 'not_enough' && (
        <p className="mt-4 text-sm text-gray-600">
          Servono almeno un tema o qualche parola in più per cercare. Torna indietro e scegli cosa
          vuoi migliorare.
        </p>
      )}

      {result.status === 'ok' && result.coaches.length === 0 && (
        <p className="mt-4 text-sm text-gray-600">
          Con queste risposte non abbiamo trovato un coach adatto. Prova ad allargare le scelte, o
          guarda l’elenco completo.
        </p>
      )}

      <ul className="mt-6 space-y-4">
        {result.coaches.map((c) => {
          const name = c.displayName ?? 'Coach';
          return (
            <li key={c.providerId} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
              <div className="flex gap-4">
                {c.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.avatarUrl} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xl font-semibold text-gray-400">
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-950">{name}</h2>
                  {c.headline && <p className="text-sm text-gray-600">{c.headline}</p>}
                </div>
              </div>
              {c.reasons.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm leading-6 text-gray-700">
                  {c.reasons.map((r) => (
                    <li key={r} className="flex gap-2">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400" />
                      {r}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <Button asChild>
                  <Link href={`/coaches/${c.slug}`}>Vedi il profilo e richiedi una seduta</Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" onClick={onRestart}>
          Cambia le risposte
        </Button>
        {onClose ? (
          <Button type="button" variant="ghost" onClick={onClose}>
            Vedi tutti i coach
          </Button>
        ) : (
          <Button asChild variant="ghost">
            <Link href="/coaches">Vedi tutti i coach</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
