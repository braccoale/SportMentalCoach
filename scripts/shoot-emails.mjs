/**
 * Screenshot delle anteprime email generate da `pnpm email:preview`.
 *
 *   pnpm email:shoot
 *
 * Apre ogni .html in Chromium a larghezza desktop e salva un PNG a fianco.
 * Serve al controllo visivo: l'HTML delle email è pieno di tabelle annidate e
 * stili inline, e l'unico modo onesto di verificarne l'impaginazione è
 * guardarla.
 */

import { chromium } from 'playwright';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = 'tmp/email-preview';

const only = process.argv.slice(2);
const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.html') && f !== 'index.html')
  .filter((f) => only.length === 0 || only.includes(f.replace('.html', '')));

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 760, height: 1200 },
  deviceScaleFactor: 2,
});

for (const file of files) {
  await page.goto(`file://${resolve(DIR, file).replace(/\\/g, '/')}`);
  // Le immagini remote (il logo) non caricano da file://: attendo comunque il
  // layout, che è ciò che va verificato.
  await page.waitForLoadState('networkidle').catch(() => {});
  const out = resolve(DIR, file.replace('.html', '.png'));
  await page.screenshot({ path: out, fullPage: true });
  console.log(`✓ ${file.replace('.html', '.png')}`);
}

await browser.close();
