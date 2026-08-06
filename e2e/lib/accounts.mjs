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
  await page.getByRole('button', { name: 'Continua' }).click();
  // Step 2 — credentials (+ confirm).
  await page.fill('#email', user.email);
  await page.fill('#password', user.pass);
  await page.fill('#confirm', user.pass);
  await page.getByRole('button', { name: 'Continua' }).click();
  // Step 3 — details + legal.
  await page.fill('#name', user.nome);
  await page.fill('#lastName', user.cognome);
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
  } else if (role === 'coach') {
    // New coaches also land in the wizard: name/surname prefilled, the pro
    // fields are optional here (set later on the dashboard) → click through.
    await page.waitForURL(/\/onboarding/, { timeout: 30000 });
    await page.getByRole('button', { name: 'Continua' }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Continua' }).click();
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
