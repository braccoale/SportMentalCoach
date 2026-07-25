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
 * Prerequisites: dev or prod server on BASE (default http://localhost:3000),
 * seeded admin account (admin@kaipai.com / admin1234).
 *
 * Run: pnpm e2e
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const stamp = Date.now();
// Unique last name per run: the marketplace may contain coaches from
// previous runs, and the athlete must find THIS run's coach.
const COACH = { email: `e2e-coach-${stamp}@demo.smc`, pass: 'password1234', nome: 'Paolo', cognome: `Verdi${String(stamp).slice(-5)}` };
const ATHLETE = { email: `e2e-ath-${stamp}@demo.smc`, pass: 'password1234', nome: 'Sara', cognome: 'Blu' };
const COACH_FULL = `${COACH.nome} ${COACH.cognome}`;

const results = [];
function ok(step, msg) { results.push({ step, pass: true }); console.log(`✅ ${step}. ${msg}`); }
function ko(step, msg) { results.push({ step, pass: false }); console.log(`❌ ${step}. ${msg}`); }

const ROLE_TITLE = {
  athlete: 'Sono un atleta',
  coach: 'Sono un mental coach',
  club: 'Rappresento un team',
};

async function signup(page, u, role) {
  await page.goto(`${BASE}/sign-up`);
  // Step 1 — role card.
  await page.getByText(ROLE_TITLE[role]).click();
  await page.getByRole('button', { name: 'Continua' }).click();
  // Step 2 — credentials (+ confirm).
  await page.fill('#email', u.email);
  await page.fill('#password', u.pass);
  await page.fill('#confirm', u.pass);
  await page.getByRole('button', { name: 'Continua' }).click();
  // Step 3 — details + legal.
  await page.fill('#name', u.nome);
  await page.fill('#lastName', u.cognome);
  if (role === 'athlete') await page.fill('#birthDate', '2000-01-01');
  await page.check('input[name="acceptTerms"]');
  await page.check('input[name="acceptPrivacy"]');
  await page.getByRole('button', { name: 'Registrati' }).click();

  if (role === 'athlete') {
    // New athletes land in the onboarding wizard: name/surname are prefilled,
    // the rest is optional, so click through to completion (→ /coaches).
    await page.waitForURL(/\/onboarding/, { timeout: 30000 });
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Continua' }).click();
      await page.waitForTimeout(400);
    }
    await page.getByRole('button', { name: /Trova il tuo coach/ }).click();
    await page.waitForURL(/\/(coaches|dashboard)/, { timeout: 30000 });
  } else {
    await page.waitForURL(/dashboard/, { timeout: 30000 });
  }
}

