# L'età del coach, in fase di registrazione

**Data:** 2026-08-26
**Stato:** disegno approvato, da implementare
**Origine:** rilievo di Alessandro durante il disegno delle notifiche su misura

## Il buco

La registrazione chiede la data di nascita **solo agli atleti**. In
`app/(login)/actions.ts` il controllo vive dentro un ramo esplicito:

```ts
// Age gate. Only athletes declare a birth date — a coach or a club signing
// up is acting in a professional capacity, not as a young athlete.
const isAthleteSignup = !role || role === 'athlete';
if (isAthleteSignup) { /* ... isEligibleAge ... */ }
```

e nel wizard il campo compare solo `isAthlete`. Il commento dichiara
un'assunzione — «chi si registra come coach agisce in veste professionale» —
che nessuna riga verifica. Un sedicenne che al primo passo sceglie «Coach» non
incontra mai la domanda sull'età, e il sistema glielo lascia fare.

Non è un difetto di comodo. Un coach accede a sedute con minori, alle
trascrizioni e ai riepiloghi AI di persone reali, e accetta i Termini come
professionista.

## La soglia è 18, e non la scegliamo noi

`AGE_OF_MAJORITY` esiste già in `lib/core/guardians/age.ts`. È il numero
giusto anche qui, per la stessa ragione per cui è lì:

- i Termini sono un contratto, e sotto i 18 è annullabile (art. 1425 c.c.);
- al coach è richiesta l'approvazione specifica delle clausole vessatorie
  (artt. 1341-1342 c.c.), che presuppone capacità legale;
- `MIN_SIGNUP_AGE` (15) non c'entra: è la soglia dell'atleta, e riusarla qui
  sarebbe la scorciatoia che questo repository ha già pagato altrove.

Nessuna costante nuova. Si aggiunge una funzione che la legge.

## Decisioni

| decisione | scelta | conseguenza |
|---|---|---|
| soglia | 18 anni | vincolata dalla legge, non regolabile |
| coach già registrati | **restano come sono** | di una parte dei coach in produzione l'età resta ignota, e se uno fosse minorenne non lo scopriremmo. Scelta consapevole di Alessandro il 2026-08-26: niente attrito su professionisti già attivi |
| dove sta il dato | nuova colonna su `provider_profiles` | additiva; non tocca `client_profiles.birth_date` né il gate del tutore appena messo in sicurezza dalla PR #49 |
| chi la legge | un solo lettore, `birthDateOf(userId)` | due posti in archivio, un solo posto nel codice |
| modificabile dal coach | **no** | l'editor del profilo coach non espone il campo. Solo la registrazione lo scrive |

## Cambiamenti

### 1. Migrazione (additiva)

```sql
ALTER TABLE provider_profiles ADD COLUMN birth_date date;
ALTER TABLE provider_profiles ADD CONSTRAINT provider_profiles_birth_date_plausible
  CHECK (birth_date IS NULL OR birth_date > DATE '1900-01-01');
```

Nullable di proposito: i coach esistenti non ne hanno una, e una `NOT NULL`
li romperebbe tutti. Il vincolo d'età **non** può stare nel database —
`CURRENT_DATE` non è immutabile e Postgres non l'accetta in un `CHECK` — quindi
il controllo dei 18 anni vive nel codice, nel modulo puro qui sotto.

Prima di eseguire: `npm run db:generate`, si legge l'SQL prodotto, e si
annuncia l'esecuzione. Il database è produzione.

### 2. La regola, pura e condivisa

In `lib/core/guardians/age.ts`, accanto a `isEligibleAge`:

```ts
/** Whether the platform accepts a coach signup at this age. */
export function isEligibleCoachAge(age: number | null): boolean {
  return age != null && age >= AGE_OF_MAJORITY;
}
```

Modulo non-`server-only`, come il resto del file: il wizard e la server action
rifiutano lo stesso valore per lo stesso motivo. `null` resta il suo caso —
età ignota non è «va bene».

### 3. Registrazione

- `app/(login)/signup-wizard.tsx`: il campo data di nascita compare anche per
  `coach` e `club`. Il pulsante di invio resta disabilitato finché l'età non
  è valida, con il messaggio già accanto al campo.
- `app/(login)/actions.ts`: il ramo `if (isAthleteSignup)` diventa una
  diramazione sul ruolo — atleta contro `isEligibleAge`, professionista contro
  `isEligibleCoachAge`. In entrambi i casi la data è obbligatoria.
- `app/registrazione/completa/`: la registrazione con Google completa il
  profilo in un secondo momento e già gestisce `birthDate` per gli atleti.
  Stessa diramazione, o il percorso Google diventa il modo di aggirare quello
  con la password.
- `lib/core/auth/account-provisioning.ts`: scrive la data su
  `provider_profiles` quando il ruolo è professionale, come già fa su
  `client_profiles` per gli atleti.

### 4. Il lettore unico

```ts
// lib/core/profiles/birth-date.ts
export async function birthDateOf(userId: number): Promise<string | null>
```

Legge `client_profiles.birth_date` per gli atleti e
`provider_profiles.birth_date` per i coach. Esiste perché il fatto è uno solo
anche se le colonne sono due: chiunque debba sapere quanti anni ha una persona
chiama questa, e il giorno in cui le due colonne diventeranno una sola cambia
solo questo file.

Primo consumatore già previsto: la voce delle notifiche (specifica separata).

## Verifica

- `isEligibleCoachAge`: 17 anni no, 18 sì, il giorno del compleanno sì, `null`
  no. Test puro, agganciato a `npm test`.
- Il rifiuto vero nella registrazione va visto su schermo: livello
  `typecheck/test` non basta a dire che il wizard blocca davvero.

## Cosa resta fuori

- I coach esistenti. Per scelta, e la conseguenza è scritta sopra.
- La modifica della data dopo la registrazione: se un giorno servirà, la
  regola unidirezionale di `canSelfEditBirthDate` è il precedente da riusare,
  non da riscrivere.
