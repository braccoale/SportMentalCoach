/**
 * Da dove si è arrivati a una seduta, per poterci tornare.
 *
 * La pagina di una seduta si raggiunge da posti diversi — l'elenco delle
 * sessioni, la scheda di un atleta, una notifica — e finora il collegamento
 * «indietro» ne conosceva uno solo. Chi ci arrivava dal percorso di un atleta,
 * cliccando una singola giornata, si ritrovava sulla dashboard: non dove era, e
 * per riprendere il filo doveva rifare la strada.
 *
 * Il ritorno viaggia quindi nell'indirizzo. Chi costruisce il collegamento sa
 * da dove parte; la pagina di destinazione no, e non può indovinarlo.
 *
 * Il nome del parametro sta scritto qui e in nessun altro posto: chi lo scrive
 * e chi lo legge devono usare la stessa parola, e due stringhe uguali in due
 * file sono due stringhe che un giorno divergono.
 */
export const RETURN_TO_PARAM = 'back';

/**
 * Aggiunge il ritorno a un indirizzo, tenendo conto dell'ancora.
 *
 * L'ancora deve restare **in fondo**: `?back=…#session-compass` funziona,
 * `#session-compass?back=…` no — quello che segue il cancelletto non è una
 * query, è parte del frammento, e il parametro non arriverebbe mai al server.
 */
export function withReturnTo(href: string, backTo: string | null): string {
  if (!backTo) return href;

  const [path, ...rest] = href.split('#');
  const fragment = rest.length > 0 ? `#${rest.join('#')}` : '';
  const separator = path.includes('?') ? '&' : '?';

  return `${path}${separator}${RETURN_TO_PARAM}=${encodeURIComponent(backTo)}${fragment}`;
}
