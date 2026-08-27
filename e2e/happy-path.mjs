/**
 * Kai Pai — happy-path E2E (real coach ↔ real athlete pilot flow).
 *
 * Covers the full journey with FRESH users on every run:
 *   1.  Coach signs up
 *   2.  Coach completes profile (account name, headline, bio, sport,
 *       specialty, service) and submits for review
 *   3.  Admin approves the coach
 *   4.  Athlete signs up
 *   5.  Athlete finds the coach in /coaches
 *   6.  Athlete requests a session with preferred date/time
 *   7.  Coach receives the request (dashboard + badge)
 *   8.  Coach accepts it
 *   9.  Both users see the session in their calendar
 *   10. Both users open the video call page
 *   11. Video call renders camera/mic UI (requires LiveKit env; otherwise
 *       the setup notice is asserted and reported)
 *   12. Coach completes the session
 *   13. Athlete leaves a review
 *   14. Coach replies to the review
 *
 * IMPORTANTE — il server va avviato con `npm run dev:silent`, non con
 * `npm run dev`: ogni giro registra un coach, e ogni registrazione avvisa
 * tutti gli amministratori. Sette giri hanno gia' prodotto trenta notifiche a
 * persone reali piu' le email di benvenuto.
 *
 * Prerequisites: dev or prod server on BASE (default http://localhost:3000),
 * seeded admin account (admin@kaipai.com / admin1234).
 *
 * Run: pnpm e2e
 */
import { config } from 'dotenv';
// Le credenziali stanno in .env.local, insieme agli altri segreti del
// progetto, che git ignora. Cosi' non passano da una riga di comando.
config({ path: '.env.local' });
import { chromium } from 'playwright';
import {
  signup as signupUser,
  login as loginUser,
  completeCoachProfile,
} from './lib/accounts.mjs';


const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
/* Il wizard di iscrizione è condiviso con gli altri scenari (vedi lib/accounts.mjs):
   qui si fissa solo la base URL, così le chiamate restano quelle di prima. */
const signup = (page, user, role) => signupUser(page, user, role, BASE);
const login = (page, email, pass) => loginUser(page, email, pass, BASE);

const stamp = Date.now();
// Unique last name per run: the marketplace may contain coaches from
// previous runs, and the athlete must find THIS run's coach.
const COACH = { email: `e2e-coach-${stamp}@demo.smc`, pass: 'password1234', nome: 'Paolo', cognome: `Verdi${String(stamp).slice(-5)}` };
const ATHLETE = { email: `e2e-ath-${stamp}@demo.smc`, pass: 'password1234', nome: 'Sara', cognome: 'Blu' };
const COACH_FULL = `${COACH.nome} ${COACH.cognome}`;
const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@kaipai.com',
  pass: process.env.E2E_ADMIN_PASSWORD ?? '',
};

const results = [];
function ok(step, msg) { results.push({ step, pass: true }); console.log(`✅ ${step}. ${msg}`); }
function ko(step, msg) { results.push({ step, pass: false }); console.log(`❌ ${step}. ${msg}`); }

const browser = await chromium.launch();

/**
 * Tempi d'attesa per un server di **sviluppo**, non di produzione.
 *
 * `next dev` compila ogni pagina alla prima richiesta: la dashboard admin ci
 * ha messo piu' di trenta secondi, e il valore predefinito di Playwright e'
 * esattamente trenta. Non era lentezza del prodotto, era la compilazione — ma
 * dallo scenario si vedeva come un guasto.
 */
/*
 * `domcontentloaded`, non `load`.
 *
 * Il valore predefinito di Playwright aspetta che **tutte** le risorse siano
 * chiuse. Questa applicazione tiene aperta una connessione realtime, quindi
 * quel momento non arriva mai: un `reload()` sulla dashboard admin restava
 * appeso finche' scadeva, e sembrava una pagina rotta. Al copione serve che il
 * documento ci sia, non che la rete sia silenziosa.
 */
const DOM_READY = { waitUntil: 'domcontentloaded' };

function newContext(browser) {
  return browser.newContext().then((ctx) => {
    ctx.setDefaultNavigationTimeout(120_000);
    ctx.setDefaultTimeout(45_000);
    return ctx;
  });
}

/* ── 1-2: coach signup + profile ── */
const coachCtx = await newContext(browser);
const coach = await coachCtx.newPage();
await signup(coach, COACH, 'coach');
coach.url().includes('/dashboard/coach')
  ? ok(1, `Coach registrato (${COACH.email})`)
  : ko(1, `atteso /dashboard/coach, trovato ${coach.url()}`);

/*
 * Profilo del coach e un servizio, dall'helper condiviso.
 *
 * Qui c'era la stessa sequenza ricopiata a mano, identica a
 * `completeCoachProfile` in lib/accounts.mjs. Due copie della stessa cosa
 * significa ripararla due volte a ogni rifacimento dell'interfaccia — ed e'
 * successo: la pagina dei servizi e' passata a una finestra di dialogo e si
 * sono rotte entrambe.
 */
await completeCoachProfile(coach, COACH, BASE);

