/**
 * Shared discriminated result type for domain operations. `Result` (no type
 * arg) is a plain ok/err; `Result<{ id: number }>` carries data on success.
 */
export type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };
