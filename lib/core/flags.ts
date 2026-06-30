// Server-side flag: read directly from BILLING_ENABLED.
// Client-side flag: Next.js only inlines env vars prefixed with NEXT_PUBLIC_,
// so we expose NEXT_PUBLIC_BILLING_ENABLED for use in client components.
// Both should be kept in sync in .env.
export const BILLING_ENABLED =
  process.env.BILLING_ENABLED === 'true' ||
  process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true';

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
