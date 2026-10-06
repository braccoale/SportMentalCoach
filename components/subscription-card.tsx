'use client';

import { CalendarDays, CheckCircle2, Coins, CreditCard, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
};

type Props = {
  slug: string;
  coachFirstName: string;
  subscription: SubscriptionCardData;
  /** `abbonamenti` = si torna alla pagina dell'atleta invece che al profilo. */
  returnTo?: 'abbonamenti';
  /** Se presente, la scheda è quella della pagina dell'atleta. */
  coachName?: string;
  coachAvatarUrl?: string | null;
  profileHref?: string | null;
};

/** Annullare e riattivare: stessa logica, in qualunque scheda. */
function ManageActions({
  slug,
  subscription,
  returnTo,
  until,
}: {
  slug: string;
  subscription: SubscriptionCardData;
  returnTo?: 'abbonamenti';
  until: string;
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
      <form action={resumeSubscriptionAction}>
        {hidden}
        <Button type="submit" variant="outline" size="sm" className="rounded-full">
          Riattiva l&apos;abbonamento
        </Button>
      </form>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-sm font-medium text-gray-700 underline underline-offset-2 hover:text-gray-900"
        >
          Annulla abbonamento
        </button>
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

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof CalendarDays;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100/80 text-emerald-700">
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold text-gray-900">{value}</span>
        <span className="block text-xs text-gray-600">{label}</span>
      </span>
    </div>
  );
}

/**
 * La mini dashboard delle sedute: un segmento per seduta del piano, scuro per
 * le fatte, chiaro per le prenotate, vuoto per quelle rimaste. Sotto, i tre
 * numeri. Se il periodo non è noto non si disegna niente: meglio nessun numero
 * che un numero inventato.
 */
function UsageDashboard({ usage }: { usage: SessionUsage }) {
  if (!usage.known) return null;
  const { total, done, booked, remaining, overBooked } = usage;
  const segments = total <= 12 ? total : 0;
  const label = `Sedute di questo periodo: ${done} fatte, ${booked} prenotate, ${remaining} rimaste su ${total}.`;

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Sedute di questo periodo
      </p>
      <div role="img" aria-label={label} className="flex gap-1">
        {segments > 0 ? (
          Array.from({ length: segments }, (_, index) => (
            <span
              key={index}
              className={cn(
                'h-2.5 flex-1 rounded-full',
                index < done
                  ? 'bg-emerald-600'
                  : index < done + booked
                    ? 'bg-emerald-300'
                    : 'bg-gray-200'
              )}
            />
          ))
        ) : (
          <span className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
            <span className="bg-emerald-600" style={{ width: `${(done / total) * 100}%` }} />
            <span className="bg-emerald-300" style={{ width: `${(booked / total) * 100}%` }} />
          </span>
        )}
      </div>
      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-700">
        <span>
          <b className="text-gray-900">{done}</b> {done === 1 ? 'fatta' : 'fatte'}
        </span>
        <span>
          <b className="text-gray-900">{booked}</b>{' '}
          {booked === 1 ? 'prenotata' : 'prenotate'}
        </span>
        <span>
          <b className="text-gray-900">{remaining}</b>{' '}
          {remaining === 1 ? 'rimasta' : 'rimaste'}
        </span>
      </p>
      {overBooked && (
        <p className="mt-1 text-xs text-amber-800">
          Hai fissato più sedute di quelle incluse nel piano.
        </p>
      )}
    </div>
  );
}

/**
 * L'abbonamento dell'atleta con un coach: quando si rinnova e come annullarlo.
 * L'annullamento vale **a fine periodo**, non subito: ha già pagato fino a
 * quella data. Chiede conferma e dice che cosa succede.
 *
 * Due forme, stessa logica: la scheda piccola sul profilo del coach e la scheda
 * della pagina «Abbonamenti» dell'atleta (quando c'è `coachName`).
 */
