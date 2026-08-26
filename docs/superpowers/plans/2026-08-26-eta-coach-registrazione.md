# L'età del coach in registrazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedire che un minorenne si registri come coach o club, chiedendo e verificando la data di nascita anche nei percorsi professionali.

**Architecture:** La soglia è `AGE_OF_MAJORITY` (18), già in `lib/core/guardians/age.ts`. Si aggiunge una funzione pura accanto a `isEligibleAge`, si apre il ramo `if (isAthleteSignup)` nei due percorsi di registrazione (password e Google), si mostra il campo anche ai professionisti, e si persiste la data su una colonna nuova di `provider_profiles`.

**Tech Stack:** Next.js 15 / React 19, Drizzle ORM su Postgres (Supabase), `tsx --test`.

## Global Constraints

- **Il database è produzione.** `.env.local`, Preview e Production puntano allo stesso progetto Supabase. Ogni migrazione va annunciata prima di eseguirla, e va letta l'SQL generato prima di lanciarla.
- **Migrazioni additive.** Colonna nullable, nessun `DROP`, nessun `NOT NULL` su dati esistenti.
- **`MIN_SIGNUP_AGE` (15) e `AGE_OF_MAJORITY` (18) non si toccano.** Sono numeri di legge; si aggiunge una funzione che li legge, non una costante nuova.
- **`lib/core/guardians/age.ts` non è `server-only`**: il wizard nel browser e la server action devono validare con la stessa funzione.
- Ogni nuovo file `.test.ts` va aggiunto allo script `test` in `package.json`.
- Messaggi d'errore in italiano, coerenti con quelli già presenti nel wizard.

---

### Task 1: La regola pura `isEligibleCoachAge`

**Files:**
- Modify: `lib/core/guardians/age.ts`
- Create: `lib/core/guardians/age.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `AGE_OF_MAJORITY`, `ageFromBirthDate` (già esistenti nello stesso file)
- Produces: `isEligibleCoachAge(age: number | null): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/core/guardians/age.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AGE_OF_MAJORITY,
  ageFromBirthDate,
  isEligibleCoachAge,
} from './age';

test('un minorenne non può registrarsi come coach', () => {
  assert.equal(isEligibleCoachAge(17), false);
  assert.equal(isEligibleCoachAge(15), false);
  assert.equal(isEligibleCoachAge(0), false);
});

test('a diciotto anni compiuti si può', () => {
  assert.equal(isEligibleCoachAge(AGE_OF_MAJORITY), true);
  assert.equal(isEligibleCoachAge(40), true);
});

test('età ignota non è un sì', () => {
  assert.equal(isEligibleCoachAge(null), false);
});

test('il giorno del diciottesimo compleanno il cancello si apre', () => {
  const at = new Date('2026-08-26T12:00:00Z');
  const age = ageFromBirthDate('2008-08-26', at);
  assert.equal(age, 18);
  assert.equal(isEligibleCoachAge(age), true);
});

