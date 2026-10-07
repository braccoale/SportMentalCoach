import 'server-only';
import type { StripeAccountSnapshot } from '@/lib/core/billing/stripe-account-status';

/**
 * Stripe Connect, lato server: gli account collegati dei coach.
 *
 * Chiamate con `fetch` e non con l'SDK `stripe`: quello installato (18.x) è
 * anteriore alle API Accounts v2, e l'SDK serve già al resto del progetto con
 * la sua versione. Stessa scelta fatta per OpenAI e Resend.
 *
 * Configurazione degli account (addebiti diretti, fase 1): il coach è
 * l'esercente sul proprio account, ha la dashboard Stripe completa, paga lui le
 * commissioni di Stripe e Stripe risponde degli eventuali saldi negativi.
 * Queste responsabilità si fissano alla creazione e non si possono più
 * cambiare: vedi `docs/pagamenti-coach.md` prima di toccarle.
 */

const STRIPE_API = 'https://api.stripe.com';
export const STRIPE_CONNECT_API_VERSION = '2026-06-24.dahlia';
const REQUEST_TIMEOUT_MS = 15_000;

export class StripeConnectError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'StripeConnectError';
  }
}

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new StripeConnectError(
      'STRIPE_NOT_CONFIGURED',
      'STRIPE_SECRET_KEY non è configurata.'
    );
  }
  return key;
}

type StripeErrorBody = { error?: { code?: string; message?: string } };

async function parse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & StripeErrorBody;
  if (!response.ok) {
    // Il messaggio di Stripe non contiene la chiave; non si registra il corpo
    // della richiesta, che porta dati personali del coach.
    throw new StripeConnectError(
      body.error?.code ?? 'STRIPE_REQUEST_FAILED',
      body.error?.message ?? `Stripe ha risposto ${response.status}.`,
      response.status
    );
  }
  return body;
}

async function v2<T>(
  method: 'GET' | 'POST',
  path: string,
  options: { body?: unknown; idempotencyKey?: string } = {}
): Promise<T> {
  const response = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Stripe-Version': STRIPE_CONNECT_API_VERSION,
      'Content-Type': 'application/json',
      ...(options.idempotencyKey
        ? { 'Idempotency-Key': options.idempotencyKey }
        : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  return parse<T>(response);
}

const ACCOUNT_INCLUDES = [
  'configuration.merchant',
  'defaults',
  'identity',
  'requirements',
];

export type ConnectedAccount = StripeAccountSnapshot & { id: string };

/**
 * Crea l'account collegato di un coach. La chiave di idempotenza è per coach:
 * un doppio clic o due schede aperte ottengono lo stesso account, non due.
 */
export async function createCoachConnectedAccount(params: {
  coachUserId: number;
  email: string;
  displayName: string;
  businessUrl?: string | null;
}): Promise<ConnectedAccount> {
  return v2<ConnectedAccount>('POST', '/v2/core/accounts', {
    idempotencyKey: `kaipai-coach-account-${params.coachUserId}`,
    body: {
      contact_email: params.email,
      display_name: params.displayName,
      dashboard: 'full',
      identity: { country: 'it', entity_type: 'individual' },
      defaults: {
        currency: 'eur',
        locales: ['it-IT'],
        responsibilities: {
          fees_collector: 'stripe',
          losses_collector: 'stripe',
        },
        profile: {
          product_description:
            'Sedute individuali online di mental coaching sportivo.',
          ...(params.businessUrl ? { business_url: params.businessUrl } : {}),
        },
      },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
      },
      metadata: { kaipai_coach_user_id: String(params.coachUserId) },
      include: ACCOUNT_INCLUDES,
    },
  });
}

export async function retrieveConnectedAccount(
  accountId: string
): Promise<ConnectedAccount> {
  const query = ACCOUNT_INCLUDES.map((value) => `include=${value}`).join('&');
  return v2<ConnectedAccount>(
    'GET',
    `/v2/core/accounts/${encodeURIComponent(accountId)}?${query}`
  );
}

export type AccountSessionPurpose = 'onboarding' | 'dashboard';

/**
 * I componenti che ciascuno scopo abilita. La verifica d'identità e gli
 * incassi non si aprono insieme: chi sta ancora verificando non ha niente da
 * vedere, e chi incassa non deve poter rientrare nel modulo di verifica.
 */
const SESSION_COMPONENTS: Record<AccountSessionPurpose, string[]> = {
  onboarding: ['account_onboarding', 'notification_banner'],
  dashboard: [
    'payments',
    'payouts',
    'balances',
    'account_management',
    'notification_banner',
  ],
};

/**
 * Segreto di sessione per i componenti incorporati. Dura poco: si chiede a
 * ogni apertura della pagina, non si conserva.
 */
