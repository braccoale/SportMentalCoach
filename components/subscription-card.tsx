'use client';

import {
  Ban,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Percent,
  Plus,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BuySessionButton } from '@/components/buy-session-button';
import { CoachAvatar } from '@/components/coach-visuals';
import { SubscriptionIllustration } from '@/components/subscription-illustration';
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
  resumeSubscriptionAction,
} from '@/app/(marketplace)/coaches/subscription-actions';
import type { SessionUsage } from '@/lib/core/billing/session-usage';
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

/** Una barra a segmenti: uno per seduta del piano, i primi `filled` pieni. */
function SegmentBar({ total, filled }: { total: number; filled: number }) {
  if (total > 12) {
    return (
      <span className="flex h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <span
          className="bg-emerald-600"
          style={{ width: `${Math.min(100, (filled / total) * 100)}%` }}
        />
      </span>
    );
  }
  return (
    <span aria-hidden className="flex gap-1">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-2 flex-1 rounded-full',
            index < filled ? 'bg-emerald-600' : 'bg-gray-200'
          )}
        />
      ))}
    </span>
  );
}

function UsageTile({
  icon: Icon,
  value,
  label,
  caption,
  total,
  filled,
  tinted,
}: {
  icon: typeof CalendarDays;
  value: number;
  label: string;
  caption: string;
  total: number;
  filled: number;
  tinted?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        tinted
          ? 'border-emerald-100 bg-emerald-50/70'
          : 'border-gray-100 bg-white shadow-sm'
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700">
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="leading-tight">
          <span className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-gray-900">{value}</span>
            <span className="text-sm text-gray-900">{label}</span>
          </span>
          <span className="block text-xs text-gray-500">{caption}</span>
        </span>
      </div>
      <div className="mt-2">
        <SegmentBar total={total} filled={filled} />
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
            <div className="grid gap-2.5 sm:grid-cols-2">
              <UsageTile
                icon={CalendarCheck}
                value={usage.done}
                label={sessionWord(usage.done, 'seduta fatta', 'sedute fatte')}
                caption={`su ${usage.total} questo mese`}
                total={usage.total}
                filled={usage.done}
              />
              <UsageTile
                icon={CalendarDays}
                value={usage.remaining}
                label={sessionWord(usage.remaining, 'seduta rimasta', 'sedute rimaste')}
                caption={
                  usage.booked > 0
                    ? `su ${usage.total} questo mese · ${usage.booked} già ${sessionWord(usage.booked, 'prenotata', 'prenotate')}`
                    : `su ${usage.total} questo mese`
                }
                total={usage.total}
                filled={usage.remaining}
                tinted
              />
            </div>
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

          {pastDue && (
            <p className="text-xs text-amber-800">
              L&apos;ultimo pagamento non è andato a buon fine: controlla il
              metodo di pagamento.
            </p>
          )}
          {cancelAtPeriodEnd && (
            <p className="text-xs text-gray-700">
              Resta attivo {until}, poi non viene più addebitato nulla.
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
