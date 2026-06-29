// Server-side flag: read directly from BILLING_ENABLED.
// Client-side flag: Next.js only inlines env vars prefixed with NEXT_PUBLIC_,
// so we expose NEXT_PUBLIC_BILLING_ENABLED for use in client components.
// Both should be kept in sync in .env.
export const BILLING_ENABLED =
  process.env.BILLING_ENABLED === 'true' ||
  process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';
