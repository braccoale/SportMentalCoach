import { sports } from '@/lib/verticals/sport-mental-coach/taxonomies';

/**
 * La chiave dello sport, ricavata da quello che è arrivato.
 *
 * `client_profiles.category` è una **chiave di tassonomia**: la leggono
 * l'icona dello sport, i filtri del marketplace e le schede dei coach, e
 * nessuno di loro sa che farsene di una parola italiana.
 *
 * Ma la colonna ha avuto due scrittori con due contratti diversi. La
 * procedura guidata scriveva la chiave (`football`); il modulo del profilo
 * atleta era un campo di testo libero con scritto sotto
 * «Es. Tennis, Calcio, Atletica…» — cioè invitava a scrivere l'etichetta. Chi
 * ha fatto esattamente quello si è ritrovato una medaglia al posto del
 * pallone: `sportIcon` non trovava `Calcio` fra le chiavi e ripiegava sul
 * simbolo generico, mentre il fumetto continuava a dire «Calcio», perché
 * quello sì che sa ripiegare sulla stringa grezza. Icona e testo venivano da
 * due strade diverse, e solo una delle due sapeva di essere in avaria.
 *
 * Questa funzione chiude la porta e ripara chi era già entrato: accetta la
 * chiave, riconosce l'etichetta, e restituisce sempre una chiave.
 * `null` significa «non lo so», che è una risposta onesta e che l'interfaccia
 * sa già mostrare.
 */
export function normalizeSportKey(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const byKey = sports.find((sport) => sport.key === trimmed);
  if (byKey) return byKey.key;

  const wanted = foldForCompare(trimmed);
  const byLabel = sports.find((sport) => foldForCompare(sport.label) === wanted);
  return byLabel ? byLabel.key : null;
}

/** Riconosce «Calcio», «calcio», «CALCIO» e «Arti Marziali» come la stessa cosa. */
function foldForCompare(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('it-IT')
    .replace(/\s+/g, ' ')
    .trim();
}
