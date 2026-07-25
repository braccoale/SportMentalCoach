/**
 * Minimal analytics seam. The project has no client analytics provider yet, so
 * this is the single, named integration point to wire one later (Plausible,
 * PostHog, GA…). For now it is a safe no-op that only logs in development.
 *
 * IMPORTANT: never pass personal data (email, name, code owner identity) in the
 * props — event names + coarse context only.
 */
export type AnalyticsEvent =
  | 'invite_modal_opened'
  | 'invite_link_copied'
  | 'invite_shared_whatsapp'
  | 'invite_shared_email'
  | 'invite_shared_telegram'
  | 'invite_native_share'
  | 'invite_page_viewed'
  | 'invite_signup_clicked'
  | 'invite_signup_completed';

export function track(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>
): void {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event, props ?? {});
  }
  // Future: forward to the chosen provider here.
}
