/** Header interno aggiunto dal middleware per rendere noto il metodo HTTP. */
export const REQUEST_METHOD_HEADER = 'x-kaipai-request-method';

export const DEMO_READONLY_MESSAGE =
  'Questa è una demo in sola lettura. Puoi esplorare tutti i dati, ma non modificarli.';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class DemoReadOnlyError extends Error {
  readonly code = 'DEMO_READONLY';
  readonly status = 403;

  constructor() {
    super(DEMO_READONLY_MESSAGE);
    this.name = 'DemoReadOnlyError';
  }
}

/**
 * Blocco applicativo comune a Server Actions, API web e API mobile.
 * Il flag autorevole è quello persistito in public.users, non un dato client.
 */
export function assertDemoWriteAllowed(
  user: { isDemo: boolean },
  method: string
): void {
  if (user.isDemo && !SAFE_METHODS.has(method.toUpperCase())) {
    throw new DemoReadOnlyError();
  }
}

export function isDemoReadOnlyError(error: unknown): error is DemoReadOnlyError {
  return error instanceof DemoReadOnlyError;
}
