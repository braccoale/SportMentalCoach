/**
 * Kai Pai — videochiamata su telefono, su due motori diversi.
 *
 * Safari iPhone e Chrome Android sbagliano in modi diversi, e sono i due casi
 * che coprono quasi tutto il traffico mobile reale: il primo sospende la pagina
 * senza passare da `visibilitychange`, il secondo la tiene viva ma toglie la
 * telecamera. Per questo il file gira lo stesso copione su WebKit (iPhone 13) e
 * su Chromium (Pixel 7) invece di fidarsi di un solo browser.
 *
 * Cosa verifica su entrambi:
 *   1.  Il pre-join si apre in versione compatta, senza scorrimento
 *       orizzontale (una barra laterale su un telefono nasconde i comandi).
 *   2.  L'istruzione "non bloccare lo schermo" è visibile prima di entrare.
 *   3.  Il browser interno di Instagram viene riconosciuto e spiegato, e su
 *       iOS l'avviso è bloccante mentre su Android resta ignorabile.
 *
 * In più, solo su Chromium (l'unico motore dove Playwright sa fingere una
 * telecamera):
 *   4.  Si entra davvero in stanza e compare l'istruzione anche lì.
 *   5.  Il ritorno da `pagehide`/`pageshow` — cioè il blocco schermo — non
 *       lascia la camera spenta in silenzio: o riparte, o compare
 *       "Riattiva videocamera".
 *
 * Prerequisiti: server dev o prod su BASE, LiveKit configurato.
 * Attenzione: crea un coach e un atleta nuovi a ogni esecuzione (e2e-mob-*).
 *
 * Run: node e2e/mobile-video.mjs
 */
import { chromium, webkit, devices } from 'playwright';
import { signup, login, completeCoachProfile } from './lib/accounts.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const stamp = Date.now();
const COACH = {
  email: `e2e-mob-coach-${stamp}@demo.smc`,
  pass: 'password1234',
  nome: 'Mobile',
  cognome: `Coach${String(stamp).slice(-5)}`,
};
const ATHLETE = {
  email: `e2e-mob-ath-${stamp}@demo.smc`,
  pass: 'password1234',
  nome: 'Mobile',
  cognome: 'Atleta',
};

const INSTAGRAM_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0';
const INSTAGRAM_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Instagram 330.0.0.0.0';

const results = [];
function ok(step, msg) {
  results.push({ step, pass: true });
  console.log(`✅ ${step}. ${msg}`);
}
function ko(step, msg) {
  results.push({ step, pass: false });
  console.log(`❌ ${step}. ${msg}`);
}

/** Una barra di scorrimento orizzontale su un telefono nasconde i comandi. */
async function hasHorizontalOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
}

/* ── Preparazione: un coach con un servizio e un atleta ──
   Con E2E_COACH_EMAIL/E2E_COACH_PASSWORD si riusa un account esistente e non
   si crea nulla: è il modo di far girare questo file contro un ambiente dove
   registrare utenti nuovi a ogni esecuzione non è accettabile. */
if (process.env.E2E_COACH_EMAIL) {
  COACH.email = process.env.E2E_COACH_EMAIL;
  COACH.pass = process.env.E2E_COACH_PASSWORD ?? COACH.pass;
  ok(0, `Uso il coach esistente ${COACH.email} (nessun utente creato)`);
} else {
  const setupBrowser = await chromium.launch();
  const setupCtx = await setupBrowser.newContext();
  const setup = await setupCtx.newPage();
  await signup(setup, COACH, 'coach', BASE);
  await completeCoachProfile(setup, COACH, BASE);
  const athCtx = await setupBrowser.newContext();
  const ath = await athCtx.newPage();
  await signup(ath, ATHLETE, 'athlete', BASE);
  ok(0, `Coach e atleta di prova creati (${COACH.email})`);
  await athCtx.close();
  await setupCtx.close();
  await setupBrowser.close();
}

/**
 * Il coach apre una sessione immediata: è la via più corta per arrivare in
 * stanza, e mette l'atleta e il coach nello stesso posto senza passare da
 * richiesta e accettazione.
 */
