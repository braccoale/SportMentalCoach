# Matrice funzionalità × piani

**Data:** 2026-09-07
**Stato:** implementato
**Dipendenze:** costruisce sopra `docs/superpowers/specs/2026-09-06-pacchetti-feature-entitlement-design.md`
(PR #71, non ancora mergiata quando questo spec è stato scritto). Non tocca
`organization_packages` né la logica di scadenza/stato: quella parte resta
com'era.

## Il problema

Il pannello `/dashboard/admin/packages` (PR #71) mostra, per ogni pacchetto,
un elenco di checkbox — una per feature — con un pulsante "Salva feature"
separato per pacchetto. Funziona, ma non è la forma che Alessandro aveva in
mente: un altro suo prodotto (iPricer) ha una **matrice** — righe
funzionalità, colonne piani, una cella per combinazione — dove alcune righe
sono sì/no e altre sono un numero modificabile (es. "ricerche AI incluse:
50/300/1500"). Vedendo il pannello a schede ha scritto: *"non sto capendo
nulla"*.

Due limiti concreti dietro quella reazione:

1. **Le funzionalità sono una costante nel codice** (`FEATURE_CODES` in
   `lib/core/features/policy.ts`), non una tabella che si può guardare e
   descrivere. Oggi ne esiste una sola, `AI_SESSION_NOTES`.
2. **Una funzionalità è solo sì/no.** `package_features` non ha modo di
   portare un numero (un limite), quindi non può rappresentare una riga
   come quella dello screenshot di iPricer.

## Decisioni prese (2026-09-07, Alessandro)

| domanda | scelta |
|---|---|
| chi possiede un pacchetto | resta l'organizzazione (invariato da PR #71) — "quella che dà più possibilità di configurazione" |
| scadenza/stato dell'assegnazione | **resta**, non era quello il problema |
| chi crea una riga nel catalogo funzionalità | **solo uno sviluppatore**, quando collega davvero una funzionalità al codice — l'admin configura, non inventa |
| tipo di funzionalità | **sì/no oppure numero**, come iPricer |
| come si salva la matrice | **un solo pulsante "Salva"** per l'intera matrice, non per cella |
| pacchetti A/B/C/D | **nessun seed**: si creano dal pannello, che ha già "Nuovo pacchetto" |
| layout | **stessa pagina**: matrice sopra, assegnazione a organizzazione sotto, invariata |

## Lo schema

Una tabella nuova, additiva, e una colonna aggiunta a una tabella già
esistente (creata da PR #71, oggi vuota in produzione — nessuna riga da
migrare):

```ts
export const FEATURE_TYPES = ['boolean', 'numeric'] as const;
export type FeatureType = (typeof FEATURE_TYPES)[number];

export const features = pgTable(
  'features',
  {
    id: serial('id').primaryKey(),
    code: varchar('code', { length: 80 }).notNull(),
    label: varchar('label', { length: 120 }).notNull(),
    description: text('description'),
    type: varchar('type', { length: 20 }).notNull().default('boolean'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdDate: timestamp('createddate', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('createdby').references(() => users.id, { onDelete: 'set null' }),
    updatedDate: timestamp('updateddate', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: integer('updatedby').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    unique('features_code_unique').on(table.code),
    check('features_type_check', sql`${table.type} in ('boolean', 'numeric')`),
  ]
);
```

`package_features` (PR #71) guadagna:

```ts
value: integer('value'),
```

nullable: assente per una funzionalità `boolean` (la riga stessa è
l'inclusione — invariato), popolata per una `numeric` (il limite; `null` =
illimitato — la stessa convenzione già usata da `usageLimit` in
`user_feature_entitlements`, non una nuova da imparare).

`package_features.feature_code` guadagna un riferimento a `features.code`,
così una riga non può mai puntare a una funzionalità che non esiste:

```ts
featureCode: varchar('feature_code', { length: 80 })
  .notNull()
  .references(() => features.code),
```

## Il seed: una riga sola, quella che il codice già conosce

La migrazione inserisce `('AI_SESSION_NOTES', 'Appunti AI', 'boolean', ...)`
— stesso trattamento già dato a `roles`/`sports` in questo repository:
dati di riferimento seminati dalla migrazione, non da uno script a parte.
Nessun altro seed: i pacchetti A/B/C/D nascono dal pannello, che ha già
"Nuovo pacchetto" (PR #71) — zero codice nuovo per quello.

## La matrice

Sostituisce, in `/dashboard/admin/packages`, l'elenco a schede di
PR #71: righe = `features` (ordinate per `sortOrder`), colonne =
`packages`. Cella `boolean` → checkbox; cella `numeric` → campo numero,
vuoto = illimitato. Un solo pulsante "Salva" invia l'intera griglia in una
sola azione server, che sostituisce (in una transazione) tutte le righe di
`package_features` con quelle inviate — stessa tecnica *delete-poi-insert*
già usata da `setPackageFeatures` in PR #71, estesa a tutti i pacchetti
insieme invece che a uno alla volta.

La sezione "Assegna a un'organizzazione" (ricerca, scadenza, membri) resta
esattamente com'è, sotto la matrice.

## Cosa resta fuori, esplicitamente

- **Nessuna applicazione runtime di un limite numerico.** Costruisco dove
  il numero si *imposta* (la matrice), non dove si *applica*: oggi nessuna
  funzionalità numerica esiste davvero in SportMentalCoach (a differenza di
  iPricer), quindi non c'è un punto del codice che debba leggerla. Quando
  ne nascerà una, la lettura si aggiunge lì, non qui.
- **Nessuna funzionalità creabile dal pannello.** Il catalogo cresce solo
  via migrazione, quando uno sviluppatore collega una funzionalità reale.
- **Nessun cambio a `organization_packages`, agli stati, alle scadenze.**
- **Nessun salvataggio per singola cella.** Un pulsante, tutta la matrice.

## Rischi, detti prima

- **Il vincolo di riferimento su `package_features.feature_code` va
  applicato dopo aver seminato `features`**, non prima — altrimenti la
  migrazione fallisce sul vincolo appena aggiunto se `package_features`
  avesse già righe con codici sconosciuti. In pratica non è un problema:
  la tabella è vuota in produzione (nessun pacchetto ha ancora feature
  assegnate), ma l'ordine delle istruzioni nella migrazione conta comunque.
- **La matrice oggi ha una riga sola.** È corretto e atteso — il catalogo
  cresce quando cresce il prodotto, non prima.