export function SubscriptionCard({
  slug,
  coachFirstName,
  subscription,
  returnTo,
  coachName,
  coachAvatarUrl,
  profileHref,
}: Props) {
  const { cancelAtPeriodEnd, periodEndLabel } = subscription;
  const pastDue = subscription.status === 'past_due';
  const until = periodEndLabel
    ? `fino al ${periodEndLabel}`
    : 'fino alla fine del periodo già pagato';

  // ---- Scheda della pagina dell'atleta ----
  if (coachName) {
    const pill = pastDue
      ? { label: 'Pagamento da sistemare', tone: 'bg-amber-100 text-amber-800', warn: true }
      : cancelAtPeriodEnd
        ? { label: 'Annullato', tone: 'bg-amber-100 text-amber-800', warn: true }
        : { label: 'Piano attivo', tone: 'bg-emerald-100 text-emerald-800', warn: false };
    const PillIcon = pill.warn ? TriangleAlert : CheckCircle2;

    return (
      <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
        <div className="relative z-10 flex flex-col gap-3.5 md:max-w-[70%]">
          <div className="flex items-center gap-3">
            <CoachAvatar
              name={coachName}
              src={coachAvatarUrl ?? null}
              className="size-10 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                    pill.tone
                  )}
                >
                  <PillIcon className="h-3.5 w-3.5" aria-hidden />
                  {pill.label}
                </span>
                {subscription.sinceLabel && (
                  <span className="text-xs text-gray-600">
                    Sottoscritto il {subscription.sinceLabel}
                  </span>
                )}
              </div>
              <h3 className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xl font-bold tracking-tight text-gray-900">
                {subscription.planName}
                <span className="text-sm font-normal text-gray-600">
                  con {coachName}
                  {profileHref && (
                    <>
                      {' · '}
                      <a
                        href={profileHref}
                        className="underline underline-offset-2 hover:text-gray-900"
                      >
                        profilo
                      </a>
                    </>
                  )}
                </span>
              </h3>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-emerald-200/70">
            <div className="sm:pr-4">
              <Stat
                icon={CalendarDays}
                value={String(subscription.sessionsPerMonth)}
                label={
                  subscription.sessionsPerMonth === 1
                    ? 'seduta al mese'
                    : 'sedute al mese'
                }
              />
            </div>
            <div className="sm:px-4">
              <Stat icon={CreditCard} value={subscription.priceLabel} label="al mese" />
            </div>
            <div className="sm:pl-4">
              <Stat
                icon={Coins}
                value={subscription.perSessionLabel}
                label="a seduta (circa)"
              />
            </div>
          </div>

          {subscription.usage && <UsageDashboard usage={subscription.usage} />}

          {pastDue && (
            <p className="text-sm text-amber-800">
              L&apos;ultimo pagamento non è andato a buon fine: controlla il
              metodo di pagamento.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-sm text-gray-700">
              {cancelAtPeriodEnd
                ? `Annullato: resta attivo ${until} e poi non viene più addebitato nulla.`
                : periodEndLabel
                  ? `Si rinnova il ${periodEndLabel}.`
                  : 'Si rinnova ogni mese.'}
            </p>
            <ManageActions
              slug={slug}
              subscription={subscription}
              returnTo={returnTo}
              until={until}
            />
          </div>
        </div>

        {/* Decorazione: solo da schermi larghi, non toglie spazio al resto. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[30%] items-center justify-center md:flex"
        >
          <div className="absolute -right-20 top-1/2 h-[150%] w-full -translate-y-1/2 rounded-full bg-emerald-100/60" />
          <SubscriptionIllustration className="relative h-28 w-auto" />
          {!pastDue && !cancelAtPeriodEnd && (
            <span
              className="absolute right-3 top-3 -rotate-6 text-center text-xs italic leading-tight text-emerald-700"
              style={{ fontFamily: '"Segoe Script", "Bradley Hand", "Comic Sans MS", cursive' }}
            >
              Piano attivo,
              <br />
              tutto pronto!
            </span>
          )}
        </div>
      </div>
    );
  }

  // ---- Scheda piccola (profilo del coach) ----
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-5 py-4">
      <p className="text-sm font-semibold text-emerald-800">
        Hai un abbonamento con {coachFirstName}
      </p>
      <p className="mt-1 text-sm text-gray-700">
        {subscription.planName}: {subscription.sessionsPerMonth}{' '}
        {subscription.sessionsPerMonth === 1 ? 'seduta' : 'sedute'} al mese ·{' '}
        {subscription.priceLabel} al mese
      </p>

      {pastDue && (
        <p className="mt-1 text-sm text-amber-800">
          L&apos;ultimo pagamento non è andato a buon fine: controlla il metodo di
          pagamento.
        </p>
      )}

      {subscription.sinceLabel && (
        <p className="mt-1 text-sm text-gray-600">
          Sottoscritto il {subscription.sinceLabel}
        </p>
      )}
      <p className="mt-2 text-sm text-gray-700">
        {cancelAtPeriodEnd
          ? `Annullato: resta attivo ${until} e poi non viene più addebitato nulla.`
          : periodEndLabel
            ? `Si rinnova il ${periodEndLabel}.`
            : ''}
      </p>
      <div className="mt-3">
        <ManageActions
          slug={slug}
          subscription={subscription}
          returnTo={returnTo}
          until={until}
        />
      </div>
    </div>
  );
}
