# Pacchetti: dal listino statico a feature abilitabili per organizzazione

**Data:** 2026-09-06
**Stato:** disegno approvato, da implementare
**Dipendenze:** nessuna migrazione in sospeso su cui appoggiarsi. Riusa
`user_feature_entitlements`, `lib/core/features/policy.ts` e
`organizations`/`team_members` così come sono oggi.

## Il problema

Il motore di entitlement esiste già (`user_feature_entitlements` +
`evaluateFeatureEntitlement`) ma sa fare una cosa sola: abilitare una feature a
un utente alla volta, a mano, dall'admin. Il concetto di "pacchetto" esiste
solo come prosa — `COACHING_PACKAGES` in `lib/core/pricing/index.ts`, un
array TypeScript con prezzo e un campo `features: string[]` che è testo
libero per la landing e `/pricing.md`. Scrivere lì "20 sessioni individuali /
mese" non abilita né disabilita nulla nel prodotto.

Serve un sistema per cui un pacchetto (Starter/Academy/Elite o quelli che
verranno) porti con sé un insieme di feature reali, e un admin possa decidere
— da un pannello, non da un file TypeScript da deployare — quali feature
appartengono a quale pacchetto.

## Decisioni prese (2026-09-06, Alessandro)

| domanda | scelta |
|---|---|
| chi possiede il pacchetto | **l'organizzazione** (`organizations`, alias di `teams`), non il singolo coach |
| perché non il coach | i prezzi già pubblicati (fino a 75.000 €/anno, "team dedicato") hanno senso solo per un cliente che copre più persone, non un coach solo |
| come si propaga alle persone | **calcolo a lettura**: nessuna riga sincronizzata in `user_feature_entitlements`, si interroga il pacchetto dell'organizzazione al momento della verifica |
| quanti pacchetti attivi per organizzazione | **uno solo alla volta** — niente stacking/add-on in v1 |
| limiti d'uso sul pacchetto-organizzazione | **nessuno** — solo attivo/scaduto/sospeso, niente `usageLimit`/`usageCount` a livello org |
| Stripe / checkout self-serve | **fuori scope**. Sono vendite B2B negoziate; l'admin assegna il pacchetto a mano, come già fa oggi per le entitlement singole |
| la landing (`COACHING_PACKAGES`) | **resta separata**. Il nuovo sistema guida i feature flag reali; il copy commerciale non cambia sorgente in questa specifica |

## Cosa esiste già (il punto di partenza)

- `user_feature_entitlements` — riga per utente, per feature, con `status`
  (`enabled`/`disabled`/`trial`/`expired`/`suspended`), `source`
  (`admin`/`beta`/`subscription`/`addon`/`trial`/`system`), finestra
  temporale, `usageLimit`/`usageCount`.
- `evaluateFeatureEntitlement` (`lib/core/features/policy.ts`) — funzione
  pura, testata, che decide `allowed`/`reason` da uno snapshot di quel tipo.
  Non tocca il database: prende una entitlement (o `null`) e un orologio.
- `getFeatureAccess` / `setFeatureEntitlement` / `revokeFeatureEntitlement`
  (`lib/core/features/index.ts`) — orchestrazione lato server, con
  `assertAdmin` sulle mutazioni.
- `FEATURE_CODES` — oggi una sola voce, `AI_SESSION_NOTES`. Resta una
  costante TypeScript, non una tabella: è lo stesso pattern già usato per gli
  enum di stato/sorgente, e aggiungere una feature futura resta una riga di
  codice, non una migrazione.
- `organizations` (alias di `teams`) e `team_members` — schema "Phase 1
  marketplace, additive tables" già presente, mai collegato a nulla. La
  dashboard `/dashboard/club` è un segnaposto ("Sezione in preparazione").
- `admin_audit_events` — log generico, append-only (trigger che rifiuta
  UPDATE/DELETE), con `subjectType` che include già `'feature'`.

