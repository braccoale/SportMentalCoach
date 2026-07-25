import 'server-only';

/** Public application origin used in links leaving KaiPai. */
export function getAppBaseUrl(): string | null {
  const value =
    process.env.BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!value) return null;

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

