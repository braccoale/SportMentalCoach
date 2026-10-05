/**
 * Perché Supabase Auth ha rifiutato una password, detto all'utente.
 *
 * Con la protezione contro le password compromesse attiva, Supabase risponde
 * `weak_password` a una registrazione o a un cambio password. Le azioni in
 * `app/(login)/actions.ts` scartavano il motivo e mostravano "Riprova": chi
 * sceglieva una password già comparsa in una violazione di dati la ripresentava
 * identica, e al reset da link gli si diceva di chiedere un nuovo link, che non
 * serviva a niente.
 *
 * Il codice e i motivi (`length`, `characters`, `pwned`) sono quelli esposti da
 * `@supabase/auth-js`; qui si leggono in modo strutturale, senza importare la
 * classe, perché l'errore dell'API admin (`createUser`) e quello di `updateUser`
 * non sono sempre la stessa classe ma portano lo stesso `code`.
 */

export type PasswordRejection = 'compromessa' | 'debole';

interface AuthErrorLike {
  code?: unknown;
  reasons?: unknown;
}

/**
 * `null` quando l'errore non riguarda la password: in quel caso chi chiama
 * tiene il proprio messaggio, e un errore di rete non diventa "password debole".
 */
export function classifyPasswordRejection(
  error: unknown
): PasswordRejection | null {
  if (!error || typeof error !== 'object') return null;
  const { code, reasons } = error as AuthErrorLike;
  if (code !== 'weak_password') return null;
  if (Array.isArray(reasons) && reasons.includes('pwned')) return 'compromessa';
  return 'debole';
}

export const PASSWORD_REJECTION_MESSAGES: Record<PasswordRejection, string> = {
  compromessa:
    'Questa password è comparsa in violazioni di dati pubbliche e non è sicura. Scegline un’altra.',
  debole:
    'Questa password è troppo debole. Scegline un’altra, più lunga e meno prevedibile.',
};

/** Il messaggio da mostrare, o `null` se l'errore non riguarda la password. */
export function passwordRejectionMessage(error: unknown): string | null {
  const rejection = classifyPasswordRejection(error);
  return rejection ? PASSWORD_REJECTION_MESSAGES[rejection] : null;
}