## Lo schema nuovo

Tre tabelle additive, stesso stile di `user_feature_entitlements` (timestamp
con timezone, `createdBy`/`updatedBy` che referenziano `users` con
`onDelete: 'set null'`):

```ts
export const PACKAGE_STATUSES = ['active', 'archived'] as const;

export const packages = pgTable('packages', {
  id: serial('id').primaryKey(),
  key: varchar('key', { length: 60 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdDate: timestamp('createddate', { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer('createdby').references(() => users.id, { onDelete: 'set null' }),
  updatedDate: timestamp('updateddate', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updatedby').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  check('packages_status_check', sql`${table.status} in ('active', 'archived')`),
]);

export const packageFeatures = pgTable('package_features', {
  id: serial('id').primaryKey(),
  packageId: integer('package_id').notNull().references(() => packages.id, { onDelete: 'cascade' }),
  featureCode: varchar('feature_code', { length: 80 }).notNull(),
  createdDate: timestamp('createddate', { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer('createdby').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  unique('package_features_package_feature_unique').on(table.packageId, table.featureCode),
]);

export const ORGANIZATION_PACKAGE_STATUSES = ['active', 'expired', 'suspended'] as const;

export const organizationPackages = pgTable('organization_packages', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  packageId: integer('package_id').notNull().references(() => packages.id),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdDate: timestamp('createddate', { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer('createdby').references(() => users.id, { onDelete: 'set null' }),
  updatedDate: timestamp('updateddate', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: integer('updatedby').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  uniqueIndex('organization_packages_one_active_idx')
    .on(table.organizationId)
    .where(sql`${table.status} = 'active'`),
  index('organization_packages_org_status_idx').on(table.organizationId, table.status),
  check('organization_packages_status_check', sql`${table.status} in ('active', 'expired', 'suspended')`),
  check('organization_packages_window_check', sql`${table.expiresAt} is null or ${table.startsAt} is null or ${table.expiresAt} > ${table.startsAt}`),
]);
```

L'indice unico parziale su `status = 'active'` è la stessa tecnica già usata
da `session_ai_notes_one_open_per_booking_idx`: il database, non il codice
applicativo, garantisce "un solo pacchetto attivo per organizzazione".

`admin_audit_events` si estende, non si duplica: `ADMIN_AUDIT_ACTIONS` prende
`package_created`, `package_features_updated`,
`organization_package_assigned`, `organization_package_revoked`;
`ADMIN_AUDIT_SUBJECTS` prende `package` e `organization`. Tocca due CHECK
esistenti (drop + ricrea con la lista estesa) — additivo nella sostanza,
enumerazione più lunga nella forma.

## La valutazione: `getFeatureAccess` esteso, non duplicato

```ts
export async function getFeatureAccess(
  userId: number,
  featureCode: FeatureCode,
  now = new Date()
): Promise<FeatureAccessResult> {
  const direct = await loadDirectEntitlement(userId, featureCode);
  const directResult = evaluateFeatureEntitlement(direct, now);
  if (directResult.allowed) return directResult;

  const orgGrant = await loadOrganizationFeatureGrant(userId, featureCode, now);
  if (orgGrant) {
    const orgResult = evaluateFeatureEntitlement(orgGrant, now);
    if (orgResult.allowed) return orgResult;
  }

  return directResult;
}
```

`loadOrganizationFeatureGrant` fa: `team_members` per le organizzazioni
dell'utente → `organization_packages` con `status = 'active'` → `package_features`
per verificare che `featureCode` sia incluso → restituisce uno snapshot
`{ status: 'enabled', source: 'subscription', startsAt, expiresAt, usageLimit: null, usageCount: 0 }`
passato alla **stessa** `evaluateFeatureEntitlement` già testata: la regola
"cosa vuol dire scaduto/non iniziato/sospeso" resta scritta una volta sola.
Se l'utente appartiene a più organizzazioni che concedono la stessa feature
(caso raro in v1, dove un coach sta tipicamente in una sola organizzazione),
la query prende la prima per `organizationId` crescente: deterministico, e
la scelta fra due concessioni valide non cambia l'esito (`allowed`), solo
quali `startsAt`/`expiresAt` finiscono nella risposta.

