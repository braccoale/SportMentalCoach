// Server-side flag: read directly from BILLING_ENABLED.
// Client-side flag: Next.js only inlines env vars prefixed with NEXT_PUBLIC_,
// so we expose NEXT_PUBLIC_BILLING_ENABLED for use in client components.
// Both should be kept in sync in .env.
export const BILLING_ENABLED =
  process.env.BILLING_ENABLED === 'true' ||
  process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';

// UI flag: show a coach's individual hourly rate on their card and profile.
// Off while the commercial model is based on club packages/subscriptions
// (see the "Pacchetti" section on the landing). The price data and rendering
// code are kept intact — flip this to `true` to re-enable everywhere.
export const SHOW_COACH_HOURLY_RATE = false;

// UI flag: show "coming soon" entry points (AI matching, saved searches).
// OFF for production polish: the marketplace only exposes finished features.
export const SHOW_UPCOMING_FEATURES = false;

// Video (LiveKit) is optional. It is "configured" only when all three env vars
// are present. Read lazily at call time so the app never requires LiveKit env
// at startup when video is unused.
export function isVideoConfigured(): boolean {
  return !!(
    process.env.LIVEKIT_API_KEY &&
    process.env.LIVEKIT_API_SECRET &&
    process.env.NEXT_PUBLIC_LIVEKIT_URL
  );
}

// Supabase Realtime is optional. When unset, chat still works with
// server-rendered messages + refresh — realtime only enhances the UI.
export function isRealtimeConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Email notifications are optional and OFF by default. Enabled only when
// EMAIL_NOTIFICATIONS_ENABLED=true AND the provider key + a from-address are
// present. Read lazily so the provider is never required at startup.
//
// EMAIL_FROM_ADDRESS is the current variable; RESEND_FROM_EMAIL is still
// accepted so deployments configured before the split keep working.
export function isEmailEnabled(): boolean {
  return (
    process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true' &&
    !!process.env.RESEND_API_KEY &&
    !!(process.env.EMAIL_FROM_ADDRESS || process.env.RESEND_FROM_EMAIL)
  );
}

/**
 * Zittisce **tutto** il ventaglio delle notifiche: campanella, email e push.
 *
 * **Perché non basta `EMAIL_NOTIFICATIONS_ENABLED=false`.** Quello spegne solo
 * le email. `createNotification` scrive comunque, e il push parte comunque:
 * il 2026-08-27 sette giri degli scenari end-to-end hanno registrato sette
 * coach, e ognuna di quelle registrazioni ha avvisato tre amministratori veri
 * — trenta notifiche a persone reali. Spegnere le email non era servito a
 * niente perché il rumore non veniva da lì.
 *
 * **Perché non ha effetto in produzione, e non è prudenza generica.** Una
 * variabile capace di zittire gli avvisi di un prodotto vivo è un guasto che
 * nessun errore segnala: le notifiche smetterebbero di arrivare e tutto
 * continuerebbe a sembrare a posto. Un atleta non saprebbe che la sua sessione
 * è stata annullata, e nessun log direbbe perché. Qui il doppio controllo è la
 * garanzia che quella variabile, anche se finisse per errore nelle env di
 * Vercel, non possa fare danno.
 */
export function areNotificationsSilenced(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.NOTIFICATIONS_SILENCED === 'true'
  );
}