async function openImmediateSession(page) {
  await page.goto(`${BASE}/dashboard/coach`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Nuovo appuntamento' }).click();
  await page.getByRole('button', { name: 'Avvia sessione ora' }).click();
  await page.waitForURL(/\/dashboard\/video\/\d+/, { timeout: 45000 });
}

/* ── Prova su ciascun dispositivo ── */
async function runDevice({ engine, descriptor, label, media, firstStep }) {
  const browser = await engine.launch({
    args: media
      ? [
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
        ]
      : [],
  });
  let step = firstStep;

  // 1-2. Pre-join su telefono.
  const ctx = await browser.newContext({
    ...devices[descriptor],
    permissions: media ? ['camera', 'microphone'] : [],
  });
  const page = await ctx.newPage();
  await login(page, COACH.email, COACH.pass, BASE);
  await openImmediateSession(page);

  const instruction = page.getByTestId('screen-lock-instruction');
  const roomHint = page.getByTestId('screen-lock-hint');
  try {
    await Promise.race([
      instruction.waitFor({ state: 'visible', timeout: 30000 }),
      roomHint.waitFor({ state: 'visible', timeout: 30000 }),
    ]);
    ok(step++, `${label}: l'istruzione su schermo e app è visibile`);
  } catch {
    ko(step++, `${label}: istruzione "non bloccare lo schermo" non trovata`);
  }

  if (await hasHorizontalOverflow(page)) {
    ko(step++, `${label}: la pagina scorre in orizzontale`);
  } else {
    ok(step++, `${label}: nessuno scorrimento orizzontale`);
  }

  const videoUrl = page.url();
  await ctx.close();

  // 3. Browser interno dell'app social.
  const inAppCtx = await browser.newContext({
    ...devices[descriptor],
    userAgent: media ? INSTAGRAM_ANDROID : INSTAGRAM_IOS,
    permissions: media ? ['camera', 'microphone'] : [],
  });
  const inApp = await inAppCtx.newPage();
  await login(inApp, COACH.email, COACH.pass, BASE);
  await inApp.goto(videoUrl, { waitUntil: 'networkidle' });
  const notice = inApp.getByTestId('in-app-browser-notice');
  try {
    await notice.waitFor({ state: 'visible', timeout: 30000 });
    const severity = await notice.getAttribute('data-severity');
    const expected = media ? 'warning' : 'blocking';
    if (severity === expected) {
      ok(step++, `${label}: browser interno riconosciuto (${severity})`);
    } else {
      ko(step++, `${label}: gravità ${severity}, attesa ${expected}`);
    }
  } catch {
    ko(step++, `${label}: avviso browser interno non mostrato`);
  }
  await inAppCtx.close();

  // 4-5. Solo dove esiste una telecamera finta: ciclo di vita della pagina.
  if (media) {
    const liveCtx = await browser.newContext({
      ...devices[descriptor],
      permissions: ['camera', 'microphone'],
    });
    const live = await liveCtx.newPage();
    await login(live, COACH.email, COACH.pass, BASE);
    await live.goto(videoUrl, { waitUntil: 'networkidle' });
    // Entrata effettiva: il pre-join lascia il posto alla stanza.
    const join = live.getByRole('button', {
      name: 'Entra nella videochiamata',
    });
    if (await join.isVisible().catch(() => false)) await join.click();

    await live.waitForTimeout(4000);
    // Blocco schermo simulato: è la sequenza che manda iOS e Android in pausa.
    await live.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    });
    await live.waitForTimeout(1500);
    await live.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await live.waitForTimeout(3000);

    const suspended = live.getByTestId('camera-suspended-notice');
    const stillSuspended = await suspended.isVisible().catch(() => false);
    if (stillSuspended) {
      const button = suspended.getByRole('button', {
        name: 'Riattiva videocamera',
      });
      if (await button.isVisible()) {
        ok(step++, `${label}: camera sospesa dichiarata, con pulsante di ripristino`);
      } else {
        ko(step++, `${label}: avviso senza pulsante di ripristino`);
      }
    } else {
      ok(step++, `${label}: la camera è ripartita da sola dopo pagehide/pageshow`);
    }
    await liveCtx.close();
  }

  await browser.close();
  return step;
}

let next = 1;
next = await runDevice({
  engine: webkit,
  descriptor: 'iPhone 13',
  label: 'Safari iPhone',
  media: false,
  firstStep: next,
});
next = await runDevice({
  engine: chromium,
  descriptor: 'Pixel 7',
  label: 'Chrome Android',
  media: true,
  firstStep: next,
});

const failed = results.filter((r) => !r.pass).length;
console.log(
  `\n${results.length - failed}/${results.length} verifiche superate`
);
process.exit(failed === 0 ? 0 : 1);
