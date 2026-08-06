/**
 * Client analytics seam. In production events are forwarded to GA4 only when
 * the visitor has explicitly enabled analytics; before consent `window.gtag`
 * does not exist and this remains a safe no-op.
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
  | 'invite_signup_completed'
  // Registration + onboarding funnel (never carry personal data as props).
  | 'signup_role_selected'
  | 'signup_credentials_completed'
  | 'signup_age_verified'
  | 'signup_blocked_underage'
  | 'guardian_consent_requested'
  | 'guardian_consent_approved'
  | 'guardian_consent_rejected'
  | 'email_verified'
  | 'onboarding_started'
  | 'onboarding_step_completed'
  | 'onboarding_completed'
  | 'coach_profile_submitted'
  | 'google_calendar_add_clicked';

export function track(
  event: AnalyticsEvent,
  props?: Record<string, string | number | boolean>
): void {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[analytics]', event, props ?? {});
  }

  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', event, props ?? {});
  }
}
