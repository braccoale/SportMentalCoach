'use client';

import {
  Ban,
  CalendarDays,
  CreditCard,
  Percent,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BuySessionButton } from '@/components/buy-session-button';
import { CoachAvatar } from '@/components/coach-visuals';
import { SubscriptionIllustration } from '@/components/subscription-illustration';
import { ChangePlanDialog, type PlanChangeOption } from '@/components/change-plan-dialog';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  cancelSubscriptionAction,
  openPaymentMethodPortalAction,
  resumeSubscriptionAction,
} from '@/app/(marketplace)/coaches/subscription-actions';
import type { SessionUsage } from '@/lib/core/billing/session-usage';
import {
  SessionStateBar,
  SessionStateLegend,
  type SessionSegment,
} from '@/components/session-states';
import { cn } from '@/lib/utils';

export type SubscriptionCardData = {
  id: number;
  planName: string;
  sessionsPerMonth: number;
  /** Già formattato dal server: «2.000,00 €». */
  priceLabel: string;
  /** Prezzo medio a seduta, già formattato: «100,00 €». */
  perSessionLabel: string;
  status: 'active' | 'past_due';
  cancelAtPeriodEnd: boolean;
  /** Data di fine periodo già formattata, o null se Stripe non l'ha ancora data. */
  periodEndLabel: string | null;
  /** «12 marzo 2025»: il giorno in cui l'abbonamento è stato sottoscritto. */
  sinceLabel: string | null;
  /** Sedute fatte, prenotate e rimaste nel periodo; assente sulla scheda piccola. */
  usage?: SessionUsage;
  /** «Carta •••• 4242», letto da Stripe e mai salvato; assente se non si sa. */
  paymentMethodLabel?: string | null;
  /** Il prezzo di una seduta in più, già formattato; assente se il coach non la vende. */
  singleSessionPriceLabel?: string | null;
  /** Sedute acquistate a parte e ancora da usare. */
  extraSessions?: { count: number; expiryLabel: string } | null;
  /** L'abbonamento ha un cliente Stripe: si può aprire il portale per cambiare la carta. */
  canChangePaymentMethod?: boolean;
  /**
   * Cambio piano dal prossimo rinnovo: i piani tra cui scegliere (assente se
   * non si può cambiare: vedi `canOfferPlanChange`) e, se già programmato,
   * quale arriva.
   */
  planChange?: {
    options: PlanChangeOption[];
    pendingName: string | null;
  } | null;
};

type Props = {
  slug: string;
  subscription: SubscriptionCardData;
  /** `abbonamenti` = si torna alla pagina dell'atleta invece che al profilo. */
  returnTo?: 'abbonamenti';
  /** Il nome del coach: la scheda dice con chi è l'abbonamento. */
  coachName: string;
  coachAvatarUrl?: string | null;
  profileHref?: string | null;
  /**
   * Mostra «Aggiungi una sessione» nella scheda. Nel tab Abbonamenti le sedute
   * acquistate a parte hanno la loro sezione e il pulsante sta lì.
   */
  showSingleOffer?: boolean;
};

