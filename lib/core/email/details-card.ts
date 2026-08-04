/**
 * La card dei dettagli: le righe "Etichetta → valore" che rendono un'email
 * transazionale utile invece che generica.
 *
 * Perché vive in codice e non nel template a database.
 *
 * Il renderer è fail-closed: un segnaposto senza valore blocca l'invio. È la
 * regola giusta per la prosa ("Ciao {{recipient.firstName}}"), ma sbagliata per
 * i dettagli: "Sessione proposta" è legittimamente assente su una richiesta
 * senza orario, e "Sport" lo è se l'atleta non l'ha indicato. Se fossero
 * segnaposto nel template, ogni dato mancante bloccherebbe un'email valida.
 *
 * La card risolve il conflitto: il codice costruisce le righe e **omette in
 * silenzio quelle senza valore**, il template decide solo dove metterla con il
 * segnaposto `{{detailsCard}}`. Nessun campo inventato, nessun "undefined",
 * nessun invio bloccato per un dato opzionale.
 *
 * Modulo puro: nessun I/O, direttamente testabile.
 */

import { escapeHtml } from './render';

export type CardRow = {
  label: string;
  /** Riga omessa quando è null, undefined o stringa vuota. */
  value: string | null | undefined;
  /**
   * Riga in evidenza (valore in antracite, peso maggiore), per il dato che
   * l'utente sta davvero cercando: l'orario della sessione.
   */
  emphasis?: boolean;
  /** Inserisce un separatore sopra la riga, per staccare i due blocchi. */
  separatorBefore?: boolean;
};

export type DetailsCard = {
  rows: CardRow[];
  /** Citazione a piè di card: la nota dell'atleta, mai contenuto sensibile. */
  quote?: { text: string; attribution?: string | null } | null;
};

const COLORS = {
  ink: '#111111',
  body: '#3f3f46',
  muted: '#8a8a91',
  red: '#e11d2a',
  cardBg: '#fafafa',
  border: '#ebebee',
} as const;

/** Righe effettivamente renderizzabili. */
export function visibleRows(card: DetailsCard): CardRow[] {
  return card.rows.filter(
    (r) => r.value !== null && r.value !== undefined && String(r.value).trim() !== ''
  );
}

/** True quando non c'è nulla da mostrare: il template salta del tutto la card. */
export function isEmptyCard(card: DetailsCard | null | undefined): boolean {
  if (!card) return true;
  return visibleRows(card).length === 0 && !card.quote?.text?.trim();
}

/**
 * HTML della card. Tabellare e con stili inline: è l'unico modo per ottenere
 * un allineamento stabile su Outlook, che ignora flexbox e grid.
 *
 * Ogni valore è escapato qui dentro, quindi il risultato può essere inserito
 * grezzo dal renderer.
 */
export function renderDetailsCardHtml(card: DetailsCard): string {
  if (isEmptyCard(card)) return '';

  const rows = visibleRows(card)
    .map((row) => {
      const separator = row.separatorBefore
        ? `<tr><td colspan="2" style="padding:6px 0 10px"><div style="border-top:1px solid ${COLORS.border};font-size:0;line-height:0">&nbsp;</div></td></tr>`
        : '';

      const valueStyle = row.emphasis
        ? `color:${COLORS.ink};font-weight:700;font-size:15px`
        : `color:${COLORS.body};font-weight:500;font-size:14px`;

      return `${separator}<tr>
        <td style="padding:5px 16px 5px 0;vertical-align:top;white-space:nowrap;color:${COLORS.muted};font-size:11px;letter-spacing:0.6px;text-transform:uppercase;font-weight:600">${escapeHtml(row.label)}</td>
        <td style="padding:5px 0;vertical-align:top;${valueStyle};line-height:1.45">${escapeHtml(String(row.value))}</td>
      </tr>`;
    })
    .join('\n');

  const quote = card.quote?.text?.trim()
    ? `<tr><td colspan="2" style="padding:14px 0 0">
         <div style="border-left:3px solid ${COLORS.border};padding:2px 0 2px 12px;color:${COLORS.body};font-size:14px;line-height:1.55;font-style:italic">
           «${escapeHtml(card.quote.text.trim())}»${
             card.quote.attribution
               ? `<br /><span style="font-style:normal;color:${COLORS.muted};font-size:12px">— ${escapeHtml(card.quote.attribution)}</span>`
               : ''
           }
         </div>
       </td></tr>`
    : '';

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
    style="background:${COLORS.cardBg};border:1px solid ${COLORS.border};border-left:3px solid ${COLORS.red};border-radius:12px;margin:4px 0 22px">
    <tr><td style="padding:18px 20px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${rows}
        ${quote}
      </table>
    </td></tr>
  </table>`;
}

/**
 * Versione testuale della card. Stessi dati, stesse omissioni: la parte testo
 * non è un ripiego, è l'email per chi blocca l'HTML.
 */
export function renderDetailsCardText(card: DetailsCard): string {
  if (isEmptyCard(card)) return '';

  const width = Math.max(
    0,
    ...visibleRows(card).map((r) => r.label.length)
  );

  const lines = visibleRows(card).map((row) => {
    const prefix = row.separatorBefore ? '\n' : '';
    return `${prefix}${row.label.padEnd(width)}  ${String(row.value)}`;
  });

  if (card.quote?.text?.trim()) {
    lines.push('');
    lines.push(`«${card.quote.text.trim()}»`);
    if (card.quote.attribution) lines.push(`— ${card.quote.attribution}`);
  }

  return lines.join('\n');
}
