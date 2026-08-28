/**
 * Il server di sviluppo, muto.
 *
 * Serve agli scenari end-to-end. Ogni loro giro registra un coach, e ogni
 * registrazione avvisa **tutti** gli amministratori: il 2026-08-27 sette giri
 * hanno prodotto trenta notifiche a persone reali, piu' le email. Lanciare le
 * prove contro un server normale significa disturbare qualcuno ogni volta.
 *
 * Perche' un wrapper e non `NOTIFICATIONS_SILENCED=true npm run dev`: quella
 * forma non funziona su Windows, dove sta il progetto, e aggiungere
 * `cross-env` come dipendenza per una riga sarebbe sproporzionato. Node c'e'
 * gia' e la variabile passa al processo figlio per eredita'.
 *
 * Il silenzio vale solo fuori dalla produzione: il doppio controllo sta in
 * `areNotificationsSilenced()`, non qui.
 */
import { spawn } from 'node:child_process';

process.env.NOTIFICATIONS_SILENCED = 'true';

console.log('');
console.log('🔇  Notifiche zittite: niente campanella, niente email, niente push.');
console.log('    Questo server e` per le prove. Per lo sviluppo normale: npm run dev');
console.log('');

const child = spawn('npx', ['next', 'dev', '--turbopack'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

child.on('exit', (code) => process.exit(code ?? 0));
