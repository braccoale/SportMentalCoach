/**
 * Lo scheletro condiviso delle email KaiPai: logo, header, eyebrow, titolo,
 * corpo, card dei dettagli, CTA, firma e footer.
 *
 * Vive in codice di proposito. Il database contiene il messaggio; la cornice
 * di marca non è contenuto editabile, e tenerla qui impedisce che una riga di
 * `email_templates` inietti markup fuori dall'area del corpo, faccia sparire il
 * link alle preferenze o si spacci per un mittente diverso.
 *
 * Vincoli dei client email rispettati: solo tabelle e stili inline, nessun CSS
 * esterno, nessun web font, nessun JavaScript, larghezza massima 600px, e ogni
 * CTA accompagnata dall'URL in chiaro per chi non può cliccare il pulsante.
 *
 * Scelta cromatica. Il pulsante è antracite, non rosso: un pill rosso isolato
 * su fondo bianco viene letto come allarme, e lo stesso pulsante deve reggere
 * sia "Sessione confermata" sia "Sessione annullata". Il rosso resta il sistema
 * di accento — banda sotto l'header, eyebrow, bordo della card — dove
 * costruisce marca invece di segnalare un problema.
 */

import { renderDetailsCardHtml, renderDetailsCardText, isEmptyCard, type DetailsCard } from './details-card';
import { escapeHtml } from './render';

export const BRAND = {
  name: 'KaiPai',
  tagline: 'Alleniamo la mente. Miglioriamo le prestazioni.',
  red: '#e11d2a',
  ink: '#111111',
  body: '#3f3f46',
  muted: '#8a8a91',
  border: '#ebebee',
  surface: '#ffffff',
  canvas: '#f4f4f6',
  site: 'https://www.kaipaicoach.com',
  siteLabel: 'kaipaicoach.com',
  contactEmail: 'info@kaipaicoach.com',
  /** Percorso dell'asset generato da scripts/build-email-logo.ts (440×139). */
  logoPath: '/email/kaipai-logo.png',
  logoDisplayWidth: 220,
} as const;

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type EmailAction = { label: string; url: string };

export type EmailLayoutInput = {
  /** Riga di anteprima grigia mostrata dopo l'oggetto nella inbox. */
  preview?: string | null;
  /** Sopratitolo breve e maiuscolo, es. "NUOVA RICHIESTA". */
  eyebrow?: string | null;
  /** Titolo dell'email. */
  title: string;
  /** Paragrafi del corpo, già renderizzati ed escapati. */
  bodyHtml: string;
  /** Dettagli strutturati; le righe senza valore sono già state omesse. */
  card?: DetailsCard | null;
  /** Chiusura dopo la CTA: cosa fare, avvertenze. Già renderizzata. */
  outroHtml?: string | null;
  action?: EmailAction | null;
  preferencesUrl?: string | null;
  privacyUrl?: string | null;
  /** Origine assoluta usata per risolvere il logo. */
  baseUrl?: string | null;
};

export function logoUrl(baseUrl?: string | null): string {
  return `${baseUrl ?? BRAND.site}${BRAND.logoPath}`;
}

/**
 * Avvolge il corpo renderizzato nella cornice KaiPai.
 *
 * `bodyHtml` e `outroHtml` sono inseriti così come sono: li produce
 * `renderTemplate`, che ha già escapato ogni valore interpolato. Tutto il
 * markup attorno è fissato qui e non proviene mai dal database.
 */