/** Annullare e riattivare: stessa logica, in qualunque scheda. */
function ManageActions({
  slug,
  subscription,
  returnTo,
  until,
  block,
}: {
  slug: string;
  subscription: SubscriptionCardData;
  returnTo?: 'abbonamenti';
  until: string;
  /** Pulsante largo (scheda della pagina dell'atleta) invece del link di testo. */
  block?: boolean;
}) {
  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      <input type="hidden" name="subscriptionId" value={subscription.id} />
    </>
  );

  if (subscription.cancelAtPeriodEnd) {
    return (
      <form action={resumeSubscriptionAction} className={block ? 'w-full' : undefined}>
        {hidden}
        <Button
          type="submit"
          variant="outline"
          className={cn('rounded-xl', block && 'h-10 w-full text-sm')}
        >
          Riattiva l&apos;abbonamento
        </Button>
      </form>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        {block ? (
          // Eccezione voluta alla regola «niente pulsanti rossi»: è l'unica
          // azione distruttiva della scheda e il disegno la vuole rossa. Resta
          // un riempimento tenue con bordo e testo rossi, non un rosso pieno;
          // la conferma che segue è neutra.
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full gap-2 rounded-xl border-red-200 bg-red-50 text-sm font-semibold text-red-700 hover:border-red-300 hover:bg-red-100 hover:text-red-800"
          >
            <Ban className="h-4 w-4" aria-hidden />
            Annulla abbonamento
          </Button>
        ) : (
          <button
            type="button"
            className="text-sm font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
          >
            Annulla abbonamento
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogTitle className="text-xl">Annullare l&apos;abbonamento?</DialogTitle>
        <DialogDescription>
          Non verrà più rinnovato né addebitato. L&apos;abbonamento resta attivo{' '}
          {until}. Se cambi idea, prima di quella data puoi riattivarlo da
          questa pagina.
        </DialogDescription>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <DialogClose asChild>
            <Button type="button" className="rounded-full">
              Mantieni l&apos;abbonamento
            </Button>
          </DialogClose>
          <form action={cancelSubscriptionAction}>
            {hidden}
            <Button type="submit" variant="outline" className="rounded-full">
              Sì, annulla
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Le sedute del piano nel periodo, per stato: quante fatte, quante già
 * pianificate (prenotate, richieste o confermate) e quante ancora da
 * pianificare. Una barra con un segmento per seduta, dello stesso colore degli
 * stati nell'elenco delle sessioni singole, e una legenda con i numeri; ogni
 * segmento e ogni voce spiegano che cosa significano al passaggio del mouse o
 * da tastiera.
 */
function PlanSessions({
  usage,
  renewalLabel,
  cancelAtPeriodEnd,
}: {
  usage: Extract<SessionUsage, { known: true }>;
  renewalLabel: string | null;
  cancelAtPeriodEnd: boolean;
}) {
  const toPlanNote = cancelAtPeriodEnd
    ? 'Ancora da prenotare. L’abbonamento non si rinnova: le sedute non prenotate si perdono alla sua fine.'
    : `Ancora da prenotare${renewalLabel ? ` entro il ${renewalLabel}` : ''}. Le sedute del piano non si riportano al rinnovo.`;
  const segments: SessionSegment[] = [
    ...Array.from({ length: usage.done }, () => ({
      kind: 'done' as const,
      tooltip: 'Seduta fatta.',
    })),
    ...Array.from({ length: usage.booked }, () => ({
      kind: 'planned' as const,
      tooltip:
        'Seduta pianificata: già prenotata (richiesta o confermata), non ancora svolta.',
    })),
    ...Array.from({ length: usage.remaining }, () => ({
      kind: 'toPlan' as const,
      tooltip: `Seduta da pianificare. ${toPlanNote}`,
    })),
  ];
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-semibold text-gray-900">
          Sedute del piano questo mese
        </p>
        <p className="text-xs text-gray-500">
          {usage.total} {plural(usage.total, 'inclusa', 'incluse')}
        </p>
      </div>
      <div className="mt-2.5">
        <SessionStateBar segments={segments} />
      </div>
      <div className="mt-3">
        <SessionStateLegend
          items={[
            {
              kind: 'done',
              count: usage.done,
              label: plural(usage.done, 'fatta', 'fatte'),
              tooltip: 'Sedute già svolte in questo periodo.',
            },
            {
              kind: 'planned',
              count: usage.booked,
              label: plural(usage.booked, 'pianificata', 'pianificate'),
              tooltip:
                'Già prenotate (richieste o confermate), non ancora svolte. Se ne annulli una, torna da pianificare.',
            },
            {
              kind: 'toPlan',
              count: usage.remaining,
              label: 'da pianificare',
              tooltip: toPlanNote,
            },
          ]}
        />
      </div>
    </div>
  );
}

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100/70 text-emerald-700">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-xs font-medium text-gray-900">{label}</span>
        <span className="block text-xs text-gray-600">{value}</span>
      </span>
    </div>
  );
}

/**
 * L'abbonamento dell'atleta con un coach: quando si rinnova e come annullarlo.
 * L'annullamento vale **a fine periodo**, non subito: ha già pagato fino a
 * quella data. Chiede conferma e dice che cosa succede.
 *
 * Una sola scheda, usata sia nella pagina «Abbonamenti» dell'atleta sia sul
 * profilo del coach: sedute fatte e rimaste, rinnovo, prossimo pagamento e
 * metodo di pagamento. Prima il profilo ne aveva una versione piccola e
 * diversa: due schede per la stessa cosa invecchiano in modo diverso.
 */
export function SubscriptionCard({
  slug,
  subscription,
  returnTo,
  coachName,
  coachAvatarUrl,
  profileHref,
  showSingleOffer = true,
}: Props) {
  const { cancelAtPeriodEnd, periodEndLabel } = subscription;
  const pastDue = subscription.status === 'past_due';
  const until = periodEndLabel
    ? `fino al ${periodEndLabel}`
    : 'fino alla fine del periodo già pagato';

  const pill = pastDue
    ? { label: 'Pagamento da sistemare', tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', warn: true }
    : cancelAtPeriodEnd
      ? { label: 'Annullato', tone: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', warn: true }
      : { label: 'Piano attivo', tone: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-600', warn: false };
  const usage = subscription.usage;
  // Aggiungere una seduta a un abbonamento che sta per finire non ha senso:
  // si compra, se serve, dopo averlo riattivato.
  const singleOffer =
    showSingleOffer && Boolean(subscription.singleSessionPriceLabel) && !cancelAtPeriodEnd;
  const sessionWord = (n: number, one: string, many: string) => (n === 1 ? one : many);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-white via-white to-emerald-50/80 p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_250px]">
        {/* Sinistra: chi, quanto, e le sedute */}
        <div className="flex min-w-0 flex-col gap-3.5">
          <div className="flex items-center gap-3">
            <CoachAvatar
              name={coachName}
              src={coachAvatarUrl ?? null}
              className="size-11 shrink-0"
            />
            <div className="min-w-0">
              <h3 className="text-lg font-bold tracking-tight text-gray-900">
                Abbonamento con{' '}
                {profileHref ? (
                  <a
                    href={profileHref}
                    className="underline-offset-4 hover:underline"
                  >
                    {coachName}
                  </a>
                ) : (
                  coachName
                )}
              </h3>
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-emerald-700">
                  {subscription.planName}
                </span>
                {' · '}
                {subscription.sessionsPerMonth}{' '}
                {sessionWord(subscription.sessionsPerMonth, 'seduta', 'sedute')} al
                mese · {subscription.priceLabel} al mese
                {subscription.sinceLabel
                  ? ` · dal ${subscription.sinceLabel}`
                  : ''}
              </p>
            </div>
          </div>

          {usage?.known && (
            <PlanSessions
              usage={usage}
              renewalLabel={periodEndLabel}
              cancelAtPeriodEnd={cancelAtPeriodEnd}
            />
          )}
          {subscription.extraSessions && (
            <p className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-gray-800">
              <Plus className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
              <span>
                <span className="font-semibold">
                  {subscription.extraSessions.count}{' '}
                  {sessionWord(
                    subscription.extraSessions.count,
                    'seduta extra',
                    'sedute extra'
                  )}
                </span>{' '}
                {sessionWord(subscription.extraSessions.count, 'valida', 'valide')}{' '}
                fino al {subscription.extraSessions.expiryLabel}: si usano dopo
                quelle del piano.
              </span>
            </p>
          )}
          {usage?.known && usage.overBooked && (
            <p className="-mt-1.5 text-xs text-amber-800">
              Hai fissato più sedute di quelle incluse nel piano.
            </p>
          )}

          <div className="grid gap-3 border-t border-emerald-100 pt-3 sm:grid-cols-3">
            <InfoItem
              icon={CalendarDays}
              label={cancelAtPeriodEnd ? 'Termina' : 'Rinnovo'}
              value={periodEndLabel ? `il ${periodEndLabel}` : '—'}
            />
            <InfoItem
              icon={CreditCard}
              label="Prossimo pagamento"
              value={cancelAtPeriodEnd ? 'Nessuno' : subscription.priceLabel}
            />
            <InfoItem
              icon={Percent}
              label="Costo a seduta"
              value={`circa ${subscription.perSessionLabel}`}
            />
          </div>
        </div>

        {/* Destra: stato, metodo di pagamento, gestione */}
        <div className="relative flex flex-col gap-3 lg:border-l lg:border-emerald-100 lg:pl-4">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-1 right-0 hidden h-16 w-20 sm:block"
          >
            <SubscriptionIllustration className="h-full w-full" />
          </div>

          <span
            className={cn(
              'inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
              pill.tone
            )}
          >
            {pill.warn ? (
              <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <span className={cn('h-2 w-2 rounded-full', pill.dot)} aria-hidden />
            )}
            {pill.label}
          </span>

          {subscription.paymentMethodLabel && (
            <InfoItem
              icon={CreditCard}
              label="Metodo di pagamento"
              value={subscription.paymentMethodLabel}
            />
          )}

          {subscription.canChangePaymentMethod && (
            <form action={openPaymentMethodPortalAction}>
              <input type="hidden" name="slug" value={slug} />
              {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
              <input type="hidden" name="subscriptionId" value={subscription.id} />
              <Button
                type="submit"
                variant="outline"
                className={cn(
                  'h-9 w-full gap-2 rounded-xl text-sm font-semibold',
                  pastDue
                    ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                    : 'border-gray-200 text-gray-700'
                )}
              >
                <CreditCard className="h-4 w-4" aria-hidden />
                {pastDue ? 'Aggiorna il metodo di pagamento' : 'Cambia metodo di pagamento'}
              </Button>
            </form>
          )}

          {/* La ricevuta è di Stripe sul conto del coach: il collegamento la
              cerca al clic, quindi funziona dal primo pagamento in poi. */}
          <a
            href={`/api/payments/receipt?tipo=abbonamento&id=${subscription.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit text-xs font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
          >
            Ricevuta dell&apos;ultimo pagamento
          </a>

          {pastDue && (
            <p className="text-xs text-amber-800">
              L&apos;ultimo pagamento non è andato a buon fine: aggiorna il metodo
              di pagamento e il sistema potrà ritentare l&apos;addebito.
            </p>
          )}
          {cancelAtPeriodEnd && (
            <p className="text-xs text-gray-700">
              Resta attivo {until}, poi non viene più addebitato nulla.
            </p>
          )}

          {subscription.planChange?.pendingName && (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-gray-700">
              {periodEndLabel ? `Dal ${periodEndLabel}` : 'Dal prossimo rinnovo'}{' '}
              passi al piano <strong>{subscription.planChange.pendingName}</strong>.
            </p>
          )}

          {singleOffer && usage?.known && usage.remaining === 0 && (
            <p className="text-xs text-gray-700">
              Hai finito le sedute di questo mese. Puoi aggiungerne una subito,
              senza aspettare il rinnovo.
            </p>
          )}

          <div className="mt-auto flex flex-col gap-2 pt-1">
            {singleOffer && (
              <BuySessionButton
                slug={slug}
                priceLabel={subscription.singleSessionPriceLabel!}
                label="Aggiungi una sessione"
                showPrice={false}
              />
            )}
            {subscription.planChange && subscription.planChange.options.length > 1 && (
              <ChangePlanDialog
                slug={slug}
                returnTo={returnTo}
                subscriptionId={subscription.id}
                options={subscription.planChange.options}
                effectiveLabel={periodEndLabel}
              />
            )}
            <ManageActions
              slug={slug}
              subscription={subscription}
              returnTo={returnTo}
              until={until}
              block
            />
          </div>
        </div>
      </div>
    </div>
  );
}
