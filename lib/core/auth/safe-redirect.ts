/**
 * Dove è lecito rimandare qualcuno dopo l'autenticazione.
 *
 * L'indirizzo arriva da un parametro nella barra degli indirizzi, quindi è
 * scritto da chi ci arriva. Senza questo filtro, un collegamento del tipo
 * `/sign-in?redirect=https://sito-che-imita-kaipai.example` porterebbe l'utente
 * a rifare l'accesso su una pagina che non è nostra, subito dopo un accesso
 * riuscito sul nostro dominio — che è il momento in cui uno si fida di più.
 *
 * Passano solo i percorsi di questo sito. `//altro-sito` è escluso apposta: il
 * browser lo legge come indirizzo assoluto con lo stesso protocollo, e a occhio
 * sembra un percorso interno.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/')) return null;
  if (value.startsWith('//')) return null;
  // `/\` viene normalizzato in `//` da alcuni browser: stessa fuga, altra
  // scrittura.
  if (value.startsWith('/\\')) return null;
  return value;
}