test('il giorno prima no', () => {
  const at = new Date('2026-08-25T12:00:00Z');
  assert.equal(isEligibleCoachAge(ageFromBirthDate('2008-08-26', at)), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/core/guardians/age.test.ts`
Expected: FAIL — `isEligibleCoachAge` non esiste (errore di compilazione TypeScript o `is not a function`).

- [ ] **Step 3: Write minimal implementation**

In `lib/core/guardians/age.ts`, dopo `isEligibleAge`:

```ts
/**
 * Whether the platform accepts a coach or club signup at this age.
 *
 * 18, not `MIN_SIGNUP_AGE`: a professional accepts the Terms as a contract
 * and gives the specific approval of the onerous clauses required by
 * artt. 1341-1342 c.c. Below the age of legal capacity that acceptance is
 * voidable (art. 1425 c.c.), so the signature would be worth nothing.
 *
 * `null` is refused: an unknown age is not a yes.
 */
export function isEligibleCoachAge(age: number | null): boolean {
  return age != null && age >= AGE_OF_MAJORITY;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/core/guardians/age.test.ts`
Expected: PASS, 5 test.

- [ ] **Step 5: Wire it into the suite**

In `package.json`, nello script `test`, aggiungere `lib/core/guardians/age.test.ts` subito dopo `lib/core/guardians/birth-date.test.ts`.

Run: `npm test`
Expected: la suite passa, con 5 test in più rispetto al conteggio precedente (780).

- [ ] **Step 6: Commit**

```bash
git add lib/core/guardians/age.ts lib/core/guardians/age.test.ts package.json
git commit -m "feat(minori): la regola che dice quanti anni deve avere un coach"
```

---

### Task 2: La colonna su `provider_profiles`

**Files:**
- Modify: `lib/db/schema.ts` (tabella `providerProfiles`, da riga 273)
- Create: `lib/db/migrations/00NN_*.sql` (generata)

**Interfaces:**
- Produces: `providerProfiles.birthDate` (`date`, nullable)

- [ ] **Step 1: Add the column to the schema**

In `lib/db/schema.ts`, dentro `providerProfiles`, accanto agli altri campi anagrafici:

```ts
  // Dichiarata alla registrazione e non più modificabile dal profilo: è il
  // solo dato che prova che chi accetta i Termini come professionista ha la
  // capacità legale per farlo (art. 1425 c.c.). Nullable perché i coach
  // registrati prima di questo controllo non ne hanno una — vedi la specifica
  // 2026-08-26-eta-coach-registrazione-design.md.
  birthDate: date('birth_date'),
```

Verificare che `date` sia già importato in cima al file (lo è: `client_profiles.birth_date` lo usa).

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: un file nuovo in `lib/db/migrations/` e una voce in `meta/_journal.json`.

- [ ] **Step 3: Read the generated SQL**

Aprire il file generato. Deve contenere **solo**:

```sql
ALTER TABLE "provider_profiles" ADD COLUMN "birth_date" date;
```

Se contiene un `DROP` o una ricreazione della tabella, **fermarsi**: non eseguire, e riportare cosa è stato generato.

- [ ] **Step 4: Add the plausibility constraint and the why**

Aggiungere in coda al file generato:

```sql
-- Il controllo dei 18 anni NON può stare qui: dipende da CURRENT_DATE, che
-- non è immutabile, e Postgres non lo accetta in un CHECK. La soglia vive in
-- isEligibleCoachAge() e viene applicata dalle due server action di
-- registrazione. Questo vincolo copre solo l'assurdo.
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_birth_date_plausible"
  CHECK ("birth_date" IS NULL OR "birth_date" > DATE '1900-01-01');
```

- [ ] **Step 5: Announce, then migrate**

Dire all'utente, prima di lanciare: *«sto per aggiungere la colonna `birth_date` a `provider_profiles` sul database di produzione; è additiva e nullable, nessun dato esistente viene toccato»*. Poi:

Run: `npm run db:migrate`
Expected: la migrazione risulta applicata, nessun errore.

- [ ] **Step 6: Verify the schema still typechecks**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/
git commit -m "feat(db): provider_profiles porta la data di nascita del coach"
```

---

### Task 3: Il cancello nella registrazione con password

**Files:**
- Modify: `app/(login)/actions.ts:183-200` (il blocco `if (isAthleteSignup)`)
- Modify: `app/(login)/signup-wizard.tsx` (campo, validazione, avviso)

**Interfaces:**
- Consumes: `isEligibleCoachAge` (Task 1)

- [ ] **Step 1: Open the age gate in the server action**

In `app/(login)/actions.ts`, aggiungere `isEligibleCoachAge` agli import da `@/lib/core/guardians/age` (riga ~31), poi sostituire il blocco:

```ts
  // Age gate. Only athletes declare a birth date — a coach or a club signing
  // up is acting in a professional capacity, not as a young athlete.
  const isAthleteSignup = !role || role === 'athlete';
  let athleteAge: number | null = null;
  if (isAthleteSignup) {
    athleteAge = ageFromBirthDate(birthDate ?? null);
    if (athleteAge == null) {
      return { error: 'Indica la tua data di nascita.', email, password };
    }
    if (athleteAge > 120) {
      return { error: 'Data di nascita non valida.', email, password };
    }
    if (!isEligibleAge(athleteAge)) {
      return {
        error: `KaiPai è riservato agli atleti dai ${MIN_SIGNUP_AGE} anni in su.`,
        email,
        password
      };
    }
  }
```

con:

```ts
  /*
   * Cancello sull'età. Vale per tutti, con due soglie diverse.
   *
   * Qui c'era `if (isAthleteSignup)`, e un commento che dichiarava che «chi
   * si registra come coach agisce in veste professionale». Era un'assunzione,
   * non un controllo: un sedicenne che al primo passo sceglieva «Coach» non
   * incontrava mai la domanda sull'età, e il sistema glielo lasciava fare.
   *
   * Le due soglie non sono intercambiabili: 15 è il pavimento del prodotto
   * per gli atleti, 18 è la capacità legale, che al professionista serve per
   * approvare le clausole vessatorie che gli chiediamo di firmare.
   */
  const isAthleteSignup = !role || role === 'athlete';
  const declaredAge = ageFromBirthDate(birthDate ?? null);

  if (declaredAge == null) {
    return { error: 'Indica la tua data di nascita.', email, password };
  }
  if (declaredAge > 120) {
    return { error: 'Data di nascita non valida.', email, password };
  }
  if (isAthleteSignup && !isEligibleAge(declaredAge)) {
    return {
      error: `KaiPai è riservato agli atleti dai ${MIN_SIGNUP_AGE} anni in su.`,
      email,
      password
    };
  }
  if (!isAthleteSignup && !isEligibleCoachAge(declaredAge)) {
    return {
      error: `Per registrarti come coach o club devi avere almeno ${AGE_OF_MAJORITY} anni.`,
      email,
      password
    };
  }

  const athleteAge = isAthleteSignup ? declaredAge : null;
```

`athleteAge` resta definita perché è usata più sotto per decidere il testo dell'email di benvenuto: quel comportamento non cambia. Aggiungere `AGE_OF_MAJORITY` agli import se non c'è.

- [ ] **Step 2: Show the field to professionals in the wizard**

In `app/(login)/signup-wizard.tsx`:

Import: aggiungere `isEligibleCoachAge` e `AGE_OF_MAJORITY` a quelli da `@/lib/core/guardians/age`.

Sostituire (riga ~99):

```ts
  const underMin = isAthlete && age != null && !isEligibleAge(age);
```

con:

```ts
  // Due soglie, una per lato: 15 per l'atleta, 18 per chi firma da
  // professionista. `underMin` resta il nome del blocco rosso sotto al campo.
  const underMin =
    age != null &&
    (isAthlete ? !isEligibleAge(age) : isProfessional ? !isEligibleCoachAge(age) : false);
```

Sostituire la condizione del campo (riga ~350) da `{isAthlete && (` a `{(isAthlete || isProfessional) && (`.

Sostituire il blocco rosso, che oggi cita sempre `MIN_SIGNUP_AGE`:

```tsx
            {underMin && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
                <p className="font-semibold text-red-700">
                  {isAthlete
                    ? `KaiPai è disponibile a partire dai ${MIN_SIGNUP_AGE} anni.`
                    : `Per registrarti come coach o club devi avere almeno ${AGE_OF_MAJORITY} anni.`}
                </p>
                <p className="mt-1 text-red-600">
                  {isAthlete
                    ? 'Al momento non è possibile creare un account. Per maggiori informazioni, chiedi a un genitore o tutore di contattarci.'
                    : 'Un coach accetta i Termini come professionista: serve la maggiore età.'}
                </p>
              </div>
            )}
```

Sostituire l'ultima riga di `canSubmit`:

```ts
    (!isAthlete || (!!birthDate && !underMin));
```

con:

```ts
    ((!isAthlete && !isProfessional) || (!!birthDate && !underMin));
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: verde, nessuna regressione.

- [ ] **Step 5: Commit**

```bash
git add "app/(login)/actions.ts" "app/(login)/signup-wizard.tsx"
git commit -m "fix(registrazione): anche il coach dichiara quanti anni ha"
```

---

### Task 4: Lo stesso cancello nel percorso Google

**Files:**
- Modify: `app/registrazione/completa/actions.ts:97-113`
- Modify: `app/registrazione/completa/complete-form.tsx`

**Interfaces:**
- Consumes: `isEligibleCoachAge` (Task 1)

Senza questo task il percorso Google resta il modo di aggirare quello con la password. Le due pagine fanno le stesse domande con le stesse parole, di proposito.

- [ ] **Step 1: Open the gate in the Google completion action**

In `app/registrazione/completa/actions.ts`, aggiungere `isEligibleCoachAge` e `AGE_OF_MAJORITY` agli import, e sostituire il blocco `if (isAthleteSignup) { ... }` (righe ~103-113) con:

```ts
    const declaredAge = ageFromBirthDate(data.birthDate ?? null);
    if (declaredAge == null) return { error: 'Indica la tua data di nascita.' };
    if (declaredAge > 120) return { error: 'Data di nascita non valida.' };
    if (isAthleteSignup && !isEligibleAge(declaredAge)) {
      return {
        error: `KaiPai è riservato agli atleti dai ${MIN_SIGNUP_AGE} anni in su.`,
      };
    }
    if (!isAthleteSignup && !isEligibleCoachAge(declaredAge)) {
      return {
        error: `Per registrarti come coach o club devi avere almeno ${AGE_OF_MAJORITY} anni.`,
      };
    }
    athleteAge = isAthleteSignup ? declaredAge : null;
```

Mantenere la dichiarazione `let athleteAge: number | null = null;` e il suo commento: quell'età decide se l'email di benvenuto spiega come farsi autorizzare da un tutore, e deve restare fuori dal ramo.

- [ ] **Step 2: Mirror the form changes**

In `app/registrazione/completa/complete-form.tsx` applicare le stesse tre modifiche del Task 3 Step 2: `underMin` con la doppia soglia (riga ~106), condizione del campo `{(isAthlete || isProfessional) && (` (riga ~227), ultima riga di `canSubmit` (riga ~129). Il testo del blocco rosso è lo stesso, parola per parola.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 4: Commit**

```bash
git add app/registrazione/completa/
git commit -m "fix(registrazione): il percorso Google non è la porta di servizio"
```

---

### Task 5: Persistere la data del coach

**Files:**
- Modify: `lib/core/auth/account-provisioning.ts:178-188`

**Interfaces:**
- Consumes: `providerProfiles.birthDate` (Task 2)

- [ ] **Step 1: Write the date after the profile exists**

In `lib/core/auth/account-provisioning.ts`, aggiungere `providerProfiles` agli import da `@/lib/db/schema` e `eq` da `drizzle-orm` se non c'è, poi **dopo** il blocco `if (isAthleteSignup && birthDate) { ... }`:

```ts
      // Il coach dichiara la data alla registrazione e non la rivede più: è la
      // prova che chi ha approvato le clausole vessatorie poteva farlo.
      // `provisionMarketplaceRole` ha già creato la riga qui sopra, quindi si
      // aggiorna invece di inserire. Un `club` non ha una riga in
      // provider_profiles: per lui l'età è verificata all'ingresso ma non
      // resta scritta da nessuna parte — vedi la specifica.
      if (marketplaceRole === 'coach' && birthDate) {
        await tx
          .update(providerProfiles)
          .set({ birthDate, updatedAt: new Date() })
          .where(eq(providerProfiles.userId, createdUser.id));
      }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Run the suite**

Run: `npm test`
Expected: verde.

- [ ] **Step 4: Commit**

```bash
git add lib/core/auth/account-provisioning.ts
git commit -m "feat(registrazione): la data del coach resta scritta"
```

---

### Task 6: Verifica sullo schermo

Il typecheck e i test non dicono che il wizard blocchi davvero. Questa è l'unica prova che conta.

- [ ] **Step 1: Start the app**

Run: `npm run dev`

- [ ] **Step 2: Walk the coach path**

Aprire `/sign-up`, scegliere **Coach**, arrivare al terzo passo. Verificare:
1. il campo «Data di nascita» c'è;
2. con una data che dà 17 anni compare il blocco rosso con il testo dei 18 anni, e «Registrati» resta disabilitato;
3. con una data che dà 18 anni il blocco sparisce e il pulsante si abilita.

- [ ] **Step 3: Check the athlete path did not change**

Stesso giro scegliendo **Atleta**: a 14 anni il messaggio deve essere ancora quello dei 15 anni, e a 16 deve comparire l'avviso sul tutore.

- [ ] **Step 4: Report the level reached**

Dire esplicitamente cosa è stato verificato e come: `typecheck/test` più browser locale. Nessuna registrazione vera va completata contro il database di produzione.

---

## Cosa questo piano NON fa

- **Non tocca i coach già registrati.** Decisione di Alessandro del 2026-08-26: di una parte dei coach in produzione l'età resta ignota.
- **Non crea `birthDateOf()`.** La specifica la prevede, ma qui non avrebbe un solo chiamante: nasce con il lavoro sulle notifiche, che è il suo primo consumatore.
- **Non permette al coach di modificare la data** dopo la registrazione. Se servirà, il precedente da riusare è la regola unidirezionale di `canSelfEditBirthDate`.
