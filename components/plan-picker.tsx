'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  ArrowRight,
  Ban,
  CalendarCheck,
  CalendarDays,
  CalendarMinus,
  CalendarX,
  CreditCard,
  Lock,
  Receipt,
  RefreshCw,
  Repeat,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  defaultSelectedPlanId,
  formatEuroCents,
  perSessionCents,
  planAccentForPosition,
  type PlanAccent,
} from '@/lib/core/billing/session-plan';
import {
  PLAN_TERMS,
  singleSessionTerms,
  UNDEFINED_TERM_LABEL,
  type PlanTerm,
  type PlanTermKey,
} from '@/lib/core/billing/plan-terms';
import { formatValidityDays } from '@/lib/core/billing/single-session';
import {
  buySingleSessionAction,
  startPlanCheckoutAction,
} from '@/app/(marketplace)/coaches/subscribe-actions';

export type PickerPlan = {
  id: number;
  name: string;
  description: string | null;
  isRecommended: boolean;
  sessionsPerMonth: number;
  monthlyPriceCents: number;
};

// Classi scritte per esteso: Tailwind non vede quelle composte a runtime.
const ACCENT: Record<PlanAccent, { name: string; icon: string }> = {
  blue: { name: 'text-blue-600', icon: 'bg-blue-50 text-blue-600' },
  emerald: { name: 'text-emerald-600', icon: 'bg-emerald-50 text-emerald-600' },
  violet: { name: 'text-violet-600', icon: 'bg-violet-50 text-violet-600' },
  orange: { name: 'text-orange-600', icon: 'bg-orange-50 text-orange-600' },
};

const TERM_ICON: Record<PlanTermKey, LucideIcon> = {
  pagamento: CreditCard,
  rinnovo: RefreshCw,
  annullamento: Ban,
  utilizzo_sedute: CalendarCheck,
  sedute_residue: CalendarX,
  disdetta_seduta: CalendarMinus,
  cambio_piano: Repeat,
  cambio_coach: Users,
  rimborsi_recesso: Receipt,
};

function SubscribeButton({
  label,
  className,
  withArrow,
}: {
  label: string;
  className?: string;
  withArrow?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className={className} disabled={pending}>
      {pending ? 'Ti porto al pagamento…' : label}
      {!pending && withArrow && <ArrowRight className="ml-1 h-5 w-5" aria-hidden />}
    </Button>
  );
}

/**
 * Le condizioni del piano, voce per voce. Una voce non ancora decisa o
 * costruita dice «Da definire»: mai una promessa che il prodotto non mantiene.
 */
