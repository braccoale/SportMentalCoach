# Pacchetti per utente, non per organizzazione

**Data:** 2026-09-07
**Stato:** implementato
**Dipendenze:** sostituisce la parte di assegnazione di
`docs/superpowers/specs/2026-09-06-pacchetti-feature-entitlement-design.md`
(PR #71, non ancora mergiata). Non tocca lo schema/il codice del catalogo
funzionalità o della matrice
(`docs/superpowers/specs/2026-09-07-matrice-funzionalita-piani-design.md`) —
quella parte resta com'è.

## Il problema

Vedendo il pannello vero, Alessandro: *"la parte sotto 'Assegna a
un'organizzazione' non so cosa e a cosa serve, levala"*, e poi, sul modello
che aveva in mente: *"un utente quando compra un pacchetto Start/Pro/Advanced
gli viene assegnato quel piano... in base al piano ha funzionalità abilitate
(matrice)"*.

Il modello costruito finora assegna un pacchetto a un'**organizzazione**
(`organizations`, alias della tabella `teams` del boilerplate SaaS di
partenza), non a una persona. Ogni utente ha già una sua organizzazione
personale creata in automatico al signup ("nome@email's Team") — motivo per
cui la ricerca nel pannello mostra centinaia di team-fantasma senza senso
per chi guarda. Il modello che Alessandro descrive è più diretto: un
pacchetto si compra e si assegna a una persona, non a un gruppo.

## Decisioni prese (2026-09-07, Alessandro)

| domanda | scelta |
|---|---|
| chi possiede un pacchetto | **l'utente direttamente**, non più un'organizzazione |
| `organization_packages` (vuota in produzione) | **eliminata** con una migrazione — nessun dato da perdere |
| vista "chi ha questo pacchetto" | **sì**, aggiunta ora che è per utente — niente più rumore di organizzazioni-fantasma |
| `lib/core/organizations/` | rimosso; `findUserByEmail` si sposta dove serve davvero |
| tabelle `teams`/`team_members`/`organizations` sottostanti | **non toccate** — restano per il signup e per il resto del prodotto, si smette solo di usarle per i pacchetti |

## Lo schema

`organization_packages` viene eliminata (`DROP TABLE`, sicuro: zero righe in
produzione, nessun pacchetto è mai stato assegnato). Al suo posto, stessa
forma ma sull'utente:

```ts
export const USER_PACKAGE_STATUSES = ['active', 'expired', 'suspended'] as const;
export type UserPackageStatus = (typeof USER_PACKAGE_STATUSES)[number];

export const userPackages = pgTable(
  'user_packages',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    packageId: integer('package_id')
      .notNull()
      .references(() => packages.id),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdDate: timestamp('createddate', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('createdby').references(() => users.id, { onDelete: 'set null' }),
    updatedDate: timestamp('updateddate', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    uniqueIndex('user_packages_one_active_idx')
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    index('user_packages_user_status_idx').on(table.userId, table.status),
    check('user_packages_status_check', sql`${table.status} in ('active', 'expired', 'suspended')`),
    check('user_packages_window_check', sql`${table.expiresAt} is null or ${table.startsAt} is null or ${table.expiresAt} > ${table.startsAt}`),
  ]
);
```

Stesso indice unico parziale di prima ("un solo pacchetto attivo alla
volta"), stesso vincolo sulla finestra temporale — solo `user_id` al posto
di `organization_id`.

`admin_audit_events`: `organization_package_assigned`/`_revoked` diventano
`user_package_assigned`/`_revoked`; `organization_member_added` sparisce (non
esiste più "aggiungere un membro"); il soggetto `organization` sparisce
dall'enum (nessun'azione lo userà più) — le azioni sui pacchetti usano il
soggetto `user`, già esistente.

## La lettura — più corta, non più lunga

`getFeatureAccess` oggi passa da `team_members` → `organization_packages` →
`package_features`. Diventa diretto: `user_packages` → `package_features`,
filtrato su `user_id`. Sparisce un livello di indirezione; la funzione pura
che decide allowed/denied (`evaluateFeatureEntitlement`,
`composeFeatureAccess`) non cambia — cambia solo da dove arriva lo
snapshot.

## Il pannello admin

- **"Assegna a un utente"** sostituisce "Assegna a un'organizzazione": un
  campo email, si cerca l'utente (`findUserByEmail`, spostata da
  `lib/core/organizations/` a `lib/core/features/packages.ts` — è lì che
  serve), si vede il suo pacchetto attuale (se c'è, con scadenza e un
  pulsante Revoca), si assegna un pacchetto nuovo con una data di scadenza
  opzionale.
- **"Chi ha ogni pacchetto"**, nuova: per ciascun pacchetto, l'elenco degli
  utenti che lo hanno oggi (email, nome, stato, scadenza) — senza cercare
  nulla. Risolve il limite accettato nello spec della matrice ("la vista
  senza cercare per nome non c'è più") — lì valeva per le organizzazioni,
  qui non c'è più rumore da filtrare: ogni riga è una persona vera.

`lib/core/organizations/index.ts` viene eliminato per intero.
`searchOrganizations`/`listOrganizationMembers`/`addOrganizationMember`
non hanno più senso in questo modello; `findUserByEmail` si sposta.

## Cosa resta fuori, di nuovo esplicitamente

- **Nessun modo di assegnare un pacchetto a più persone in un colpo solo.**
  Un club che paga per cinque coach richiede cinque assegnazioni separate,
  una per utente. È la conseguenza diretta della scelta di oggi; se in
  futuro servirà davvero raggruppare, sarà una specifica a sé — non si
  ricostruisce ora un concetto di gruppo per un caso che oggi non c'è.
- **Le tabelle `teams`/`team_members`/`organizations` non vengono toccate.**
  Servono ancora al signup e ad altro codice del prodotto — si smette solo
  di usarle per questo.
- Tutto quello già escluso dallo spec della matrice (applicazione runtime
  di un limite numerico, funzionalità create dal pannello, ecc.) resta
  escluso allo stesso modo.

## Rischi, detti prima

- **Un'altra migrazione che tocca `admin_audit_events`** (la quarta in
  questo branch). Stesso rito delle precedenti: generare, leggere,
  mostrare, confermare.
- **`DROP TABLE organization_packages`** è nella migrazione. Sicuro perché
  la tabella è vuota — ma è comunque un `DROP`, va detto ad alta voce prima
  di eseguirlo, non dato per scontato perché "tanto è vuota".