export function wrapEmailHtml(input: EmailLayoutInput): string {
  const preheader = input.preview
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${escapeHtml(input.preview)}</div>`
    : '';

  const eyebrow = input.eyebrow
    ? `<p style="margin:0 0 10px;color:${BRAND.red};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase">${escapeHtml(input.eyebrow)}</p>`
    : '';

  const card = input.card && !isEmptyCard(input.card)
    ? renderDetailsCardHtml(input.card)
    : '';

  // Pulsante + URL in chiaro. Il fallback non è cosmetico: molti client
  // aziendali riscrivono o disattivano i link, e senza l'indirizzo visibile
  // l'email diventa un vicolo cieco.
  const action = input.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 8px">
         <tr><td style="border-radius:9999px;background:${BRAND.ink}">
           <a href="${input.action.url}"
              style="display:inline-block;padding:14px 30px;color:#ffffff;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:1;text-decoration:none;border-radius:9999px">${escapeHtml(input.action.label)}</a>
         </td></tr>
       </table>
       <p style="margin:0 0 20px;color:${BRAND.muted};font-size:12px;line-height:1.5;word-break:break-all">
         Se il pulsante non funziona, copia questo indirizzo nel browser:<br />
         <a href="${input.action.url}" style="color:${BRAND.muted};text-decoration:underline">${escapeHtml(input.action.url)}</a>
       </p>`
    : '';

  const outro = input.outroHtml
    ? `<div style="margin:0 0 4px;color:${BRAND.body};font-size:14px;line-height:1.6">${input.outroHtml}</div>`
    : '';

  const footerLinks = [
    `<a href="${BRAND.site}" style="color:${BRAND.muted};text-decoration:underline">${BRAND.siteLabel}</a>`,
    `<a href="mailto:${BRAND.contactEmail}" style="color:${BRAND.muted};text-decoration:underline">${BRAND.contactEmail}</a>`,
    input.privacyUrl
      ? `<a href="${input.privacyUrl}" style="color:${BRAND.muted};text-decoration:underline">Privacy</a>`
      : '',
    input.preferencesUrl
      ? `<a href="${input.preferencesUrl}" style="color:${BRAND.muted};text-decoration:underline">Preferenze notifiche</a>`
      : '',
  ]
    .filter(Boolean)
    .join(' &nbsp;·&nbsp; ');

  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(input.title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.canvas};-webkit-font-smoothing:antialiased">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.canvas};padding:28px 12px">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
             style="width:100%;max-width:600px;background:${BRAND.surface};border-radius:18px;overflow:hidden;border:1px solid ${BRAND.border};font-family:${FONT_STACK}">

        <!-- Header: logo bianco/rosso su antracite -->
        <tr>
          <td style="background:${BRAND.ink};padding:26px 32px 24px">
            <img src="${logoUrl(input.baseUrl)}" alt="${BRAND.name}"
                 width="${BRAND.logoDisplayWidth}"
                 style="display:block;border:0;height:auto;width:${BRAND.logoDisplayWidth}px;max-width:100%" />
          </td>
        </tr>
        <tr><td style="height:4px;background:${BRAND.red};font-size:0;line-height:0">&nbsp;</td></tr>

        <!-- Corpo -->
        <tr>
          <td style="padding:32px 32px 0">
            ${eyebrow}
            <h1 style="margin:0 0 16px;color:${BRAND.ink};font-size:24px;line-height:1.28;font-weight:700;letter-spacing:-0.2px">${escapeHtml(input.title)}</h1>
            <div style="color:${BRAND.body};font-size:15px;line-height:1.65">
              ${input.bodyHtml}
            </div>
            ${card}
            ${action}
            ${outro}
          </td>
        </tr>

        <!-- Firma -->
        <tr>
          <td style="padding:26px 32px 0;color:${BRAND.body};font-size:15px;line-height:1.6">
            <p style="margin:0">Un saluto,<br /><strong style="color:${BRAND.ink}">Il team ${BRAND.name}</strong></p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:26px 32px 30px">
            <div style="border-top:1px solid ${BRAND.border};margin-bottom:16px"></div>
            <p style="margin:0 0 6px;color:${BRAND.muted};font-size:12px;line-height:1.5">
              <strong style="color:${BRAND.body}">${BRAND.name}</strong> — ${BRAND.tagline}
            </p>
            <p style="margin:0;color:${BRAND.muted};font-size:12px;line-height:1.9">
              ${footerLinks}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Controparte in testo semplice. Non è un ripiego: è l'email per chi blocca
 * l'HTML, e riporta gli stessi dati con la stessa struttura.
 */
export function wrapEmailText(input: {
  eyebrow?: string | null;
  title: string;
  bodyText: string;
  card?: DetailsCard | null;
  outroText?: string | null;
  action?: EmailAction | null;
  preferencesUrl?: string | null;
}): string {
  const parts: string[] = [];

  if (input.eyebrow) parts.push(input.eyebrow.toUpperCase());
  parts.push(input.title);
  parts.push('='.repeat(Math.min(input.title.length, 60)));

  const body = input.bodyText.trim();
  if (body) parts.push(body);

  if (input.card && !isEmptyCard(input.card)) {
    parts.push(renderDetailsCardText(input.card));
  }

  if (input.action) {
    parts.push(`${input.action.label}:\n${input.action.url}`);
  }

  const outro = input.outroText?.trim();
  if (outro) parts.push(outro);

  parts.push('Un saluto,\nIl team KaiPai');
  parts.push('—');
  parts.push(`${BRAND.name} — ${BRAND.tagline}`);
  parts.push(`${BRAND.siteLabel} · ${BRAND.contactEmail}`);

  if (input.preferencesUrl) {
    parts.push(`Preferenze notifiche: ${input.preferencesUrl}`);
  }

  return parts.join('\n\n');
}