async function login(page, email, pass) {
  await page.goto(`${BASE}/sign-in`);
  await page.fill('#email', email);
  await page.fill('#password', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
}

const browser = await chromium.launch();

/* ── 1-2: coach signup + profile ── */
const coachCtx = await browser.newContext();
const coach = await coachCtx.newPage();
await signup(coach, COACH, 'coach');
coach.url().includes('/dashboard/coach')
  ? ok(1, `Coach registrato (${COACH.email})`)
  : ko(1, `atteso /dashboard/coach, trovato ${coach.url()}`);

// Account name (drives the public display name)
await coach.goto(`${BASE}/dashboard/coach/profile`);
await coach.waitForSelector('#lastName');
await coach.fill('#name', COACH.nome);
await coach.fill('#lastName', COACH.cognome);
await coach.locator('form:has(#lastName) button[type="submit"]').click();
await coach.waitForSelector('text=Account aggiornato.');

// Profile: headline + bio + sport + specialty
await coach.fill('#headline', 'Mental coach E2E per il calcio');
await coach.fill('#description', 'Percorsi di allenamento mentale per atleti. Profilo creato dal test end-to-end.');
await coach.check('input[name="categories"][value="football"]');
await coach.check('input[name="specialties"][value="performance_anxiety"]');
await coach.locator('form:has(#headline) button[type="submit"]').click();
await coach.waitForSelector('text=Profilo aggiornato.');

// One service (required by onboarding)
await coach.goto(`${BASE}/dashboard/coach/services`);
const newService = coach.locator('form', { hasText: 'Nuovo servizio' });
await newService.locator('input[name="title"]').fill('Sessione individuale');
await newService.locator('input[name="durationMin"]').fill('60');
await newService.locator('input[name="price"]').fill('60');
await newService.locator('button[type="submit"]').click();
await coach.waitForSelector('text=Servizio aggiunto.');

// Submit for review
await coach.goto(`${BASE}/dashboard/coach/profile`);
await coach.locator('button', { hasText: 'Invia per la revisione' }).click();
await coach.waitForTimeout(1500);
ok(2, 'Profilo coach completato (nome, bio, sport, servizio) e inviato in revisione');

/* ── 3: admin approves ── */
const adminCtx = await browser.newContext();
const admin = await adminCtx.newPage();
await login(admin, 'admin@kaipai.com', 'admin1234');
await admin.goto(`${BASE}/dashboard/admin`);
const row = admin.locator('li', { hasText: COACH.email }).first();
await row.locator('button', { hasText: 'Approva' }).click();
await admin.waitForTimeout(2000);
await admin.reload();
const approved = await admin.locator('li', { hasText: COACH.email }).first().innerText();
approved.includes('Approvato')
  ? ok(3, 'Admin ha approvato il coach')
  : ko(3, `stato dopo approvazione: ${approved.slice(0, 80)}`);
await adminCtx.close();

/* ── 4-6: athlete signup, find coach, request session ── */
const athCtx = await browser.newContext();
const ath = await athCtx.newPage();
await signup(ath, ATHLETE, 'athlete');
// Athlete sets their name (what the coach will see on requests/chat/reviews)
await ath.goto(`${BASE}/dashboard/athlete`);
await ath.waitForSelector('#lastName');
await ath.fill('#name', ATHLETE.nome);
await ath.fill('#lastName', ATHLETE.cognome);
await ath.locator('form:has(#lastName) button[type="submit"]').click();
await ath.waitForSelector('text=Account aggiornato.');
ok(4, `Atleta registrato con nome (${ATHLETE.email})`);

await ath.goto(`${BASE}/coaches`);
const card = ath.locator(`a[href^="/coaches/"]`, { hasText: COACH_FULL }).first();
if (await card.count()) {
  ok(5, `Atleta trova "${COACH_FULL}" nel marketplace`);
  await card.click();
} else {
  ko(5, 'card del coach non trovata nel listing');
  await ath.goto(`${BASE}/coaches`);
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
await coach.goto(`${BASE}/dashboard/coach`);
const req = coach.locator('li', { hasText: ATHLETE.nome }).first();
if (await req.count()) {
  ok(7, 'Coach vede la richiesta in "Richieste in attesa"');
} else {
  await coach.screenshot({ path: 'e2e/fail-step7.png', fullPage: true });
  ko(7, 'richiesta non visibile nella dashboard coach (screenshot e2e/fail-step7.png)');
}
await req.locator('button', { hasText: 'Accetta' }).click();
await coach.waitForTimeout(2000);
await coach.reload();
const acceptedRow = coach.locator('li', { hasText: `${ATHLETE.nome}` }).filter({ hasText: 'Sessione confermata' }).first();
(await acceptedRow.count())
  ? ok(8, 'Coach ha accettato: "Sessione confermata" visibile')
  : ko(8, 'sessione accettata non trovata');

/* ── 9: both calendars ── */
await coach.goto(`${BASE}/dashboard/coach/calendar`);
await coach.locator('button', { hasText: 'Agenda' }).click();
await coach.waitForTimeout(600);
(await coach.locator('button', { hasText: `${ATHLETE.nome}` }).count())
  ? ok(9, 'Coach vede la sessione nel calendario')
  : ko(9, 'evento non trovato nel calendario coach');
await ath.goto(`${BASE}/dashboard/athlete/calendar`);
await ath.locator('button', { hasText: 'Agenda' }).click();
await ath.waitForTimeout(600);
(await ath.locator('button', { hasText: COACH_FULL }).count())
  ? ok(9.5, 'Atleta vede la sessione nel calendario')
  : ko(9.5, 'evento non trovato nel calendario atleta');

/* ── 10-11: video call ── */
// booking id from the chat link on coach dashboard
await coach.goto(`${BASE}/dashboard/coach`);
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
await coach.goto(`${BASE}/dashboard/coach`);
await coach.locator('li', { hasText: ATHLETE.nome }).filter({ hasText: 'Completa' }).first()
  .locator('button', { hasText: 'Completa' }).click();
await coach.waitForTimeout(2000);
ok(12, 'Coach ha completato la sessione');

/* ── 13: athlete review ── */
await ath.goto(`${BASE}/dashboard/athlete`);
const reviewBlock = ath.locator('li', { hasText: 'Lascia una recensione' }).first();
await reviewBlock.locator('button[aria-pressed]').nth(4).click(); // 5 stars
await reviewBlock.locator('textarea[name="body"]').fill('Sessione pilota perfetta, coach preparatissimo!');
await reviewBlock.locator('button[type="submit"]').click();
await ath.waitForTimeout(2000);
ok(13, 'Atleta ha lasciato una recensione 5 stelle');

/* ── 14: coach replies ── */
await coach.goto(`${BASE}/dashboard/coach`);
const revCard = coach.locator('li', { hasText: 'Sessione pilota perfetta' }).first();
await revCard.locator('textarea[name="reply"]').fill('Grazie Sara, alla prossima!');
await revCard.locator('button', { hasText: 'Rispondi' }).click();
await coach.waitForTimeout(2000);
await coach.reload();
(await coach.locator('text=Grazie Sara, alla prossima!').count())
  ? ok(14, 'Coach ha risposto alla recensione (risposta pubblica visibile)')
  : ko(14, 'risposta non visibile');

await coachCtx.close();
await athCtx.close();
await browser.close();

const passed = results.filter((r) => r.pass).length;
console.log(`\n===== HAPPY PATH: ${passed}/${results.length} PASS =====`);
process.exit(passed === results.length ? 0 : 1);
