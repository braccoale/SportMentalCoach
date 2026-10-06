'use client';

import { useMemo, useState } from 'react';
import { loadConnectAndInitialize } from '@stripe/connect-js';
import {
  ConnectAccountManagement,
  ConnectBalances,
  ConnectComponentsProvider,
  ConnectNotificationBanner,
  ConnectPayments,
  ConnectPayouts,
} from '@stripe/react-connect-js';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'payments', label: 'Pagamenti ricevuti' },
  { key: 'payouts', label: 'Bonifici e saldo' },
  { key: 'account', label: 'Il tuo conto' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/**
 * Gli incassi del coach dentro KaiPai: i componenti incorporati di Stripe al
 * posto di una dashboard esterna. Il segreto di sessione lo rilascia solo la
 * rotta `dashboard-session`, a un coach con la verifica completata.
 */
export function EarningsPanel({ publishableKey }: { publishableKey: string }) {
  const [tab, setTab] = useState<TabKey>('payments');
  const [error, setError] = useState<string | null>(null);

  const connect = useMemo(
    () =>
      loadConnectAndInitialize({
        publishableKey,
        locale: 'it-IT',
        fetchClientSecret: async () => {
          const response = await fetch('/api/coach/payments/dashboard-session', {
            method: 'POST',
          });
          const body = (await response.json().catch(() => ({}))) as {
            clientSecret?: string;
            error?: string;
          };
          if (!response.ok || !body.clientSecret) {
            setError(
              body.error ?? 'Non è stato possibile caricare gli incassi. Riprova tra poco.'
            );
            throw new Error('session');
          }
          return body.clientSecret;
        },
      }),
    [publishableKey]
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-900">I tuoi incassi</h3>
      <p className="mt-1 text-sm text-gray-600">
        Quando un atleta acquista un tuo piano, il pagamento compare qui. I
        bonifici arrivano sul conto che hai indicato a Stripe.
      </p>

      <div role="tablist" aria-label="Incassi" className="mt-4 flex gap-1 border-b border-gray-200">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`earnings-tab-${item.key}`}
            aria-selected={tab === item.key}
            aria-controls={`earnings-panel-${item.key}`}
            onClick={() => setTab(item.key)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === item.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <div
        role="tabpanel"
        id={`earnings-panel-${tab}`}
        aria-labelledby={`earnings-tab-${tab}`}
        className="mt-4"
      >
        <ConnectComponentsProvider connectInstance={connect}>
          <ConnectNotificationBanner />
          {tab === 'payments' && <ConnectPayments />}
          {tab === 'payouts' && (
            <div className="flex flex-col gap-6">
              <ConnectBalances />
              <ConnectPayouts />
            </div>
          )}
          {tab === 'account' && <ConnectAccountManagement />}
        </ConnectComponentsProvider>
      </div>
    </div>
  );
}
