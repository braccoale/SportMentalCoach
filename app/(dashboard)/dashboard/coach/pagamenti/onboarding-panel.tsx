'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadConnectAndInitialize } from '@stripe/connect-js';
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
  ConnectNotificationBanner,
} from '@stripe/react-connect-js';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CoachPaymentsState } from '@/lib/core/billing/coach-payments';
import { refreshPaymentsStatusAction } from './actions';

type Props = {
  state: Exclude<CoachPaymentsState, 'off'>;
  hasAccount: boolean;
  /** Voci mancanti già tradotte in italiano. */
  missing: string[];
  publishableKey: string | null;
};

const STEPS = [
  { key: 'prepare', label: 'Prepara i dati' },
  { key: 'verify', label: 'Verifica con Stripe' },
  { key: 'ready', label: 'Pronto a incassare' },
] as const;

function currentStep(state: Props['state'], hasAccount: boolean): number {
  if (state === 'active') return 2;
  return hasAccount ? 1 : 0;
}

const HEADLINE: Record<Props['state'], string> = {
  kyc_required: 'Completa la verifica per poter incassare',
  kyc_in_progress: 'Verifica in corso',
  restricted: 'Il tuo account Stripe è limitato',
  active: 'Puoi incassare',
};

export function OnboardingPanel({ state, hasAccount, missing, publishableKey }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isTest = publishableKey?.startsWith('pk_test_') ?? false;

  const [connect, setConnect] = useState<ReturnType<
    typeof loadConnectAndInitialize
  > | null>(null);

  const start = useCallback(() => {
    if (!publishableKey) return;
    setError(null);
    setConnect(
      loadConnectAndInitialize({
        publishableKey,
        locale: 'it-IT',
        fetchClientSecret: async () => {
          const response = await fetch('/api/coach/payments/onboarding-session', {
            method: 'POST',
          });
          const body = (await response.json().catch(() => ({}))) as {
            clientSecret?: string;
            error?: string;
          };
          if (!response.ok || !body.clientSecret) {
            setOpen(false);
            setError(
              body.error ??
                'Non è stato possibile aprire la verifica. Riprova tra poco.'
            );
            throw new Error('session');
          }
          return body.clientSecret;
        },
      })
    );
    setOpen(true);
  }, [publishableKey]);

  const finish = useCallback(async () => {
    await refreshPaymentsStatusAction();
    setOpen(false);
    router.refresh();
  }, [router]);

  const step = currentStep(state, hasAccount);
  const canVerify = state !== 'active';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {isTest && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Modalità di prova: nessun pagamento reale. Usa dati di prova, non i tuoi documenti veri.
        </p>
      )}

      <ol className="mb-4 flex flex-wrap gap-x-6 gap-y-2" aria-label="Avanzamento">
        {STEPS.map((item, index) => {
          const done = index < step || (index === 2 && state === 'active');
          const current = index === step && !done;
          return (
            <li
              key={item.key}
              className="flex items-center gap-2 text-sm"
              aria-current={current ? 'step' : undefined}
            >
              <span
                className={
                  done
                    ? 'flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white'
                    : current
                      ? 'flex h-5 w-5 items-center justify-center rounded-full border-2 border-gray-900 text-[11px] font-semibold text-gray-900'
                      : 'flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-[11px] text-gray-400'
                }
              >
                {done ? <Check className="h-3 w-3" aria-hidden /> : index + 1}
              </span>
              <span className={current ? 'font-medium text-gray-900' : 'text-gray-600'}>
                {item.label}
              </span>
            </li>
          );
        })}
      </ol>

      <h3 className="text-sm font-semibold text-gray-900">{HEADLINE[state]}</h3>

      {state === 'active' ? (
        <p className="mt-1 text-sm text-gray-600">
          La verifica è completa. Gli atleti vedono i tuoi piani attivi e possono
          acquistarli. I tuoi incassi e i bonifici li trovi qui sotto.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-600">
            I dati li raccoglie direttamente Stripe, noi non li vediamo né li
            conserviamo. Tieni a portata di mano un documento d’identità, il
            codice fiscale, il tuo indirizzo e l’IBAN del conto su cui vuoi
            ricevere i bonifici.
          </p>
          {missing.length > 0 && hasAccount && (
            <div className="mt-3">
              <p className="text-sm font-medium text-gray-900">Cosa manca ancora</p>
              <ul className="mt-1 list-disc pl-5 text-sm text-gray-600">
                {missing.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {state === 'restricted' && (
            <p className="mt-2 text-sm text-gray-600">
              Finché non è risolto gli atleti non possono acquistare. Apri la
              verifica per vedere cosa chiede Stripe.
            </p>
          )}
        </>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {canVerify && !open && (
        <div className="mt-4">
          {publishableKey ? (
            <Button type="button" onClick={start}>
              {hasAccount ? 'Continua la verifica' : 'Inizia la verifica'}
            </Button>
          ) : (
            <p className="text-sm text-gray-500">
              La verifica non è ancora disponibile: manca la configurazione di
              Stripe. Riprova più tardi.
            </p>
          )}
        </div>
      )}

      {open && connect && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <ConnectComponentsProvider connectInstance={connect}>
            <ConnectNotificationBanner />
            <ConnectAccountOnboarding onExit={finish} />
          </ConnectComponentsProvider>
        </div>
      )}

    </div>
  );
}
