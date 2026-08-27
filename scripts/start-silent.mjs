/**
 * La build di produzione, in locale, muta.
 *
 * **Perché non `npm run dev:silent`.** In `next dev` la dashboard admin non si
 * rende entro tre minuti: misurato che non è la rete (Supabase risponde in
 * 1-2 s), non è la compilazione (rotta già calda, 828 ms) e non sono i dati
 * (le sue quattro query fanno 3,5 s in parallelo). In produzione la stessa
 * pagina è immediata. Gli scenari end-to-end vanno quindi girati contro una
 * build vera, altrimenti si passa il tempo ad aspettare un costo che nel
 * prodotto non esiste.
 *
 * Il silenzio regge lo stesso: `areNotificationsSilenced()` guarda
 * `VERCEL_ENV`, non `NODE_ENV`, proprio perché una build locale è
 * «ottimizzata» ma non è «il sito che usano le persone».
 *
 * Prima di questo serve `npm run build`.
 */
import { spawn } from 'node:child_process';

process.env.NOTIFICATIONS_SILENCED = 'true';

console.log('');
console.log('🔇  Build di produzione locale, notifiche zittite.');
console.log('    Niente campanella, niente email, niente push.');
console.log('');

const child = spawn('npx', ['next', 'start'], {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

child.on('exit', (code) => process.exit(code ?? 0));