Se l'utente non è in nessuna entitlement diretta ma è in un'organizzazione
con pacchetto, `directResult` (tipicamente `not_entitled`) viene scartato in
favore di `orgResult`. Se nessuno dei due concede accesso, si preserva la
ragione più specifica di `directResult` (es. `expired` batte `not_entitled`).

La logica pura di trasformazione riga→snapshot organizzazione vive in un
nuovo modulo `lib/core/features/organization-grant.ts`, con `organization-grant.test.ts`
accanto, wired in `npm test` — coerente con "decisioni in `lib/core` come
funzioni pure verificabili senza database".

## Il pannello admin — `/dashboard/admin/packages`

- **Editor pacchetti**: nome, chiave, stato, e una checkbox per ogni voce di
  `FEATURE_CODES` (oggi una sola: AI_SESSION_NOTES) → scrive `package_features`.
- **Assegnazione a organizzazione**: selettore organizzazione (nuovo — non
  esiste ancora nessuna UI su `organizations`, serve una lista/ricerca minima
  per nome), pacchetto, stato, `startsAt`/`expiresAt`. Stesso pattern di
  `updateAiNotesEntitlementAction`: server action, `assertAdmin`, scrittura
  transazionale + riga in `admin_audit_events`.
- **Vista per pacchetto**: quali organizzazioni lo hanno attivo oggi.

Esplicitamente **fuori scope v1**: dashboard club che mostra il pacchetto
attivo, vista coach "perché vedo/non vedo questa feature", checkout
self-serve, qualunque integrazione Stripe.

## Cosa lo tiene in piedi (test)

| test | cosa fissa |
|---|---|
| `policy.test.ts` (esistente, invariato) | `evaluateFeatureEntitlement` su una entitlement diretta |
| `organization-grant.test.ts` (nuovo) | uno snapshot organizzazione con pacchetto scaduto/sospeso/non iniziato si comporta come una entitlement diretta nello stesso stato; un'organizzazione senza pacchetto attivo non concede nulla; una feature non inclusa nel pacchetto non concede nulla |
| test di composizione su `getFeatureAccess` | l'entitlement diretta vince quando è `allowed`; l'esito organizzazione tappa il buco quando quella diretta è `not_entitled`; la ragione più specifica sopravvive quando nessuno dei due concede |

## Rischi, detti prima

- **Una query in più per gli utenti senza entitlement diretta.** Trascurabile
  ai volumi attuali; se in futuro diventasse un problema, la mitigazione è
  cache a livello di richiesta, non riscrivere il modello.
- **Nessuna organizzazione ha oggi membri reali** (`team_members` è schema
  vuoto in pratica). Il pannello admin dovrà permettere di aggiungere un
  coach a un'organizzazione come parte minima di questo lavoro — non una
  vera gestione club, solo l'associazione necessaria perché il pacchetto
  abbia qualcuno a cui applicarsi.
- **Estendere due CHECK constraint su `admin_audit_events`** tocca una
  tabella append-only con trigger di protezione: la migrazione va scritta e
  verificata con `database-migrations` prima di girare, come sempre in
  questo progetto — database di sviluppo e produzione coincidono.

## Cosa resta fuori

- Stripe, Stripe Connect, qualunque checkout.
- Riscrivere `COACHING_PACKAGES`/`/pricing.md` per leggere dal nuovo catalogo.
- UI lato club o coach.
- Pacchetti multipli/stacking per la stessa organizzazione.
- Limiti d'uso (usage metering) a livello di pacchetto-organizzazione.
