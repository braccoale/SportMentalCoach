/**
 * Registra gli errori che il server lancia mentre serve una pagina, un'azione
 * o una rotta, così «Utilizzo» può dire se qualcuno ha trovato una pagina rotta.
 *
 * Solo sul runtime Node (è lì che c'è il database) e mai a costo di un errore
 * in più: se la registrazione fallisce, non succede niente.
 */
export async function onRequestError(
  error: { name?: string; digest?: string },
  request: { path: string; headers: Record<string, string | string[] | undefined> },
  context: { routePath?: string; routeType?: string }
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    const { recordServerError } = await import('@/lib/core/usage/server');
    await recordServerError(error, request, context);
  } catch {
    // Una statistica che non si scrive non deve diventare un secondo errore.
  }
}