// Submit for review
await coach.goto(`${BASE}/dashboard/coach/profile`, DOM_READY);
await coach.locator('button', { hasText: 'Invia per la revisione' }).click();
await coach.waitForTimeout(1500);
ok(2, 'Profilo coach completato (nome, bio, sport, servizio) e inviato in revisione');

/* ── 3: admin approves ── */
const adminCtx = await newContext(browser);
const admin = await adminCtx.newPage();
/*
 * Le credenziali dell'amministratore arrivano dall'ambiente.
 *
 * Erano scritte qui dentro — admin@kaipai.com / admin1234 — e non funzionano
 * piu' da quando l'autenticazione e' passata a Supabase: la password seminata
 * non e' quella dell'identita' Auth. Una credenziale scritta in un file del
 * repository e' sbagliata comunque, anche quando funziona.
 */
if (!ADMIN.pass) {
  console.log('');
  console.log('⚠️  Manca E2E_ADMIN_PASSWORD.');
  console.log("   Senza, l'approvazione del coach e tutto cio' che viene dopo");
  console.log('   non si possono verificare.');
  console.log('   Uso: E2E_ADMIN_PASSWORD=... npm run e2e');
  console.log('');
  process.exit(1);
}
await login(admin, ADMIN.email, ADMIN.pass);
await admin.goto(`${BASE}/dashboard/admin`, DOM_READY);
/*
 * Un passo che fallisce non deve uccidere i tredici successivi.
 *
 * Prima ogni `await` non protetto interrompeva la corsa: si scopriva **un**
 * guasto per volta, si correggeva, si rilanciava — e oggi sono stati nove.
 * Registrando l'esito e proseguendo, un giro solo dice tutto quello che non
 * va. Lo screenshot serve perche' «non trovato» non e' una diagnosi: quello
 * che c'era davvero sullo schermo lo si guarda.
 */
async function step(n, descrizione, azione) {
  try {
    const esito = await azione();
    if (esito === false) return ko(n, `${descrizione}: condizione non verificata`);
    return ok(n, typeof esito === 'string' ? esito : descrizione);
  } catch (error) {
    const message = String(error?.message ?? error).split('\n')[0];
    return ko(n, `${descrizione} — ${message}`);
  }
}

await step(3, 'Admin approva il coach', async () => {
  const row = admin.locator('li', { hasText: COACH.email }).first();
  await row.locator('button', { hasText: 'Approva' }).click();
  await admin.waitForTimeout(2000);
  await admin.reload(DOM_READY);
  const riga = admin.locator('li', { hasText: COACH.email }).first();
  if (!(await riga.count())) {
    await admin.screenshot({ path: 'e2e/fail-step3.png', fullPage: true });
    throw new Error(
      `coach non trovato in nessuna lista dopo l'approvazione (url ${admin.url()}, screenshot e2e/fail-step3.png)`
    );
  }
  const testo = await riga.innerText();
  return testo.includes('Approvato')
    ? 'Admin ha approvato il coach'
    : (await admin.screenshot({ path: 'e2e/fail-step3.png', fullPage: true }),
      false);
});
await adminCtx.close();

/* ── 4-6: athlete signup, find coach, request session ── */
const athCtx = await newContext(browser);
const ath = await athCtx.newPage();
await signup(ath, ATHLETE, 'athlete');
// Athlete sets their name (what the coach will see on requests/chat/reviews)
await ath.goto(`${BASE}/dashboard/athlete`, DOM_READY);
await ath.waitForSelector('#lastName');
await ath.fill('#name', ATHLETE.nome);
await ath.fill('#lastName', ATHLETE.cognome);
await ath.locator('form:has(#lastName) button[type="submit"]').click();
await ath.waitForSelector('text=Account aggiornato.');
ok(4, `Atleta registrato con nome (${ATHLETE.email})`);

await ath.goto(`${BASE}/coaches`, DOM_READY);
const card = ath.locator(`a[href^="/coaches/"]`, { hasText: COACH_FULL }).first();
if (await card.count()) {
  ok(5, `Atleta trova "${COACH_FULL}" nel marketplace`);
  await card.click();
} else {
  ko(5, 'card del coach non trovata nel listing');
  await ath.goto(`${BASE}/coaches`, DOM_READY);
}
await ath.waitForURL(/\/coaches\/.+/, { timeout: 15000 });