export async function createAccountSession(
  accountId: string,
  purpose: AccountSessionPurpose = 'onboarding'
): Promise<string> {
  const form = new URLSearchParams({ account: accountId });
  for (const component of SESSION_COMPONENTS[purpose]) {
    form.set(`components[${component}][enabled]`, 'true');
  }
  const response = await fetch(`${STRIPE_API}/v1/account_sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  const body = await parse<{ client_secret?: string }>(response);
  if (!body.client_secret) {
    throw new StripeConnectError(
      'STRIPE_NO_SESSION_SECRET',
      'Stripe non ha restituito il segreto di sessione.'
    );
  }
  return body.client_secret;
}

export type PlanCheckoutParams = {
  connectedAccountId: string;
  /** Il nostro id riga in `plan_subscriptions`: Stripe lo restituisce tale e quale. */
  subscriptionRowId: number;
  planName: string;
  sessionsPerMonth: number;
  monthlyPriceCents: number;
  athleteEmail: string;
  successUrl: string;
  cancelUrl: string;
};

/**
 * Apre un Checkout in abbonamento **sull'account del coach** (addebito
 * diretto): il coach è l'esercente, KaiPai non incassa e non trattiene niente
 * (nessuna `application_fee`). L'importo viene dal piano salvato, mai dal
 * browser. Non si passa `payment_method_types`: i metodi di pagamento li
 * decide la configurazione dinamica dell'account.
 */
export async function createPlanCheckoutSession(
  params: PlanCheckoutParams
): Promise<{ id: string; url: string }> {
  const form = new URLSearchParams({
    mode: 'subscription',
    locale: 'it',
    customer_email: params.athleteEmail,
    client_reference_id: String(params.subscriptionRowId),
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(params.monthlyPriceCents),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]': params.planName,
    'line_items[0][price_data][product_data][description]': `${params.sessionsPerMonth} ${
      params.sessionsPerMonth === 1 ? 'seduta' : 'sedute'
    } al mese`,
    'metadata[kaipai_plan_subscription_id]': String(params.subscriptionRowId),
    'subscription_data[metadata][kaipai_plan_subscription_id]': String(
      params.subscriptionRowId
    ),
  });

  const response = await fetch(`${STRIPE_API}/v1/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': params.connectedAccountId,
      // Un doppio clic sulla stessa riga apre lo stesso Checkout, non due.
      'Idempotency-Key': `kaipai-plan-checkout-${params.subscriptionRowId}`,
    },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  const body = await parse<{ id?: string; url?: string }>(response);
  if (!body.id || !body.url) {
    throw new StripeConnectError(
      'STRIPE_NO_CHECKOUT_URL',
      'Stripe non ha restituito il collegamento al pagamento.'
    );
  }
  return { id: body.id, url: body.url };
}

/**
 * Programma (o toglie) l'annullamento di un abbonamento alla fine del periodo
 * già pagato. Non lo chiude subito: l'atleta ha pagato fino a quella data.
 * L'operazione è idempotente per natura (stesso valore, stesso risultato), e
 * Stripe risponde con l'abbonamento aggiornato.
 */
