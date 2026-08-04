/**
 * Genera l'HTML delle email di autenticazione con la grafica KaiPai.
 *
 *   pnpm email:supabase-auth
 *
 * Perché uno script separato. La verifica dell'indirizzo e il recupero
 * password NON passano dal nostro codice: li invia Supabase Auth
 * (`supabase.auth.resetPasswordForEmail`), che usa i propri template. Non
 * possiamo quindi allinearle come le altre — possiamo però produrre l'HTML
 * corretto e incollarlo una volta nel dashboard Supabase, così anche quelle
 * email hanno logo, colori e firma KaiPai.
 *
 * I segnaposto NON sono i nostri: sono quelli di Supabase (`{{ .ConfirmationURL }}`
 * e simili), interpolati dal loro motore. Vengono inseriti dopo il rendering,
 * così il nostro renderer non li vede e non li rifiuta.
 *
 * Output in `tmp/supabase-auth-emails/`. Da incollare in:
 *   Supabase → Authentication → Emails → (Confirm signup / Reset password)
 *
 * Nota: perché il logo si veda, `public/email/kaipai-logo.png` deve essere
 * raggiungibile in produzione all'indirizzo indicato da BASE_URL.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { wrapEmailHtml, wrapEmailText } from '@/lib/core/email/layout';

const OUT_DIR = 'tmp/supabase-auth-emails';
const BASE_URL = process.env.BASE_URL?.trim() || 'https://www.kaipaicoach.com';

/** Segnaposto Supabase, protetti dal rendering: inseriti a valle. */
const CONFIRMATION_URL = '{{ .ConfirmationURL }}';

const p = (text: string) => `<p style="margin:0 0 14px">${text}</p>`;

const EMAILS = [
  {
    file: 'confirm-signup',
    supabaseTemplate: 'Confirm signup',
    subject: 'Conferma il tuo indirizzo email',
    eyebrow: 'Verifica account',
    title: 'Conferma il tuo indirizzo email',
    paragraphs: [
      'Benvenuto su KaiPai. Manca solo un passaggio: conferma che questo indirizzo è davvero tuo.',
      'Il link è personale e scade dopo poco tempo.',
    ],
    actionLabel: 'Conferma l’indirizzo',
    outro:
      'Se non hai creato tu un account KaiPai, ignora questa email: non verrà attivato nulla.',
  },
  {
    file: 'reset-password',
    supabaseTemplate: 'Reset password',
    subject: 'Reimposta la tua password KaiPai',
    eyebrow: 'Recupero password',
    title: 'Reimposta la tua password',
    paragraphs: [
      'Hai chiesto di reimpostare la password del tuo account KaiPai.',
      'Il link qui sotto è valido una sola volta e scade dopo poco tempo.',
    ],
    actionLabel: 'Scegli una nuova password',
    outro:
      'Se non hai richiesto tu il cambio password, ignora questa email: la password attuale resta valida. Se il dubbio persiste, scrivici a info@kaipaicoach.com.',
  },
  {
    file: 'magic-link',
    supabaseTemplate: 'Magic Link',
    subject: 'Il tuo link di accesso a KaiPai',
    eyebrow: 'Accesso',
    title: 'Il tuo link di accesso',
    paragraphs: [
      'Usa il pulsante qui sotto per entrare nel tuo account KaiPai.',
      'Il link è personale, vale una sola volta e scade dopo poco tempo.',
    ],
    actionLabel: 'Entra in KaiPai',
    outro:
      'Se non hai chiesto tu questo accesso, ignora l’email e non condividere il link con nessuno.',
  },
  {
    file: 'email-change',
    supabaseTemplate: 'Change Email Address',
    subject: 'Conferma il tuo nuovo indirizzo email',
    eyebrow: 'Cambio email',
    title: 'Conferma il tuo nuovo indirizzo',
    paragraphs: [
      'Hai chiesto di cambiare l’indirizzo email del tuo account KaiPai.',
      'Conferma il nuovo indirizzo per completare la modifica.',
    ],
    actionLabel: 'Conferma il nuovo indirizzo',
    outro:
      'Se non hai richiesto tu questa modifica, scrivici subito a info@kaipaicoach.com.',
  },
] as const;

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const email of EMAILS) {
    const action = { label: email.actionLabel, url: CONFIRMATION_URL };

    const html = wrapEmailHtml({
      preview: email.paragraphs[0],
      eyebrow: email.eyebrow,
      title: email.title,
      bodyHtml: email.paragraphs.map(p).join('\n'),
      outroHtml: `<p style="margin:0 0 8px">${email.outro}</p>`,
      action,
      // Le email di autenticazione non hanno preferenze da gestire: non sono
      // notifiche, non si possono disattivare.
      preferencesUrl: null,
      privacyUrl: `${BASE_URL}/privacy`,
      baseUrl: BASE_URL,
    });

    const text = wrapEmailText({
      eyebrow: email.eyebrow,
      title: email.title,
      bodyText: email.paragraphs.join('\n\n'),
      outroText: email.outro,
      action,
    });

    await writeFile(`${OUT_DIR}/${email.file}.html`, html, 'utf8');
    await writeFile(
      `${OUT_DIR}/${email.file}.txt`,
      `Oggetto: ${email.subject}\n\n${text}`,
      'utf8'
    );

    console.log(`✓ ${email.file}  →  Supabase: "${email.supabaseTemplate}"`);
    console.log(`  Oggetto: ${email.subject}`);
  }

  console.log(
    `\nScritte in ${OUT_DIR}/.\n` +
      'Incolla ogni .html in Supabase → Authentication → Emails, nel template indicato,\n' +
      'e imposta l’oggetto riportato sopra.'
  );
}

main().catch((error) => {
  console.error('Generazione fallita:', error);
  process.exit(1);
});