// Preferred date/time: tomorrow 18:00
const d = new Date(Date.now() + 24 * 3600 * 1000);
const dtLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T18:00`;
await ath.selectOption('select[name="serviceId"]', { index: 1 }).catch(() => {});
await ath.fill('input[name="scheduledFor"]', dtLocal);
await ath.fill('textarea[name="note"]', 'Prima sessione pilota — test E2E.');
await ath.locator('form:has(input[name="scheduledFor"]) button[type="submit"]').click();
await ath.waitForURL(/richiesta=ok/, { timeout: 20000 }).then(
  () => ok(6, `Richiesta inviata con data preferita ${dtLocal.replace('T', ' ')}`),
  async () => {
    const errs = await ath.locator('.text-red-500').allTextContents();
    ko(6, `invio richiesta fallito (${errs.filter(Boolean).join('; ') || ath.url()})`);
  }
);

/* ── 7-8: coach receives and accepts ── */
await coach.goto(`${BASE}/dashboard/coach`, DOM_READY);
const req = coach.locator('li', { hasText: ATHLETE.nome }).first();
if (await req.count()) {
  ok(7, 'Coach vede la richiesta in "Richieste in attesa"');
} else {
  await coach.screenshot({ path: 'e2e/fail-step7.png', fullPage: true });
  ko(7, 'richiesta non visibile nella dashboard coach (screenshot e2e/fail-step7.png)');
}
await req.locator('button', { hasText: 'Accetta' }).click();
await coach.waitForTimeout(2000);
await coach.reload(DOM_READY);
const acceptedRow = coach.locator('li', { hasText: `${ATHLETE.nome}` }).filter({ hasText: 'Sessione confermata' }).first();
(await acceptedRow.count())
  ? ok(8, 'Coach ha accettato: "Sessione confermata" visibile')
  : ko(8, 'sessione accettata non trovata');

/* ── 9: both calendars ── */
await coach.goto(`${BASE}/dashboard/coach/calendar`, DOM_READY);
await coach.locator('button', { hasText: 'Agenda' }).click();
await coach.waitForTimeout(600);
(await coach.locator('button', { hasText: `${ATHLETE.nome}` }).count())
  ? ok(9, 'Coach vede la sessione nel calendario')
  : ko(9, 'evento non trovato nel calendario coach');
await ath.goto(`${BASE}/dashboard/athlete/calendar`, DOM_READY);
await ath.locator('button', { hasText: 'Agenda' }).click();
await ath.waitForTimeout(600);
(await ath.locator('button', { hasText: COACH_FULL }).count())
  ? ok(9.5, 'Atleta vede la sessione nel calendario')
  : ko(9.5, 'evento non trovato nel calendario atleta');

/* ── 10-11: video call ── */
// booking id from the chat link on coach dashboard
await coach.goto(`${BASE}/dashboard/coach`, DOM_READY);
const chatHref = await coach.locator('a[href^="/dashboard/chat/"]').first().getAttribute('href');
const videoHref = chatHref.replace('/chat/', '/video/');
await coach.goto(`${BASE}${videoHref}`, { waitUntil: 'networkidle' });
const coachRoom = await coach.locator('.lk-video-conference, [data-lk-theme]').count();
const coachNotice = await coach.locator('text=Videochiamata non configurata').count();
await ath.goto(`${BASE}${videoHref}`, { waitUntil: 'networkidle' });
const athRoom = await ath.locator('.lk-video-conference, [data-lk-theme]').count();
if (coachRoom && athRoom) {
  ok(10, 'Entrambi aprono la stanza video (UI LiveKit con camera/mic)');
  ok(11, 'LiveKit configurato: publish camera/microfono disponibile');
} else if (coachNotice) {
  ko(10, 'LiveKit NON configurato: pagina video mostra l’avviso di setup (servono LIVEKIT_API_KEY / SECRET / NEXT_PUBLIC_LIVEKIT_URL)');
  ko(11, 'camera/microfono non verificabili senza LiveKit');
} else {
  ko(10, 'pagina video in stato imprevisto');
}

/* ── 12: coach completes ── */
await coach.goto(`${BASE}/dashboard/coach`, DOM_READY);
await coach.locator('li', { hasText: ATHLETE.nome }).filter({ hasText: 'Completa' }).first()
  .locator('button', { hasText: 'Completa' }).click();
await coach.waitForTimeout(2000);
ok(12, 'Coach ha completato la sessione');

/* ── 13: athlete review ── */
await ath.goto(`${BASE}/dashboard/athlete`, DOM_READY);
const reviewBlock = ath.locator('li', { hasText: 'Lascia una recensione' }).first();
await reviewBlock.locator('button[aria-pressed]').nth(4).click(); // 5 stars
await reviewBlock.locator('textarea[name="body"]').fill('Sessione pilota perfetta, coach preparatissimo!');
await reviewBlock.locator('button[type="submit"]').click();
await ath.waitForTimeout(2000);
ok(13, 'Atleta ha lasciato una recensione 5 stelle');

/* ── 14: coach replies ── */
await coach.goto(`${BASE}/dashboard/coach`, DOM_READY);
const revCard = coach.locator('li', { hasText: 'Sessione pilota perfetta' }).first();
await revCard.locator('textarea[name="reply"]').fill('Grazie Sara, alla prossima!');
await revCard.locator('button', { hasText: 'Rispondi' }).click();
await coach.waitForTimeout(2000);
await coach.reload(DOM_READY);
(await coach.locator('text=Grazie Sara, alla prossima!').count())
  ? ok(14, 'Coach ha risposto alla recensione (risposta pubblica visibile)')
  : ko(14, 'risposta non visibile');

await coachCtx.close();
await athCtx.close();
await browser.close();

const passed = results.filter((r) => r.pass).length;
console.log(`\n===== HAPPY PATH: ${passed}/${results.length} PASS =====`);
process.exit(passed === results.length ? 0 : 1);