export async function setSubscriptionCancelAtPeriodEnd(params: {
  connectedAccountId: string;
  subscriptionId: string;
  cancelAtPeriodEnd: boolean;
}): Promise<{ cancelAtPeriodEnd: boolean }> {
  const response = await fetch(
    `${STRIPE_API}/v1/subscriptions/${encodeURIComponent(params.subscriptionId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Account': params.connectedAccountId,
      },
      body: new URLSearchParams({
        cancel_at_period_end: String(params.cancelAtPeriodEnd),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    }
  );
  const body = await parse<{ cancel_at_period_end?: boolean }>(response);
  return { cancelAtPeriodEnd: Boolean(body.cancel_at_period_end) };
}

/**
 * Il metodo di pagamento dell'abbonamento, letto da Stripe per mostrarlo
 * all'atleta («Carta •••• 4242»). Non si salva: marca e ultime cifre restano a
 * Stripe. Tempo limite breve e nessun errore verso l'alto: è un dettaglio della
 * scheda, e una scheda non deve fallire perché Stripe è lento.
 */
export async function getSubscriptionPaymentMethod(params: {
  connectedAccountId: string;
  subscriptionId: string;
}): Promise<{
  type?: string;
  card?: { brand?: string | null; last4?: string | null } | null;
  sepa_debit?: { last4?: string | null } | null;
} | null> {
  try {
    const response = await fetch(
      `${STRIPE_API}/v1/subscriptions/${encodeURIComponent(
        params.subscriptionId
      )}?expand[]=default_payment_method`,
      {
        headers: {
          Authorization: `Bearer ${secretKey()}`,
          'Stripe-Account': params.connectedAccountId,
        },
        signal: AbortSignal.timeout(3000),
        cache: 'no-store',
      }
    );
    if (!response.ok) return null;
    const body = (await response.json()) as {
      default_payment_method?: {
        type?: string;
        card?: { brand?: string | null; last4?: string | null } | null;
        sepa_debit?: { last4?: string | null } | null;
      } | null;
    };
    return body.default_payment_method ?? null;
  } catch {
    return null;
  }
}

export type SingleSessionCheckoutParams = {
  connectedAccountId: string;
  creditRowId: number;
  priceCents: number;
  coachName: string;
  /** Per quanti giorni vale la seduta: compare nella descrizione del pagamento. */
  validityDays: number;
  athleteEmail: string;
  successUrl: string;
  cancelUrl: string;
};

/**
 * Checkout di un pagamento singolo (una seduta) sull'account del coach, come
 * per l'abbonamento: il denaro va a lui e la commissione KaiPai è zero. Il
 * segno `kaipai_session_credit_id` ci fa riconoscere l'evento al ritorno.
 */
export async function createSingleSessionCheckoutSession(
  params: SingleSessionCheckoutParams
): Promise<{ id: string; url: string }> {
  const form = new URLSearchParams({
    mode: 'payment',
    locale: 'it',
    customer_email: params.athleteEmail,
    client_reference_id: `credit-${params.creditRowId}`,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'eur',
    'line_items[0][price_data][unit_amount]': String(params.priceCents),
    'line_items[0][price_data][product_data][name]': `Seduta singola con ${params.coachName}`,
    'line_items[0][price_data][product_data][description]':
      `Una seduta, valida ${params.validityDays} ${params.validityDays === 1 ? 'giorno' : 'giorni'} dal pagamento`,
    'metadata[kaipai_session_credit_id]': String(params.creditRowId),
    'payment_intent_data[metadata][kaipai_session_credit_id]': String(
      params.creditRowId
    ),
  });

  const response = await fetch(`${STRIPE_API}/v1/checkout/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': params.connectedAccountId,
      'Idempotency-Key': `kaipai-session-checkout-${params.creditRowId}`,
    },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  const body = await parse<{ id?: string; url?: string }>(response);
  if (!body.id || !body.url) {
    throw new StripeConnectError(
      'STRIPE_NO_CHECKOUT_URL',
      'Stripe non ha restituito il collegamento al pagamento.'
    );
  }
  return { id: body.id, url: body.url };
}

const PORTAL_CONFIG_MARK = 'v1';

/**
 * La configurazione del portale clienti sull'account del coach, creata alla
 * prima richiesta e riconosciuta dal segno `kaipai_portal` nei metadati (un
 * account può averne altre, o nessuna: in modalità live il portale non si apre
 * senza una configurazione).
 *
 * Il portale serve a **una sola cosa**: cambiare il metodo di pagamento e
 * vedere le fatture. L'annullamento e il cambio piano restano nel nostro sito,
 * dove si applicano le regole (fine periodo, sedute): se fossero nel portale
 * l'atleta potrebbe annullare saltandole.
 */
export async function ensureBillingPortalConfiguration(
  connectedAccountId: string
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${secretKey()}`,
    'Stripe-Account': connectedAccountId,
  };
  const listed = await parse<{
    data?: { id: string; metadata?: Record<string, string> | null }[];
  }>(
    await fetch(`${STRIPE_API}/v1/billing_portal/configurations?limit=20&active=true`, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })
  );
  const existing = listed.data?.find(
    (config) => config.metadata?.kaipai_portal === PORTAL_CONFIG_MARK
  );
  if (existing) return existing.id;

  const form = new URLSearchParams({
    'business_profile[headline]': 'KaiPai: gestisci il tuo metodo di pagamento',
    'features[payment_method_update][enabled]': 'true',
    'features[invoice_history][enabled]': 'true',
    'features[customer_update][enabled]': 'false',
    'features[subscription_cancel][enabled]': 'false',
    'features[subscription_update][enabled]': 'false',
    'metadata[kaipai_portal]': PORTAL_CONFIG_MARK,
  });
  const created = await parse<{ id?: string }>(
    await fetch(`${STRIPE_API}/v1/billing_portal/configurations`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: 'no-store',
    })
  );
  if (!created.id) {
    throw new StripeConnectError(
      'STRIPE_NO_PORTAL_CONFIGURATION',
      'Stripe non ha restituito la configurazione del portale.'
    );
  }
  return created.id;
}

/** Apre il portale clienti sull'account del coach per quel cliente. */
export async function createBillingPortalSession(params: {
  connectedAccountId: string;
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const configuration = await ensureBillingPortalConfiguration(
    params.connectedAccountId
  );
  const response = await fetch(`${STRIPE_API}/v1/billing_portal/sessions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Account': params.connectedAccountId,
    },
    body: new URLSearchParams({
      customer: params.customerId,
      configuration,
      return_url: params.returnUrl,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  const body = await parse<{ url?: string }>(response);
  if (!body.url) {
    throw new StripeConnectError(
      'STRIPE_NO_PORTAL_URL',
      'Stripe non ha restituito il collegamento al portale.'
    );
  }
  return { url: body.url };
}
