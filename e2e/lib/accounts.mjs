/**
 * Registrazione e accesso, condivisi fra gli scenari E2E.
 *
 * Stanno qui perché ogni scenario parte da utenti nuovi: duplicare il wizard di
 * iscrizione in ogni script significherebbe aggiornarlo in più punti ogni volta
 * che cambia un passaggio dell'onboarding.
 */

export const ROLE_TITLE = {
  athlete: 'Sono un atleta',
  coach: 'Sono un mental coach',
  club: 'Rappresento un team',
};

export async function signup(page, user, role, base) {
  await page.goto(`${base}/sign-up`);
  // Step 1 — role card.
  await page.getByText(ROLE_TITLE[role]).click();
  await page.getByRole('button', { name: 'Continua', exact: true }).click();
  // Step 2 — credentials (+ confirm).
  await page.fill('#email', user.email);
  await page.fill('#password', user.pass);
  await page.fill('#confirm', user.pass);
  await page.getByRole('button', { name: 'Continua', exact: true }).click();
  // Step 3 — details + legal.
  await page.fill('#name', user.nome);
  await page.fill('#lastName', user.cognome);
  // La data di nascita la chiedono tutti i ruoli, per ragioni diverse: sotto i
  // 15 anni l'atleta non entra, sotto i 18 il professionista non puo' firmare
  // le clausole vessatorie. Qui era condizionata all'atleta, e dal momento in
  // cui il campo e' comparso anche al coach lo scenario si fermava al terzo
  // passo con il pulsante disabilitato e nessun errore a dirlo.
  await page.fill('#birthDate', '2000-01-01');
  /*
   * I consensi si spuntano dalla casella visibile, non dai campi del modulo.
   *
   * Qui c'era `check('input[name="acceptTerms"]')` e lo stesso per la privacy.
   * Ma `acceptTerms` e `acceptPrivacy` sono due input **nascosti**, pilotati da
   * un'unica casella che non ha un `name`: Playwright si rifiuta di cliccare un
   * elemento invisibile, quindi lo scenario moriva qui. Un'unica spunta accende
   * entrambi i campi, come per l'utente.
   */
  await page.getByRole('checkbox', { name: /Ho letto e accetto/ }).check();
  // L'approvazione specifica delle clausole vessatorie (artt. 1341-1342 c.c.)
  // compare solo ai professionisti, e senza di essa "Registrati" resta spento.
  // Non era mai stata spuntata: il coach non riusciva a registrarsi.
  if (role !== 'athlete') {
    await page.getByRole('checkbox', { name: /Approvo specificamente/ }).check();
  }
  await page.getByRole('button', { name: 'Registrati' }).click();

  if (role === 'athlete') {
    // New athletes land in the onboarding wizard: name/surname are prefilled,
    // the rest is optional, so click through to completion (→ /coaches).
    await page.waitForURL(/\/onboarding/, { timeout: 30000 });
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Continua', exact: true }).click();
      await page.waitForTimeout(400);
    }
    await page.getByRole('button', { name: /Trova il tuo coach/ }).click();
    await page.waitForURL(/\/(coaches|dashboard)/, { timeout: 30000 });
  } else if (role === 'coach') {
    // New coaches also land in the wizard: name/surname prefilled, the pro
    // fields are optional here (set later on the dashboard) → click through.
    await page.waitForURL(/\/onboarding/, { timeout: 30000 });
    await page.getByRole('button', { name: 'Continua', exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Continua', exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Vai alla dashboard' }).click();
    await page.waitForURL(/dashboard/, { timeout: 30000 });
  } else {
    await page.waitForURL(/dashboard/, { timeout: 30000 });
  }
}

export async function login(page, email, pass, base) {
  await page.goto(`${base}/sign-in`);
  await page.fill('#email', email);
  await page.fill('#password', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/dashboard/, { timeout: 30000 });
}

/**
 * Coach pronto a creare sessioni: profilo compilato e un servizio con durata.
 * Senza servizio il pulsante "Nuovo appuntamento" resta disabilitato.
 */
export async function completeCoachProfile(page, coach, base) {
  await page.goto(`${base}/dashboard/coach/profile`);
  await page.waitForSelector('#lastName');
  await page.fill('#name', coach.nome);
  await page.fill('#lastName', coach.cognome);
  await page.locator('form:has(#lastName) button[type="submit"]').click();
  await page.waitForSelector('text=Account aggiornato.');

  await page.fill('#headline', 'Mental coach E2E');
  await page.fill(
    '#description',
    'Percorsi di allenamento mentale per atleti. Profilo creato dal test end-to-end.'
  );
  await page.check('input[name="categories"][value="football"]');
  await page.check('input[name="specialties"][value="performance_anxiety"]');
  await page.locator('form:has(#headline) button[type="submit"]').click();
  await page.waitForSelector('text=Profilo aggiornato.');

  await page.goto(`${base}/dashboard/coach/services`);
  const newService = page.locator('form', { hasText: 'Nuovo servizio' });
  await newService.locator('input[name="title"]').fill('Sessione individuale');
  await newService.locator('input[name="durationMin"]').fill('60');
  await newService.locator('input[name="price"]').fill('60');
  await newService.locator('button[type="submit"]').click();
  await page.waitForSelector('text=Servizio aggiunto.');
}