function TermsList({
  tinted,
  terms = PLAN_TERMS,
}: {
  tinted?: boolean;
  terms?: readonly PlanTerm[];
}) {
  return (
    <ul className="flex flex-col gap-3">
      {terms.map((term) => {
        const Icon = TERM_ICON[term.key];
        const defined = term.text !== null;
        return (
          <li key={term.key} className="flex items-start gap-3">
            <span
              className={cn(
                'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-700',
                defined
                  ? 'border border-gray-200 bg-white shadow-sm'
                  : tinted
                    ? 'bg-emerald-100/70'
                    : 'bg-gray-100'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 text-sm leading-snug">
              <span className="font-semibold text-gray-900">{term.title}</span>
              <span
                className={cn(
                  'block',
                  defined ? 'text-gray-600' : 'italic text-gray-500'
                )}
              >
                {term.text ?? UNDEFINED_TERM_LABEL}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * La scelta del percorso mensile. La selezione è un gruppo di radio nativi:
 * funziona con la tastiera e con gli screen reader. Al server arriva **solo
 * l'id del piano**: nome, prezzo e sedute si rileggono lì dal database.
 *
 * Due presentazioni, stesse righe, stessa scelta e stesso pagamento:
 *  - `page`: sul profilo, con le condizioni che si aprono sotto il piano;
 *  - `dialog`: nella finestra dalla scheda, righe un po' più compatte e, a
 *    destra, il pannello verde che spiega il piano scelto.
 *
 * Le righe si adattano alla larghezza del loro contenitore (non dello
 * schermo): nella finestra la colonna è stretta anche su un monitor largo.
 */
export function PlanPicker({
  plans,
  slug,
  coachFirstName,
  variant = 'page',
  single,
}: {
  plans: PickerPlan[];
  slug: string;
  coachFirstName: string;
  variant?: 'page' | 'dialog';
  /** Il prezzo di una seduta singola, già formattato; assente = non si vende. */
  single?: { priceLabel: string; validityDays: number } | null;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(
    defaultSelectedPlanId(plans)
  );
  // Le condizioni sotto il piano (solo sul profilo) si aprono alla scelta e si
  // chiudono ripremendo il piano già scelto. Serve uno stato a parte: un radio
  // già selezionato non emette nessun evento di cambio.
  const [detailsOpen, setDetailsOpen] = useState(true);
  // «Una sola seduta» è una scelta a parte: non è un piano e non si rinnova.
  const [singleSelected, setSingleSelected] = useState(false);
  const selected = plans.find((plan) => plan.id === selectedId) ?? plans[0];
  const dialog = variant === 'dialog';

  function choose(planId: number) {
    if (!singleSelected && planId === selected.id) {
      setDetailsOpen((open) => !open);
    } else {
      setSingleSelected(false);
      setSelectedId(planId);
      setDetailsOpen(true);
    }
  }
  function chooseSingle() {
    if (singleSelected) {
      setDetailsOpen((open) => !open);
    } else {
      setSingleSelected(true);
      setDetailsOpen(true);
    }
  }
  const selectedPerSession = formatEuroCents(
    perSessionCents(selected.monthlyPriceCents, selected.sessionsPerMonth)
  );

  const rows = plans.map((plan, index) => {
    const accent = ACCENT[planAccentForPosition(index)];
    const isSelected = !singleSelected && plan.id === selected.id;
    const perSession = formatEuroCents(
      perSessionCents(plan.monthlyPriceCents, plan.sessionsPerMonth)
    );

    return (
      <li key={plan.id} className="@container">
        <label
          className={cn(
            // Sotto 38rem di larghezza la riga è su due righe (nome e pallino,
            // poi sedute e prezzo); sopra, su una sola, a quattro colonne.
            'grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 rounded-2xl border transition-colors focus-within:ring-2 focus-within:ring-emerald-600 focus-within:ring-offset-2 @[38rem]:grid-cols-[1.15fr_0.85fr_1fr_auto] @[38rem]:gap-x-4',
            dialog ? 'px-3.5 py-2.5' : 'px-4 py-3 @[38rem]:px-5 @[38rem]:py-4',
            isSelected
              ? 'border-emerald-500 bg-emerald-50/60'
              : dialog
                ? 'border-gray-200 bg-white hover:border-gray-300'
                : 'border-gray-200 bg-gray-50/70 hover:border-gray-300 hover:bg-white'
          )}
        >
          <input
            type="radio"
            name="planId"
            value={plan.id}
            checked={isSelected}
            // Il clic (non il cambio) decide: vale anche per il piano già
            // scelto, e la tastiera con le frecce genera lo stesso clic.
            onClick={() => choose(plan.id)}
            onChange={() => undefined}
            className="sr-only"
          />

          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span
                className={cn(
                  'font-semibold',
                  dialog ? 'text-base' : 'text-lg @[38rem]:text-xl',
                  isSelected ? 'text-emerald-600' : accent.name
                )}
              >
                {plan.name}
              </span>
              {plan.isRecommended && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  Consigliato
                </span>
              )}
            </span>
            {plan.description && (
              <span className="mt-0.5 block text-xs text-gray-600 @[38rem]:text-sm">
                {plan.description}
              </span>
            )}
          </span>

          <span
            aria-hidden
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 @[38rem]:col-start-4 @[38rem]:row-start-1 @[38rem]:h-6 @[38rem]:w-6',
              isSelected ? 'border-emerald-600' : 'border-gray-300'
            )}
          >
            {isSelected && (
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 @[38rem]:h-3 @[38rem]:w-3" />
            )}
          </span>

          {/* Sedute e prezzo: in stretto stanno insieme sulla seconda riga; in
              largo il contenitore sparisce (`contents`) e i due blocchi
              diventano colonne della riga. Nessuna parte va a capo da sola. */}
          <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 @[38rem]:contents">
            <span className="flex items-center gap-2 whitespace-nowrap @[38rem]:col-start-2 @[38rem]:row-start-1 @[38rem]:gap-3">
              <span
                className={cn(
                  'flex shrink-0 items-center justify-center rounded-lg',
                  dialog ? 'h-7 w-7 @[38rem]:h-9 @[38rem]:w-9' : 'h-8 w-8 @[38rem]:h-11 @[38rem]:w-11',
                  isSelected ? 'bg-emerald-100 text-emerald-600' : accent.icon
                )}
              >
                <CalendarDays className="h-4 w-4 @[38rem]:h-5 @[38rem]:w-5" aria-hidden />
              </span>
              <span className="flex items-baseline gap-1 leading-tight @[38rem]:block">
                <span
                  className={cn(
                    'font-bold text-gray-900',
                    dialog ? 'text-base @[38rem]:text-lg' : 'text-base @[38rem]:text-2xl'
                  )}
                >
                  {plan.sessionsPerMonth}
                </span>
                <span className="text-xs text-gray-600 @[38rem]:block @[38rem]:text-sm">
                  {plan.sessionsPerMonth === 1 ? 'seduta' : 'sedute'} al mese
                </span>
              </span>
            </span>

            <span className="flex flex-wrap items-baseline gap-x-2 whitespace-nowrap border-gray-200 @[38rem]:col-start-3 @[38rem]:row-start-1 @[38rem]:block @[38rem]:border-l @[38rem]:pl-4">
              <span
                className={cn(
                  'font-bold text-gray-900',
                  dialog ? 'text-base @[38rem]:text-lg' : 'text-base @[38rem]:text-2xl'
                )}
              >
                {formatEuroCents(plan.monthlyPriceCents)}
                <span className="ml-1 text-xs font-normal text-gray-500">/ mese</span>
              </span>
              <span className="block text-xs text-gray-600 @[38rem]:text-sm">
                circa {perSession} a seduta
              </span>
            </span>
          </span>
        </label>

        {/* Sul profilo le condizioni si aprono sotto il piano scelto. */}
        {!dialog && isSelected && detailsOpen && (
          <div className="mt-2 rounded-2xl border border-emerald-100 bg-white px-5 py-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-900">
              Condizioni di {plan.name}
            </h3>
            <TermsList />
          </div>
        )}
      </li>
    );
  });

  const singleRow = single ? (
    <li key="single" className="@container">
      <label
        className={cn(
          'flex cursor-pointer items-center justify-between gap-3 rounded-2xl border transition-colors focus-within:ring-2 focus-within:ring-emerald-600 focus-within:ring-offset-2',
          dialog ? 'px-3.5 py-2.5' : 'px-4 py-3 @[38rem]:px-5 @[38rem]:py-4',
          singleSelected
            ? 'border-emerald-500 bg-emerald-50/60'
            : 'border-dashed border-gray-300 bg-white hover:border-gray-400'
        )}
      >
        <input
          type="radio"
          name="planId"
          value="single"
          checked={singleSelected}
          onClick={chooseSingle}
          onChange={() => undefined}
          className="sr-only"
        />
        <span className="min-w-0">
          <span
            className={cn(
              'block font-semibold',
              dialog ? 'text-base' : 'text-lg',
              singleSelected ? 'text-emerald-600' : 'text-gray-900'
            )}
          >
            Una sola seduta
          </span>
          <span className="block text-xs text-gray-600">
            Senza abbonamento · valida {formatValidityDays(single.validityDays)}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-right leading-tight">
            <span className="block text-base font-bold text-gray-900">
              {single.priceLabel}
            </span>
            <span className="block text-xs text-gray-500">una tantum</span>
          </span>
          <span
            aria-hidden
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
              singleSelected ? 'border-emerald-600' : 'border-gray-300'
            )}
          >
            {singleSelected && <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />}
          </span>
        </span>
      </label>
      {!dialog && singleSelected && detailsOpen && (
        <div className="mt-2 rounded-2xl border border-emerald-100 bg-white px-5 py-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Condizioni della seduta singola
          </h3>
          <TermsList terms={singleSessionTerms(single.validityDays)} />
        </div>
      )}
    </li>
  ) : null;

  const allRows = [...rows, singleRow];
  const submitAction = singleSelected ? buySingleSessionAction : startPlanCheckoutAction;
  const submitLabel = singleSelected
    ? `Compra una seduta · ${single?.priceLabel ?? ''}`
    : null;

  const payNote = (
    <p className="flex items-center gap-2 text-sm text-gray-500">
      <Lock className="h-4 w-4 shrink-0" aria-hidden />
      Il pagamento avviene su Stripe, con carta. L&apos;importo va direttamente a{' '}
      {coachFirstName}.
    </p>
  );

  if (dialog) {
    return (
      <form action={submitAction} className="mt-5">
        <input type="hidden" name="slug" value={slug} />
        <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <div className="flex min-w-0 flex-col gap-4">
            <fieldset>
              <legend className="sr-only">Scegli il tuo percorso mensile</legend>
              <ul className="flex flex-col gap-2.5">{allRows}</ul>
            </fieldset>
            <SubscribeButton
              label={submitLabel ?? 'Vai al pagamento'}
              withArrow
              className="h-12 w-full rounded-xl text-base"
            />
            {payNote}
          </div>

          {singleSelected && single ? (
            <aside
              aria-label="La tua seduta singola"
              className="rounded-2xl bg-emerald-50/70 p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                La tua seduta singola
              </p>
              <h3 className="mt-2 text-2xl font-bold text-gray-900">Una sola seduta</h3>
              <p className="mt-1 text-sm text-gray-700">
                1 seduta con {coachFirstName} a {single.priceLabel}, senza
                abbonamento
              </p>
              <div className="mt-4 border-t border-emerald-100 pt-4">
                <TermsList tinted terms={singleSessionTerms(single.validityDays)} />
              </div>
            </aside>
          ) : (
          <aside
            aria-label="Il tuo piano di abbonamento"
            className="rounded-2xl bg-emerald-50/70 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Il tuo piano di abbonamento
                </p>
                <h3 className="mt-2 text-2xl font-bold text-gray-900">
                  {selected.name}
                </h3>
                <p className="mt-1 text-sm text-gray-700">
                  {selected.sessionsPerMonth}{' '}
                  {selected.sessionsPerMonth === 1 ? 'seduta' : 'sedute'} al mese a{' '}
                  {formatEuroCents(selected.monthlyPriceCents)} al mese
                </p>
                <p className="text-sm text-gray-500">
                  (circa {selectedPerSession} a seduta)
                </p>
              </div>
              <div className="shrink-0 rounded-xl bg-emerald-100/80 px-4 py-2.5 text-center text-emerald-700">
                <CalendarDays className="mx-auto h-5 w-5" aria-hidden />
                <span className="mt-0.5 block text-2xl font-bold leading-none">
                  {selected.sessionsPerMonth}
                </span>
                <span className="block text-sm font-semibold">
                  {selected.sessionsPerMonth === 1 ? 'seduta' : 'sedute'}
                </span>
                <span className="block text-[11px]">al mese</span>
              </div>
            </div>
            <div className="mt-4 border-t border-emerald-100 pt-4">
              <TermsList tinted />
            </div>
          </aside>
          )}
        </div>
      </form>
    );
  }

  return (
    <form action={submitAction} className="mt-4">
      <input type="hidden" name="slug" value={slug} />
      <fieldset>
        <legend className="sr-only">Scegli il tuo percorso mensile</legend>
        <ul className="flex flex-col gap-3">{allRows}</ul>
      </fieldset>

      <div className="mt-4 flex flex-col items-start gap-2">
        <SubscribeButton
          label={submitLabel ?? `Abbonati a ${selected.name}`}
          className="w-full rounded-full sm:w-auto"
        />
        {payNote}
      </div>
    </form>
  );
}
