/**
 * Registrazione e accesso, condivisi fra gli scenari E2E.
 *
 * Stanno qui perché ogni scenario parte da utenti nuovi: duplicare il wizard di
 * iscrizione in ogni script significherebbe aggiornarlo in più punti ogni volta
 * che cambia un passaggio dell'onboarding.
 */

/*
 * `domcontentloaded`, non `load`.
 *
 * Playwright, di suo, aspetta che tutte le risorse siano chiuse. Questa
 * applicazione tiene aperta una connessione realtime, quindi quel momento non
 * arriva: le attese restavano appese fino alla scadenza e sembravano pagine
 * rotte. Al copione serve che il documento ci sia, non che la rete taccia.
 */
const DOM_READY = { waitUntil: 'domcontentloaded' };
const WAIT_URL = { waitUntil: 'domcontentloaded', timeout: 60_000 };

export const ROLE_TITLE = {
  athlete: 'Sono un atleta',
  coach: 'Sono un mental coach',
  club: 'Rappresento un team',
};

export async function signup(page, user, role, base) {
  await page.goto(`${base}/sign-up`, DOM_READY);
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

  if (role === 'athlete' || role === 'coach') {
    // Chi si registra atterra nella procedura guidata. I campi professionali
    // sono facoltativi qui — il profilo vero lo compila `completeCoachProfile`
    // — quindi si attraversa e basta.
    await page.waitForURL(/\/onboarding/, WAIT_URL);
    await clickThroughWizard(page);

    // L'ultimo passo non ha «Continua»: l'atleta esce con «Trova il tuo
    // coach», il coach con «Vai alla dashboard».
    const exit =
      role === 'athlete'
        ? page.getByRole('button', { name: /Trova il tuo coach/ })
        : page.getByRole('button', { name: 'Vai alla dashboard' });
    await exit.click();
    await page.waitForURL(/\/(coaches|dashboard)/, WAIT_URL);
  } else {
    await page.waitForURL(/dashboard/, WAIT_URL);
  }
}

/**
 * Preme «Continua» finche' c'e'.
 *
 * **Perche' non conta i passi.** Qui c'erano tre clic per l'atleta e due per
 * il coach, numeri scritti a mano. Il wizard del coach ne ha due di passi e
 * al secondo «Continua» non esiste piu': il copione lo cercava lo stesso e
 * restava fermo trenta secondi prima di morire. Un copione che conta i passi
 * si rompe il giorno in cui qualcuno ne aggiunge o ne toglie uno — ed e' la
 * terza volta oggi che questo file si rompe per un'assunzione sull'interfaccia
 * invece che su cio' che l'interfaccia fa.
 *
 * Il limite serve solo a non girare all'infinito se un passo non avanzasse.
 */
async function clickThroughWizard(page, maxSteps = 8) {
  const next = page.getByRole('button', { name: 'Continua', exact: true });

  for (let attempt = 0; attempt < maxSteps; attempt += 1) {
    /*
     * Tre stati, non due, ed e' qui che il primo tentativo di correzione ha
     * sbagliato: «visibile» non vuol dire «cliccabile». Fra un passo e l'altro
     * il pulsante resta nel DOM **disabilitato** mentre il salvataggio e' in
     * corso, e cliccarlo in quello stato fa aspettare Playwright trenta
     * secondi finche' l'elemento non si stacca.
     */
    if (await next.isEnabled().catch(() => false)) {
      await next.click();
      await page.waitForTimeout(1000);
      continue;
    }
    // Non c'e' piu': e' l'ultimo passo, dove il pulsante ha un altro nome.
    if (!(await next.isVisible().catch(() => false))) return;
    // C'e' ma sta salvando: si concede tempo e si guarda di nuovo.
    await page.waitForTimeout(1500);
  }
}

export async function login(page, email, pass, base) {
  await page.goto(`${base}/sign-in`, DOM_READY);
  await page.fill('#email', email);
  await page.fill('#password', pass);
  /*
   * Il pulsante del modulo, non il primo `submit` della pagina.
   *
   * Da quando esiste l'accesso con Google, «Continua con Google» e' anch'esso
   * un `button[type="submit"]` e nel DOM viene prima: `click('button[type=
   * "submit"]')` portava dritto alla schermata di Google, e lo scenario moriva
   * aspettando una dashboard che non sarebbe mai arrivata. E' la stessa
   * ambiguita' gia' vista sul pulsante «Continua» della registrazione.
   */
  await page.locator('form:has(#password) button[type="submit"]').click();
  await page.waitForURL(/dashboard/, WAIT_URL);
}

/**
 * Coach pronto a creare sessioni: profilo compilato e un servizio con durata.
 * Senza servizio il pulsante "Nuovo appuntamento" resta disabilitato.
 */
export async function completeCoachProfile(page, coach, base) {
  await page.goto(`${base}/dashboard/coach/profile`, DOM_READY);
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

  await page.goto(`${base}/dashboard/coach/services`, DOM_READY);
  /*
   * I servizi si aggiungono da una finestra di dialogo, non piu' da un modulo
   * in linea.
   *
   * Qui si cercava `form` contenente il testo «Nuovo servizio», che non esiste
   * piu' da quando la pagina e' stata rifatta: il copione restava fermo trenta
   * secondi su un elemento mai comparso. I nomi dei campi invece non sono
   * cambiati — title, durationMin, price — quindi si sposta solo il contenitore.
   *
   * Il pulsante ha due etichette a seconda che ci siano gia' servizi o no.
   */
  await page
    .getByRole('button', { name: /Aggiungi (il primo )?servizio/ })
    .first()
    .click();
  // `dialog[open]`, non `dialog`: la pagina ne contiene piu' d'uno — c'e'
  // anche quello delle disponibilita' — e solo quello aperto ha l'attributo.
  const dialog = page.locator('dialog[open]');
  await dialog.locator('input[name="title"]').fill('Sessione individuale');
  await dialog.locator('input[name="durationMin"]').fill('60');
  await dialog.locator('input[name="price"]').fill('60');
  await dialog.locator('button[type="submit"]').click();
  await page.waitForSelector('text=Servizio aggiunto.');
}
