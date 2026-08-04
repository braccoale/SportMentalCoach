/**
 * Genera l'asset logo usato nell'header delle email.
 *
 *   pnpm email:build-logo
 *
 * Sorgente: public/logo-transparent.png — il lockup bianco/rosso su
 * trasparente, l'unica variante leggibile sull'header antracite.
 *
 * Perché un asset dedicato invece di puntare al file esistente: l'originale è
 * 1672×941 con circa un terzo di area vuota e pesa 189 KB. Nelle email conta
 * sia il peso (alcuni client scaricano tutto prima di mostrare qualcosa) sia il
 * fatto che il logo deve essere ritagliato al contenuto, altrimenti il padding
 * trasparente lo fa sembrare disallineato rispetto al testo.
 *
 * Renderizzato a 220px di larghezza, quindi l'asset è 2× per i display retina.
 * Rieseguibile: sovrascrive sempre l'output con lo stesso risultato.
 */

import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SOURCE = 'public/logo-transparent.png';
const OUT_DIR = 'public/email';
const OUT = `${OUT_DIR}/kaipai-logo.png`;
const TARGET_WIDTH = 440; // 220px @2x

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const info = await sharp(SOURCE)
    // Toglie il padding trasparente attorno al lockup. Soglia bassa: il logo
    // ha bordi antialiasati che non vanno mangiati.
    .trim({ threshold: 5 })
    .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toFile(OUT);

  console.log(
    `✓ ${OUT} — ${info.width}×${info.height}, ${(info.size / 1024).toFixed(1)} KB`
  );
}

main().catch((error) => {
  console.error('Generazione del logo email fallita:', error);
  process.exit(1);
});
