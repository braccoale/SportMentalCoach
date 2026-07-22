# Contratto Coach (Fase A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un coach non può pubblicare il profilo né accettare prenotazioni finché non ha firmato il Contratto di Adesione Coach, e della firma resta una prova opponibile.

**Architecture:** Il contratto è un dato versionato in `lib/core/legal/coach-agreement.ts` (stesso pattern di `processors.ts`), da cui derivano la pagina pubblica, lo step di firma e l'elenco delle clausole ex art. 1341. La firma finisce in `agreement_acceptances`, tabella append-only con hash del documento. Il gate è applicato due volte: redirect nel layout coach (UX) e controllo server-side nelle azioni che contano (sicurezza).

**Tech Stack:** Next.js 15 (App Router, server actions), TypeScript, Drizzle ORM su Postgres/Supabase, Tailwind v4, `node:test` via `npx tsx --test`, Playwright per l'e2e.

## Global Constraints

- Spec di riferimento: `docs/superpowers/specs/2026-07-22-coach-agreement-design.md`. Questo piano copre **solo la Fase A**. La Fase B (minori) ha un piano separato.
- Valori economici, verbatim dallo spec: commissione **20%**, non-circumvention **18 mesi**, penale **€500 o 12× la commissione media persa se maggiore**, buy-out **3 mesi di commissione stimata**, preavviso modifiche **30 giorni**.
- Versione iniziale del contratto: `'2026-07-1'`.
- Tutta la copy utente è in **italiano**. Commenti e nomi di codice in **inglese**, come il resto del repo.
- Il testo NON è testo legale definitivo: va rivisto da un avvocato prima della messa online. Non rimuovere il commento che lo dice.
- La tabella `agreement_acceptances` è **append-only**: nessun `UPDATE`, nessun `DELETE`, mai.
- Non toccare `lib/core/guardians/` né `athleteGuardians`: sono Fase B.
- Nuove migration solo con `pnpm db:generate` (drizzle-kit). Non scrivere SQL a mano.

---

### Task 1: Runner dei test + documento contrattuale come dato

Il repo oggi non ha test unitari, solo `e2e/happy-path.mjs`. Questo task introduce il runner (`node:test` via `tsx`, già verificato funzionante con gli alias `@/`) e il modulo del contratto.

**Files:**
- Modify: `package.json:3-14` (aggiunta script `test`)
- Create: `lib/core/legal/coach-agreement.ts`
- Test: `tests/legal/coach-agreement.test.ts`

**Interfaces:**
- Consumes: nulla.
- Produces:
  - `COACH_AGREEMENT: CoachAgreement`
  - `CURRENT_COACH_AGREEMENT_VERSION: string`
  - `type AgreementSection = { id: string; title: string; body: string[]; vexatious: boolean }`
  - `type CoachAgreement = { version: string; effectiveDate: string; commissionPercent: number; nonCircumventionMonths: number; penaltyAmountEur: number; buyoutMonths: number; noticeDays: number; sections: AgreementSection[] }`
  - `vexatiousSections(agreement?: CoachAgreement): AgreementSection[]`
  - `renderAgreementText(agreement?: CoachAgreement): string`
  - `hashAgreement(agreement?: CoachAgreement): string` (SHA-256 esadecimale)

- [ ] **Step 1: Aggiungi lo script di test**

In `package.json`, dentro `"scripts"`, subito dopo la riga `"e2e": "node e2e/happy-path.mjs",`:

```json
    "test": "tsx --test tests/**/*.test.ts",
```

- [ ] **Step 2: Scrivi il test che fallisce**

Crea `tests/legal/coach-agreement.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COACH_AGREEMENT,
  CURRENT_COACH_AGREEMENT_VERSION,
  hashAgreement,
  renderAgreementText,
  vexatiousSections,
} from '@/lib/core/legal/coach-agreement';

test('la versione corrente coincide con quella del documento', () => {
  assert.equal(CURRENT_COACH_AGREEMENT_VERSION, COACH_AGREEMENT.version);
  assert.match(COACH_AGREEMENT.version, /^\d{4}-\d{2}-\d+$/);
});

test('i valori economici sono quelli approvati nello spec', () => {
  assert.equal(COACH_AGREEMENT.commissionPercent, 20);
  assert.equal(COACH_AGREEMENT.nonCircumventionMonths, 18);
  assert.equal(COACH_AGREEMENT.penaltyAmountEur, 500);
  assert.equal(COACH_AGREEMENT.buyoutMonths, 3);
  assert.equal(COACH_AGREEMENT.noticeDays, 30);
});

test('gli id delle sezioni sono unici', () => {
  const ids = COACH_AGREEMENT.sections.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('vexatiousSections restituisce solo le clausole da approvare specificamente', () => {
  const vex = vexatiousSections();
  assert.ok(vex.length >= 4, 'attese almeno 4 clausole vessatorie');
  assert.ok(vex.every((s) => s.vexatious));
  // La non-circumvention e la penale sono il cuore dell'art. 1341.
  const ids = vex.map((s) => s.id);
  assert.ok(ids.includes('non-circumvention'));
});

test('il testo renderizzato contiene i numeri economici interpolati', () => {
  const text = renderAgreementText();
  assert.ok(text.includes('20%'), 'la commissione deve comparire nel testo');
  assert.ok(text.includes('18 mesi'));
  assert.ok(text.includes('500'));
});

test('hashAgreement è stabile e cambia se il documento cambia', () => {
  const a = hashAgreement();
  assert.equal(a, hashAgreement());
  assert.match(a, /^[0-9a-f]{64}$/);

  const modified = {
    ...COACH_AGREEMENT,
    commissionPercent: 25,
  };
  assert.notEqual(hashAgreement(modified), a);
});
```

- [ ] **Step 3: Esegui il test e verifica che fallisca**

Run: `npx tsx --test tests/legal/coach-agreement.test.ts`
Expected: FAIL — `Cannot find module '@/lib/core/legal/coach-agreement'`.

- [ ] **Step 4: Scrivi il modulo del contratto**

Crea `lib/core/legal/coach-agreement.ts`. Il testo è lungo ma va scritto per intero: è il deliverable.

```ts
import { createHash } from 'node:crypto';

/**
 * Contratto di Adesione Coach — il documento che un coach firma prima di
 * poter pubblicare il profilo e accettare prenotazioni.
 *
 * Tenuto come dato e non come JSX per la stessa ragione di `processors.ts`:
 * i numeri economici e l'elenco delle clausole vessatorie devono avere una
 * sola fonte. La pagina pubblica, lo step di firma e l'elenco ex art. 1341
 * derivano tutti da qui, quindi non possono divergere.
 *
 * ATTENZIONE: questo NON è testo legale definitivo. Struttura e clausole sono
 * state validate a livello di prodotto; il testo va rivisto da un avvocato
 * prima della messa online.
 *
 * Quando cambi qualcosa di sostanziale, BUMPA `version`: i coach che hanno
 * firmato la versione precedente verranno riportati sullo step di firma.
 */
export type AgreementSection = {
  /** Stabile: finisce nell'elenco ex art. 1341 e nelle ancore della pagina. */
  id: string;
  title: string;
  /** Un elemento per paragrafo. */
  body: string[];
  /**
   * True per le clausole che l'art. 1341 c.c. richiede di approvare
   * specificamente e per iscritto. Senza la seconda spunta dedicata queste
   * clausole sono inefficaci — è l'errore più comune e il più costoso.
   */
  vexatious: boolean;
};

export type CoachAgreement = {
  version: string;
  effectiveDate: string;
  commissionPercent: number;
  nonCircumventionMonths: number;
  penaltyAmountEur: number;
  buyoutMonths: number;
  noticeDays: number;
  sections: AgreementSection[];
};

const COMMISSION_PERCENT = 20;
const NON_CIRCUMVENTION_MONTHS = 18;
const PENALTY_EUR = 500;
const BUYOUT_MONTHS = 3;
const NOTICE_DAYS = 30;

export const COACH_AGREEMENT: CoachAgreement = {
  version: '2026-07-1',
  effectiveDate: '22 luglio 2026',
  commissionPercent: COMMISSION_PERCENT,
  nonCircumventionMonths: NON_CIRCUMVENTION_MONTHS,
  penaltyAmountEur: PENALTY_EUR,
  buyoutMonths: BUYOUT_MONTHS,
  noticeDays: NOTICE_DAYS,
  sections: [
    {
      id: 'natura-del-rapporto',
      title: '1. Natura del rapporto',
      vexatious: false,
      body: [
        'KaiPai è un intermediario tecnologico: mette a disposizione una piattaforma che consente ad atleti e coach di incontrarsi, concordare e svolgere sessioni di mental coaching. KaiPai non è datore di lavoro, non è committente e non esercita alcun potere direttivo, disciplinare o di controllo sull’attività professionale del Coach.',
        'Il Coach opera come professionista autonomo: sceglie liberamente i propri orari, i propri metodi e i propri prezzi, resta titolare del proprio regime fiscale e previdenziale, ed emette autonomamente i documenti fiscali dovuti verso l’Atleta o verso KaiPai secondo quanto previsto dal presente contratto.',
        'Il Coach dichiara di essere in possesso dei titoli, delle qualifiche e delle abilitazioni che dichiara sul proprio profilo, e di mantenere attiva una copertura assicurativa per la responsabilità civile professionale adeguata all’attività svolta.',
        'Il presente contratto non costituisce rapporto di lavoro subordinato, di collaborazione coordinata e continuativa, di agenzia né di associazione in partecipazione.',
      ],
    },
    {
      id: 'commissione',
      title: '2. Commissione della piattaforma',
      vexatious: false,
      body: [
        `Per ogni sessione prenotata tramite la piattaforma, KaiPai trattiene una commissione pari al ${COMMISSION_PERCENT}% del prezzo lordo della sessione. La commissione remunera l’intermediazione, l’infrastruttura tecnica (calendario, videochiamata, messaggistica, pagamenti) e l’attività di acquisizione degli atleti.`,
        'La commissione si applica a tutte le sessioni svolte con un Atleta conosciuto tramite la piattaforma, comprese quelle successive alla prima, per tutta la durata prevista dall’articolo 4 (Non elusione).',
        'Il corrispettivo netto è accreditato al Coach secondo i termini di pagamento indicati nell’area riservata, a seguito del completamento della sessione e salvo contestazioni o richieste di rimborso in corso.',
        `KaiPai può modificare la misura della commissione dandone comunicazione scritta al Coach con almeno ${NOTICE_DAYS} giorni di preavviso. Entro tale termine il Coach può recedere dal presente contratto senza oneri, con effetto dalla data di efficacia della modifica. La prosecuzione dell’attività sulla piattaforma dopo tale data vale come accettazione.`,
        'Il Coach si impegna a non offrire, sui propri canali diretti e nei confronti di Atleti conosciuti tramite la piattaforma, il medesimo servizio a condizioni economiche più favorevoli di quelle pubblicate su KaiPai. L’impegno è limitato a tale ambito e non riguarda gli altri canali, i clienti propri del Coach né le condizioni praticate al di fuori di essi.',
      ],
    },
    {
      id: 'obblighi-di-servizio',
      title: '3. Obblighi di servizio',
      vexatious: false,
      body: [
        'Il Coach si impegna a svolgere le sessioni prenotate tramite gli strumenti della piattaforma, inclusa la videochiamata integrata, che costituisce anche la modalità con cui viene attestato lo svolgimento della sessione.',
        'Il Coach si impegna a mantenere aggiornata la propria disponibilità, a presentarsi puntualmente alle sessioni confermate e a comunicare tempestivamente eventuali impedimenti. Assenze non comunicate e cancellazioni tardive reiterate costituiscono inadempimento e possono comportare la sospensione o la rimozione del profilo.',
        'Il Coach si impegna a mantenere un livello qualitativo adeguato. KaiPai può sospendere o rimuovere il profilo del Coach la cui valutazione media si collochi stabilmente al di sotto della soglia minima indicata nell’area riservata, previo confronto con il Coach.',
      ],
    },
    {
      id: 'non-circumvention',
      title: '4. Non elusione della piattaforma',
      vexatious: true,
      body: [
        'Si definisce «Atleta KaiPai» l’atleta con cui il Coach è entrato in contatto per la prima volta tramite la piattaforma. La presente clausola non riguarda in alcun modo gli atleti già seguiti dal Coach prima di tale contatto, né quelli acquisiti attraverso canali propri e indipendenti.',
        `Per ${NON_CIRCUMVENTION_MONTHS} mesi decorrenti dall’ultima sessione svolta tramite la piattaforma, il Coach si impegna a prenotare e far pagare tramite KaiPai ogni sessione svolta con un Atleta KaiPai.`,
        'Nello stesso periodo il Coach si impegna in particolare a non proporre all’Atleta KaiPai il pagamento diretto o lo svolgimento delle sessioni al di fuori della piattaforma, a non sollecitare lo spostamento della relazione su altri canali, e a non richiedere né fornire recapiti personali prima che la prima sessione sia stata regolarmente pagata tramite la piattaforma.',
        `In caso di violazione accertata, il Coach è tenuto a corrispondere a KaiPai una penale pari a euro ${PENALTY_EUR},00 per ciascun Atleta KaiPai coinvolto, ovvero, se di importo maggiore, pari a dodici volte la commissione media percepita da KaiPai sulle sessioni svolte dal Coach con quell’Atleta. Resta salvo il risarcimento del maggior danno.`,
        'KaiPai può inoltre sospendere o rimuovere il profilo del Coach e trattenere gli importi non ancora liquidati fino a definizione della contestazione.',
        `Il Coach può in ogni momento liberarsi dell’obbligo previsto dal presente articolo nei confronti di uno specifico Atleta KaiPai, corrispondendo a KaiPai un importo una tantum pari a ${BUYOUT_MONTHS} mensilità di commissione stimata sulla base delle sessioni svolte con quell’Atleta nei mesi precedenti. Effettuato il pagamento, il Coach è libero di proseguire il rapporto con quell’Atleta al di fuori della piattaforma.`,
      ],
    },
    {
      id: 'minori',
      title: '5. Atleti minorenni',
      vexatious: true,
      body: [
        'La piattaforma è rivolta ad atleti a partire dai 15 anni di età. Il Coach dichiara espressamente se intende accettare o meno atleti di età compresa tra 15 e 17 anni. In assenza di tale dichiarazione il Coach non riceve richieste da parte di atleti minorenni.',
        'Il Coach che accetta atleti minorenni dichiara di non trovarsi in alcuna delle condizioni ostative previste dal D.Lgs. 39/2014 e si impegna a esibire, su richiesta di KaiPai, il certificato penale del casellario giudiziale, nonché a mantenere attiva una copertura assicurativa per la responsabilità civile professionale.',
        'Nei confronti degli atleti minorenni il Coach si impegna a non intrattenere alcun contatto privato o al di fuori della piattaforma, a tenere informato il genitore o tutore delle circostanze rilevanti per il percorso, e a riconoscere al genitore o tutore il diritto di essere presente o comunque raggiungibile durante le sessioni.',
        'Il Coach prende atto che l’attività di mental coaching non costituisce psicoterapia né attività diagnostica o sanitaria. In presenza di segnali riconducibili a condizioni cliniche — tra cui disturbi del comportamento alimentare, autolesionismo, abuso o maltrattamento — il Coach si impegna a interrompere il percorso, a indirizzare l’Atleta a un professionista sanitario e a informare senza ritardo il genitore o tutore.',
        'La violazione del presente articolo comporta la rimozione immediata del profilo, senza il termine di contraddittorio previsto dall’articolo 6.',
      ],
    },
    {
      id: 'segnalazioni-e-sanzioni',
      title: '6. Segnalazioni, sospensione e contraddittorio',
      vexatious: true,
      body: [
        'KaiPai può sospendere in via cautelare il profilo del Coach in presenza di segnalazioni di atleti o di elementi che facciano ragionevolmente ritenere violato il presente contratto, ivi compresi gli indicatori rilevati automaticamente sui messaggi scambiati in piattaforma.',
        'Salvo quanto previsto dall’articolo 5, prima di adottare un provvedimento definitivo KaiPai comunica al Coach gli elementi contestati e assegna un termine non inferiore a 7 giorni per presentare le proprie osservazioni.',
        'Il Coach può recedere dal presente contratto in qualsiasi momento con comunicazione scritta, fermi restando gli obblighi già maturati, le sessioni già confermate e l’articolo 4.',
      ],
    },
    {
      id: 'responsabilita',
      title: '7. Responsabilità',
      vexatious: true,
      body: [
        'Il Coach è l’unico responsabile del contenuto, della qualità e degli esiti del percorso professionale offerto, nonché della veridicità delle informazioni pubblicate sul proprio profilo.',
        'KaiPai non risponde dell’operato del Coach nei confronti degli Atleti. Nei limiti consentiti dalla legge, la responsabilità di KaiPai verso il Coach per qualsiasi titolo è limitata all’importo delle commissioni percepite da KaiPai sulle sessioni del Coach nei dodici mesi precedenti l’evento.',
        'Il Coach manleva KaiPai dalle pretese di terzi derivanti dalla propria attività professionale o dalla violazione del presente contratto.',
      ],
    },
    {
      id: 'legge-e-foro',
      title: '8. Legge applicabile e foro competente',
      vexatious: true,
      body: [
        'Il presente contratto è regolato dalla legge italiana.',
        'Per ogni controversia relativa alla sua interpretazione, esecuzione o risoluzione è competente in via esclusiva il foro della sede di KaiPai, salvo che il Coach rivesta la qualità di consumatore, nel qual caso resta competente il foro del luogo di residenza o domicilio elettivo del medesimo.',
      ],
    },
  ],
};

export const CURRENT_COACH_AGREEMENT_VERSION = COACH_AGREEMENT.version;

/**
 * Le sole clausole che richiedono la seconda spunta ex art. 1341 c.c.
 * Derivate, mai riscritte a mano: un elenco copiato diverge dal corpo del
 * contratto al primo ritocco, e clausole non elencate sono inefficaci.
 */
export function vexatiousSections(
  agreement: CoachAgreement = COACH_AGREEMENT
): AgreementSection[] {
  return agreement.sections.filter((s) => s.vexatious);
}

/**
 * Il documento in testo piano. È ciò su cui si calcola l'hash, quindi il
 * formato deve restare deterministico: qualsiasi cambio di formattazione
 * invalida gli hash già salvati, che vanno interpretati come "versione
 * diversa" — motivo in più per bumpare `version` insieme al testo.
 */
export function renderAgreementText(
  agreement: CoachAgreement = COACH_AGREEMENT
): string {
  const head = [
    'Contratto di Adesione Coach KaiPai',
    `Versione ${agreement.version} — in vigore dal ${agreement.effectiveDate}`,
  ];
  const body = agreement.sections.map((s) =>
    [s.title, ...s.body].join('\n')
  );
  return [...head, ...body].join('\n\n');
}

/** SHA-256 del testo: prova di che cosa esattamente è stato firmato. */
export function hashAgreement(
  agreement: CoachAgreement = COACH_AGREEMENT
): string {
  return createHash('sha256')
    .update(renderAgreementText(agreement), 'utf8')
    .digest('hex');
}
```

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx tsx --test tests/legal/coach-agreement.test.ts`
Expected: PASS — `# pass 6`, `# fail 0`.

- [ ] **Step 6: Verifica che lo script npm funzioni**

Run: `pnpm test`
Expected: gli stessi 6 test passano.

- [ ] **Step 7: Commit**

```bash
git add package.json lib/core/legal/coach-agreement.ts tests/legal/coach-agreement.test.ts
git commit -m "Coach agreement: versioned contract document + test runner"
```

---

### Task 2: Tabella delle accettazioni

**Files:**
- Modify: `lib/db/schema.ts` (nuova tabella in fondo, prima dei type export finali)
- Create: `lib/db/migrations/00NN_*.sql` (generata da drizzle-kit, nome automatico)

**Interfaces:**
- Consumes: `users` da `lib/db/schema.ts`.
- Produces: `agreementAcceptances`, `type AgreementAcceptance`, `type NewAgreementAcceptance`.

- [ ] **Step 1: Aggiungi la tabella allo schema**

In `lib/db/schema.ts`, dopo il blocco `athleteGuardians` e i suoi type export (fine file), aggiungi:

```ts
// Firme dei documenti contrattuali. Append-only: ogni firma è una riga nuova,
// nessun UPDATE e nessun DELETE. La storia del consenso *è* la prova, e una
// riga sovrascritta è una prova distrutta.
//
// `documentHash` è lo SHA-256 del testo renderizzato al momento della firma:
// è ciò che permette, anni dopo, di dimostrare non solo *che* il coach ha
// firmato ma *che cosa* esattamente ha firmato.
export const agreementAcceptances = pgTable(
  'agreement_acceptances',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    // Quale documento: oggi solo 'coach'.
    agreementKey: varchar('agreement_key', { length: 40 }).notNull(),
    version: varchar('version', { length: 20 }).notNull(),
    // Accettazione generale del documento.
    acceptedTerms: boolean('accepted_terms').notNull().default(false),
    // Approvazione specifica delle clausole ex art. 1341 c.c. Separata dalla
    // precedente perché la legge richiede proprio che lo sia.
    acceptedVexatious: boolean('accepted_vexatious').notNull().default(false),
    // Nome digitato dal firmatario, confrontato con quello dell'account.
    signatureName: varchar('signature_name', { length: 200 }).notNull(),
    ipAddress: varchar('ip_address', { length: 64 }),
    userAgent: text('user_agent'),
    documentHash: varchar('document_hash', { length: 64 }).notNull(),
    acceptedAt: timestamp('accepted_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    index('agreement_acceptances_user_id_idx').on(table.userId),
    index('agreement_acceptances_lookup_idx').on(
      table.userId,
      table.agreementKey,
      table.version
    ),
  ]
);

export type AgreementAcceptance = typeof agreementAcceptances.$inferSelect;
export type NewAgreementAcceptance = typeof agreementAcceptances.$inferInsert;
```

- [ ] **Step 2: Genera la migration**

Run: `pnpm db:generate`
Expected: viene creato `lib/db/migrations/00NN_<nome>.sql` contenente `CREATE TABLE "agreement_acceptances"` e i due indici. Nota: la migration includerà anche `athlete_guardians` se non è ancora stata generata — è atteso e va bene, quella tabella è già nello schema.

- [ ] **Step 3: Ispeziona la migration generata**

Run: `ls lib/db/migrations/*.sql | tail -1`
Poi apri il file e verifica a occhio che contenga `CREATE TABLE "agreement_acceptances"` e nessun `DROP TABLE` inatteso su tabelle esistenti. Se compare un `DROP`, fermati e segnala: significa che lo schema locale ha divergenze non correlate.

- [ ] **Step 4: Applica la migration**

Run: `pnpm db:migrate`
Expected: nessun errore; la tabella esiste.

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/
git commit -m "Coach agreement: append-only agreement_acceptances table"
```

---

### Task 3: Modulo di dominio delle accettazioni

**Files:**
- Create: `lib/core/legal/acceptance.ts`
- Test: `tests/legal/signature-name.test.ts`

**Interfaces:**
- Consumes: `COACH_AGREEMENT`, `CURRENT_COACH_AGREEMENT_VERSION`, `hashAgreement` (Task 1); `agreementAcceptances` (Task 2); `Result` da `@/lib/core/result`.
- Produces:
  - `COACH_AGREEMENT_KEY = 'coach'`
  - `signatureMatchesName(signature: string, name: string | null, lastName: string | null): boolean`
  - `hasAcceptedCoachAgreement(userId: number): Promise<boolean>`
  - `recordCoachAgreementAcceptance(params: { userId: number; signatureName: string; acceptedTerms: boolean; acceptedVexatious: boolean; ipAddress?: string | null; userAgent?: string | null }): Promise<Result>`

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `tests/legal/signature-name.test.ts`. Testiamo la sola logica pura: il confronto della firma. Le funzioni che toccano il DB sono coperte dall'e2e nel Task 7 — questo repo non ha un database di test.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signatureMatchesName } from '@/lib/core/legal/acceptance';

test('accetta la firma che corrisponde a nome e cognome', () => {
  assert.equal(signatureMatchesName('Mario Rossi', 'Mario', 'Rossi'), true);
});

test('ignora maiuscole, accenti e spazi ripetuti', () => {
  assert.equal(signatureMatchesName('  mario   rossi ', 'Mario', 'Rossi'), true);
  assert.equal(signatureMatchesName('NICOLÒ Bò', 'Nicolo', 'Bo'), true);
});

test('accetta anche cognome-nome invertiti', () => {
  assert.equal(signatureMatchesName('Rossi Mario', 'Mario', 'Rossi'), true);
});

test('rifiuta una firma diversa', () => {
  assert.equal(signatureMatchesName('Luigi Verdi', 'Mario', 'Rossi'), false);
  assert.equal(signatureMatchesName('Mario', 'Mario', 'Rossi'), false);
  assert.equal(signatureMatchesName('', 'Mario', 'Rossi'), false);
});

test('rifiuta quando l’account non ha un nome completo', () => {
  assert.equal(signatureMatchesName('Mario Rossi', 'Mario', null), false);
  assert.equal(signatureMatchesName('Mario Rossi', null, null), false);
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx tsx --test tests/legal/signature-name.test.ts`
Expected: FAIL — `Cannot find module '@/lib/core/legal/acceptance'`.

- [ ] **Step 3: Scrivi il modulo**

Crea `lib/core/legal/acceptance.ts`:

```ts
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agreementAcceptances } from '@/lib/db/schema';
import type { Result } from '@/lib/core/result';
import {
  CURRENT_COACH_AGREEMENT_VERSION,
  hashAgreement,
} from './coach-agreement';

/** Chiave del documento in `agreement_acceptances`. */
export const COACH_AGREEMENT_KEY = 'coach';

/** Minuscolo, senza accenti, spazi normalizzati. */
function normalizeName(value: string): string {
  // Scrivi l'intervallo dei segni diacritici con le escape ̀-ͯ, non
  // con i caratteri combinanti letterali: incollati in un editor spariscono.
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * La firma vale se corrisponde al nome dell'account. Accettiamo l'ordine
 * invertito perché "Rossi Mario" è come mezza Italia scrive il proprio nome
 * su un modulo, e rifiutarlo sarebbe un ostacolo senza alcun valore
 * probatorio aggiuntivo.
 */
export function signatureMatchesName(
  signature: string,
  name: string | null,
  lastName: string | null
): boolean {
  const first = normalizeName(name ?? '');
  const last = normalizeName(lastName ?? '');
  if (!first || !last) return false;

  const signed = normalizeName(signature);
  return signed === `${first} ${last}` || signed === `${last} ${first}`;
}

/** True se il coach ha firmato la versione corrente del contratto. */
export async function hasAcceptedCoachAgreement(
  userId: number
): Promise<boolean> {
  const [row] = await db
    .select({ id: agreementAcceptances.id })
    .from(agreementAcceptances)
    .where(
      and(
        eq(agreementAcceptances.userId, userId),
        eq(agreementAcceptances.agreementKey, COACH_AGREEMENT_KEY),
        eq(agreementAcceptances.version, CURRENT_COACH_AGREEMENT_VERSION),
        eq(agreementAcceptances.acceptedTerms, true),
        eq(agreementAcceptances.acceptedVexatious, true)
      )
    )
    .limit(1);
  return !!row;
}

/**
 * Registra la firma. Append-only: nessun controllo di esistenza e nessun
 * upsert: firmare due volte lascia due righe, che è esattamente ciò che
 * vogliamo poter ricostruire.
 */
export async function recordCoachAgreementAcceptance(params: {
  userId: number;
  signatureName: string;
  acceptedTerms: boolean;
  acceptedVexatious: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<Result> {
  if (!params.acceptedTerms) {
    return { ok: false, error: 'Devi accettare il contratto per proseguire.' };
  }
  if (!params.acceptedVexatious) {
    return {
      ok: false,
      error:
        'Devi approvare specificamente le clausole elencate ai sensi dell’art. 1341 c.c.',
    };
  }

  await db.insert(agreementAcceptances).values({
    userId: params.userId,
    agreementKey: COACH_AGREEMENT_KEY,
    version: CURRENT_COACH_AGREEMENT_VERSION,
    acceptedTerms: true,
    acceptedVexatious: true,
    signatureName: params.signatureName.trim().slice(0, 200),
    ipAddress: params.ipAddress?.slice(0, 64) ?? null,
    userAgent: params.userAgent?.slice(0, 1000) ?? null,
    documentHash: hashAgreement(),
    createdBy: params.userId,
  });

  return { ok: true };
}
```

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx tsx --test tests/legal/signature-name.test.ts`
Expected: PASS — `# pass 5`, `# fail 0`.

Nota: il modulo importa `server-only`, ma il test importa solo `signatureMatchesName`. Se `server-only` fa fallire l'import sotto `tsx`, sposta `signatureMatchesName` e `normalizeName` in `lib/core/legal/signature.ts` (senza `server-only`), re-esportale da `acceptance.ts` con `export * from './signature';` e fai puntare il test al nuovo file. Stesso pattern di `guardians/age.ts`, che è puro proprio per questa ragione.

- [ ] **Step 5: Commit**

```bash
git add lib/core/legal/acceptance.ts tests/legal/signature-name.test.ts
git commit -m "Coach agreement: acceptance domain module"
```

---

### Task 4: Pagina pubblica del contratto

**Files:**
- Create: `app/(marketplace)/legal/coach-agreement/page.tsx`
- Modify: `components/footer.tsx` (link al contratto)

**Interfaces:**
- Consumes: `COACH_AGREEMENT`, `vexatiousSections` (Task 1); `LegalPage` da `app/(marketplace)/legal-layout.tsx`.
- Produces: la rotta pubblica `/legal/coach-agreement`.

- [ ] **Step 1: Crea la pagina**

Crea `app/(marketplace)/legal/coach-agreement/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { LegalPage } from '../../legal-layout';
import {
  COACH_AGREEMENT,
  vexatiousSections,
} from '@/lib/core/legal/coach-agreement';

export const metadata: Metadata = {
  title: 'Contratto di Adesione Coach',
  description:
    'Il contratto che regola il rapporto tra KaiPai e i coach: commissione, obblighi di servizio, non elusione della piattaforma e atleti minorenni.',
};

export default function CoachAgreementPage() {
  return (
    <LegalPage
      title="Contratto di Adesione Coach"
      updated={`${COACH_AGREEMENT.effectiveDate} — versione ${COACH_AGREEMENT.version}`}
    >
      <p>
        Il presente contratto si applica ai coach che offrono i propri servizi
        sulla piattaforma KaiPai e si aggiunge ai Termini e Condizioni, alla
        Privacy Policy e alla Cookie Policy.
      </p>

      {COACH_AGREEMENT.sections.map((section) => (
        <section key={section.id} id={section.id}>
          <h2>{section.title}</h2>
          {section.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </section>
      ))}

      <h2>Approvazione specifica delle clausole (art. 1341 c.c.)</h2>
      <p>
        Ai sensi e per gli effetti degli articoli 1341 e 1342 del codice civile,
        il Coach approva specificamente le seguenti clausole:
      </p>
      <ul>
        {vexatiousSections().map((section) => (
          <li key={section.id}>{section.title}</li>
        ))}
      </ul>
    </LegalPage>
  );
}
```

- [ ] **Step 2: Aggiungi il link nel footer**

Apri `components/footer.tsx`, individua l'elenco dei link legali (quelli verso `/terms`, `/privacy`, `/cookie`) e aggiungi, con lo stesso markup degli altri, una voce:

```tsx
<Link href="/legal/coach-agreement">Contratto Coach</Link>
```

Adatta classi e wrapper a quelli già usati dalle voci vicine — non introdurre uno stile nuovo.

- [ ] **Step 3: Verifica in locale**

Run: `pnpm dev` (in background) e apri `http://localhost:3000/legal/coach-agreement`.
Expected: le 8 sezioni sono rese, e in fondo l'elenco art. 1341 contiene esattamente le sezioni 4, 5, 6, 7, 8 (quelle con `vexatious: true`), non altre.

- [ ] **Step 4: Verifica che il build TypeScript passi**

Run: `npx tsc --noEmit`
Expected: nessun errore nei file toccati.

- [ ] **Step 5: Commit**

```bash
git add "app/(marketplace)/legal/coach-agreement/page.tsx" components/footer.tsx
git commit -m "Coach agreement: public contract page"
```

---

### Task 5: Step di firma bloccante

**Files:**
- Create: `app/(dashboard)/onboarding/coach-agreement/page.tsx`
- Create: `app/(dashboard)/onboarding/coach-agreement/actions.ts`
- Create: `app/(dashboard)/onboarding/coach-agreement/agreement-form.tsx`

**Interfaces:**
- Consumes: `COACH_AGREEMENT`, `vexatiousSections` (Task 1); `recordCoachAgreementAcceptance`, `signatureMatchesName`, `hasAcceptedCoachAgreement` (Task 3); `requireRole` da `@/lib/core/auth`; `ActionState` da `@/lib/auth/middleware`.
- Produces: la rotta `/onboarding/coach-agreement` e `signCoachAgreementAction(prevState, formData)`.

- [ ] **Step 1: Scrivi la server action**

Crea `app/(dashboard)/onboarding/coach-agreement/actions.ts`:

```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/core/auth';
import {
  recordCoachAgreementAcceptance,
  signatureMatchesName,
} from '@/lib/core/legal/acceptance';
import type { ActionState } from '@/lib/auth/middleware';

export async function signCoachAgreementAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const user = await requireRole('coach');

  const signature = ((formData.get('signature') as string) ?? '').trim();
  const acceptedTerms = formData.get('acceptTerms') === 'on';
  const acceptedVexatious = formData.get('acceptVexatious') === 'on';

  if (!signatureMatchesName(signature, user.name, user.lastName)) {
    return {
      error:
        'La firma deve corrispondere al nome e cognome del tuo account. Se non sono corretti, aggiornali dal profilo.',
    };
  }

  // Prova di chi ha firmato e da dove. Dietro proxy il client reale è il
  // primo elemento di x-forwarded-for.
  const h = await headers();
  const ipAddress =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    null;

  const result = await recordCoachAgreementAcceptance({
    userId: user.id,
    signatureName: signature,
    acceptedTerms,
    acceptedVexatious,
    ipAddress,
    userAgent: h.get('user-agent'),
  });

  if (!result.ok) {
    return { error: result.error };
  }

  redirect('/dashboard/coach');
}
```

- [ ] **Step 2: Scrivi il form client**

Crea `app/(dashboard)/onboarding/coach-agreement/agreement-form.tsx`:

```tsx
'use client';

import { useActionState, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { signCoachAgreementAction } from './actions';
import type { ActionState } from '@/lib/auth/middleware';

export function AgreementForm({
  vexatiousTitles,
  children,
}: {
  vexatiousTitles: string[];
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    signCoachAgreementAction,
    { error: '' }
  );
  // Firmare senza aver scorso il documento è la firma che non regge. Il
  // pulsante resta chiuso finché il testo non è stato percorso fino in fondo.
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  function onScroll() {
    const el = boxRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
      setScrolledToEnd(true);
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      <div
        ref={boxRef}
        onScroll={onScroll}
        className="h-96 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 text-[15px] leading-relaxed text-gray-700 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-gray-900 [&_p]:mt-2"
      >
        {children}
      </div>

      {!scrolledToEnd && (
        <p className="text-sm text-gray-500">
          Scorri il contratto fino in fondo per poterlo firmare.
        </p>
      )}

      <label className="flex items-start gap-3 text-sm text-gray-700">
        <input type="checkbox" name="acceptTerms" className="mt-1" required />
        <span>
          Dichiaro di aver letto e di accettare integralmente il Contratto di
          Adesione Coach.
        </span>
      </label>

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <label className="flex items-start gap-3 text-sm text-gray-700">
          <input
            type="checkbox"
            name="acceptVexatious"
            className="mt-1"
            required
          />
          <span>
            Ai sensi degli artt. 1341 e 1342 c.c. approvo specificamente le
            clausole:{' '}
            <strong>{vexatiousTitles.join('; ')}</strong>.
          </span>
        </label>
      </div>

      <div>
        <label
          htmlFor="signature"
          className="mb-1.5 block text-sm font-medium text-gray-700"
        >
          Firma: scrivi il tuo nome e cognome
        </label>
        <input
          id="signature"
          name="signature"
          type="text"
          required
          maxLength={200}
          autoComplete="off"
          placeholder="Nome Cognome"
          className="w-full rounded-full border border-gray-300 px-4 py-2.5 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || !scrolledToEnd}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Firma in corso…
          </>
        ) : (
          'Firma e prosegui'
        )}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Scrivi la pagina**

Crea `app/(dashboard)/onboarding/coach-agreement/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/core/auth';
import {
  COACH_AGREEMENT,
  vexatiousSections,
} from '@/lib/core/legal/coach-agreement';
import { hasAcceptedCoachAgreement } from '@/lib/core/legal/acceptance';
import { AgreementForm } from './agreement-form';

export default async function CoachAgreementOnboardingPage() {
  const user = await requireRole('coach');

  // Già firmato: non lo si fa firmare di nuovo per errore di navigazione.
  if (await hasAcceptedCoachAgreement(user.id)) {
    redirect('/dashboard/coach');
  }

  const hasFullName = !!(user.name?.trim() && user.lastName?.trim());

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-bold text-gray-900">
        Contratto di Adesione Coach
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        Versione {COACH_AGREEMENT.version} — in vigore dal{' '}
        {COACH_AGREEMENT.effectiveDate}. Per pubblicare il profilo e accettare
        prenotazioni serve la tua firma.
      </p>

      {!hasFullName ? (
        <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm text-amber-900">
            Prima di firmare inserisci nome e cognome nel tuo profilo: la firma
            deve corrispondere all’intestazione dell’account.
          </p>
          <a
            href="/dashboard/coach/profile"
            className="mt-4 inline-block rounded-full bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white"
          >
            Vai al profilo
          </a>
        </div>
      ) : (
        <div className="mt-8">
          <AgreementForm
            vexatiousTitles={vexatiousSections().map((s) => s.title)}
          >
            {COACH_AGREEMENT.sections.map((section) => (
              <section key={section.id}>
                <h2>{section.title}</h2>
                {section.body.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </section>
            ))}
          </AgreementForm>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Verifica manuale**

Con `pnpm dev` attivo, accedi come coach e apri `http://localhost:3000/onboarding/coach-agreement`.
Expected: il pulsante "Firma e prosegui" è disabilitato; scorrendo il riquadro fino in fondo si abilita; firmando con un nome sbagliato compare l'errore sulla corrispondenza; firmando con il proprio nome si viene reindirizzati a `/dashboard/coach`.

- [ ] **Step 6: Verifica che la riga sia stata scritta**

Run: `pnpm db:studio` e apri la tabella `agreement_acceptances`.
Expected: una riga con `agreement_key = 'coach'`, `version = '2026-07-1'`, entrambi i booleani `true`, `document_hash` di 64 caratteri.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/onboarding/coach-agreement/"
git commit -m "Coach agreement: blocking signature step"
```

---

### Task 6: Il gate — layout e azioni server-side

Il redirect nel layout è UX; senza i controlli nelle azioni basta una POST diretta per aggirarlo. Servono entrambi.

**Files:**
- Modify: `app/(dashboard)/dashboard/coach/layout.tsx:1-18`
- Modify: `app/(dashboard)/dashboard/coach/profile-actions.ts:158-170` (`submitForReviewAction`)
- Modify: `app/(dashboard)/dashboard/coach/actions.ts` (azione di accettazione prenotazione)

**Interfaces:**
- Consumes: `hasAcceptedCoachAgreement` (Task 3).
- Produces: nessuna nuova API.

- [ ] **Step 1: Aggiungi il redirect nel layout coach**

In `app/(dashboard)/dashboard/coach/layout.tsx`, sostituisci l'import block e il corpo iniziale della funzione:

```tsx
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/core/auth';
import { getPendingRequestCount } from '@/lib/core/bookings';
import { getUnreadCountForType } from '@/lib/core/notifications';
import { hasAcceptedCoachAgreement } from '@/lib/core/legal/acceptance';
import { CoachNav } from './coach-nav';

export default async function CoachAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Tab badges: pending requests (Dashboard) + unread messages (Messaggi).
  const user = await getUser();

  // Contratto non firmato (o versione superata): l'area coach non si apre.
  // È il gate di comodità; quello che conta davvero sta nelle azioni.
  if (user && !(await hasAcceptedCoachAgreement(user.id))) {
    redirect('/onboarding/coach-agreement');
  }

  const [pendingCount, unreadMessages] = user
    ? await Promise.all([
        getPendingRequestCount(user.id),
        getUnreadCountForType(user.id, 'new_message'),
      ])
    : [0, 0];
```

Il resto della funzione (il `return` con `<CoachNav>`) resta invariato.

- [ ] **Step 2: Blocca la pubblicazione del profilo**

In `app/(dashboard)/dashboard/coach/profile-actions.ts`, aggiungi l'import in cima al file, accanto agli altri import da `@/lib/core`:

```ts
import { hasAcceptedCoachAgreement } from '@/lib/core/legal/acceptance';
```

Poi sostituisci `submitForReviewAction` con:

```ts
export async function submitForReviewAction(_formData: FormData) {
  const user = await requireRole('coach');

  // Nessuna pubblicazione senza contratto firmato. Il layout già reindirizza,
  // ma questa azione è raggiungibile via POST diretta.
  if (!(await hasAcceptedCoachAgreement(user.id))) {
    redirect('/onboarding/coach-agreement');
  }

  // Do not allow submitting an incomplete profile (defense in depth — the UI
  // also only enables the button when onboarding steps 1–3 are complete).
  const onboarding = await getCoachOnboarding(user.id);
  if (onboarding?.canSubmit) {
    await submitProviderForReview(user.id);
    revalidatePath('/dashboard/coach');
    revalidatePath('/coaches');
  }
}
```

Verifica che `redirect` sia importato da `next/navigation` in cima al file; se non c'è, aggiungilo.

- [ ] **Step 3: Blocca l'accettazione delle prenotazioni**

In `app/(dashboard)/dashboard/coach/actions.ts`, aggiungi l'import dopo quello di `requireRole` (riga 4):

```ts
import { hasAcceptedCoachAgreement } from '@/lib/core/legal/acceptance';
```

Poi, nella funzione `decide` (righe 21-45), subito dopo `const user = await requireRole('coach');`, inserisci:

```ts
  // Solo l'accettazione è vincolata: rifiutare una richiesta non fa sorgere
  // alcuna obbligazione, e un coach che non ha firmato deve comunque poter
  // liberare l'agenda invece di lasciare l'atleta in attesa.
  if (decision === 'accepted' && !(await hasAcceptedCoachAgreement(user.id))) {
    return {
      error:
        'Per accettare le prenotazioni devi prima firmare il Contratto di Adesione Coach.',
    };
  }
```

Fa da gate anche per `createCoachBookingAction`? No: quella crea una richiesta verso un atleta e passa da `createCoachBookingRequest`. Aggiungi lì lo stesso controllo, subito dopo il suo `requireRole('coach')`, con il medesimo messaggio d'errore.

- [ ] **Step 4: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Verifica manuale del gate**

Con `pnpm dev`, accedi con un coach che non ha firmato e apri `http://localhost:3000/dashboard/coach`.
Expected: redirect su `/onboarding/coach-agreement`. Dopo la firma, la dashboard si apre normalmente.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/coach/layout.tsx" "app/(dashboard)/dashboard/coach/profile-actions.ts" "app/(dashboard)/dashboard/coach/actions.ts"
git commit -m "Coach agreement: gate coach area, profile publication and booking acceptance"
```

---

### Task 7: Copia via email + copertura e2e

**Files:**
- Modify: `lib/core/legal/acceptance.ts` (invio della copia)
- Modify: `e2e/happy-path.mjs` (firma nel flusso coach)

**Interfaces:**
- Consumes: `sendNotificationEmail` da `@/lib/core/email`; `isEmailEnabled` da `@/lib/core/flags`.
- Produces: nessuna nuova API pubblica.

- [ ] **Step 1: Invia la copia del contratto alla firma**

In `lib/core/legal/acceptance.ts`, aggiungi agli import:

```ts
import { sendNotificationEmail } from '@/lib/core/email';
import { isEmailEnabled } from '@/lib/core/flags';
import { users } from '@/lib/db/schema';
import { COACH_AGREEMENT } from './coach-agreement';
```

Poi, in `recordCoachAgreementAcceptance`, subito prima di `return { ok: true };`:

```ts
  // Copia al coach: standard in qualsiasi sottoscrizione, e la prima cosa che
  // viene chiesta in caso di contestazione. Best-effort: se l'email fallisce
  // la firma resta valida, la riga a DB è la prova.
  if (isEmailEnabled()) {
    const [coach] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);

    if (coach) {
      await sendNotificationEmail({
        to: coach.email,
        title: 'Copia del Contratto di Adesione Coach',
        body:
          `Hai firmato il Contratto di Adesione Coach KaiPai (versione ${COACH_AGREEMENT.version}) ` +
          `il ${new Date().toLocaleDateString('it-IT')}. Puoi rileggerlo in qualsiasi momento dal link qui sotto.`,
        link: '/legal/coach-agreement',
      }).catch((e) =>
        console.error('[legal] agreement copy email failed:', e)
      );
    }
  }
```

- [ ] **Step 2: Verifica TypeScript**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Aggiungi la firma al flusso e2e**

In `e2e/happy-path.mjs`, subito dopo il blocco del passo 1 (il controllo `coach.url().includes('/dashboard/coach')`), il flusso cambia: dopo il signup il coach atterra sul contratto, non sulla dashboard. Sostituisci l'assert del passo 1 con:

```js
// Dopo il signup il coach viene mandato a firmare il contratto: senza firma
// non può pubblicare il profilo né accettare prenotazioni.
await coach.goto(`${BASE}/onboarding/coach-agreement`);
if (coach.url().includes('/onboarding/coach-agreement')) {
  // Il nome account serve per la firma: impostalo prima.
  await coach.goto(`${BASE}/dashboard/coach/profile`);
  await coach.waitForSelector('#lastName');
  await coach.fill('#name', COACH.nome);
  await coach.fill('#lastName', COACH.cognome);
  await coach.locator('form:has(#lastName) button[type="submit"]').click();
  await coach.waitForSelector('text=Account aggiornato.');

  await coach.goto(`${BASE}/onboarding/coach-agreement`);
  // Scorri il contratto fino in fondo per abilitare la firma.
  await coach.locator('form div.overflow-y-auto').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await coach.check('input[name="acceptTerms"]');
  await coach.check('input[name="acceptVexatious"]');
  await coach.fill('#signature', COACH_FULL);
  await coach.click('button[type="submit"]');
  await coach.waitForURL(/dashboard\/coach/, { timeout: 30000 });
  ok(1, `Coach registrato e contratto firmato (${COACH.email})`);
} else {
  ko(1, `atteso lo step contratto, trovato ${coach.url()}`);
}
```

Poiché il nome account viene ora impostato qui, rimuovi il blocco duplicato che lo impostava subito dopo (le righe che vanno da `// Account name (drives the public display name)` fino al `waitForSelector('text=Account aggiornato.')` che segue), lasciando intatta la parte del profilo che riempie `#headline` e `#description`.

- [ ] **Step 4: Esegui l'e2e**

Run: `pnpm dev` in un terminale, poi `pnpm e2e` in un altro.
Expected: il passo 1 stampa `✅ 1. Coach registrato e contratto firmato`, e i passi successivi (profilo, approvazione admin, prenotazione, accettazione) restano verdi come prima.

- [ ] **Step 5: Esegui tutti i test unitari**

Run: `pnpm test`
Expected: 11 test passati, 0 falliti.

- [ ] **Step 6: Commit**

```bash
git add lib/core/legal/acceptance.ts e2e/happy-path.mjs
git commit -m "Coach agreement: emailed copy on signature + e2e coverage"
```

---

### Task 8: Documentazione

Il CLAUDE.md del progetto impone di aggiornare la documentazione quando si aggiunge una feature rilevante.

**Files:**
- Modify: `docs/04_Database.md`
- Modify: `docs/07_UserFlows.md`

- [ ] **Step 1: Documenta la tabella**

In `docs/04_Database.md`, seguendo il formato già usato per le altre tabelle, aggiungi una voce `agreement_acceptances` che indichi: scopo (firme dei documenti contrattuali), natura append-only, significato di `document_hash`, e che `agreement_key` oggi vale solo `'coach'`.

- [ ] **Step 2: Documenta il flusso**

In `docs/07_UserFlows.md`, nel flusso di onboarding del coach, inserisci lo step di firma tra la registrazione e il completamento del profilo, indicando che il gate agisce sul layout coach, sulla pubblicazione del profilo e sull'accettazione delle prenotazioni.

- [ ] **Step 3: Commit**

```bash
git add docs/04_Database.md docs/07_UserFlows.md
git commit -m "Docs: coach agreement flow and acceptances table"
```

---

## Fuori scope (Fase B e C)

Non implementare in questo piano:

- data di nascita al signup, invito e conferma del tutore, `canBookSessions()` nel flusso di prenotazione, `acceptsMinors` lato coach — **Fase B**;
- masking dei contatti e rilevamento pattern in chat, Stripe Connect con `application_fee`, pannello admin delle segnalazioni — **Fase C**;
- riaccettazione alla nuova versione: `hasAcceptedCoachAgreement` confronta già la versione, quindi al bump del documento il coach viene riportato allo step di firma. Restano da fare, quando servirà un secondo bump: il banner che evidenzia le modifiche e lo stato "sospeso" per chi non firma entro i 30 giorni di preavviso. Fino alla prima versione non c'è nulla da migrare.

## Coordinamento con l'altro agent

La raccolta della **data di nascita in registrazione** è affidata a un altro agent. Due punti di contatto da non calpestare:

- `clientProfiles.birthDate` — questo piano non lo tocca. `getGuardianStatus` (Fase B) lo legge, quindi chi implementa il signup deve scriverlo lì, non solo su `users`.
- `e2e/happy-path.mjs` — il Task 7 modifica il passo 1 del flusso coach; l'altro agent toccherà con ogni probabilità l'helper `signup()` per il campo data di nascita. Se entrambi i lavori atterrano insieme, conflitto quasi certo su questo file: fai il merge a mano e riesegui `pnpm e2e`.

L'articolo 5 del contratto parla già di atleti minorenni e l'articolo 6 di indicatori rilevati sui messaggi: è voluto. Il contratto descrive il regime a regime, e le Fasi B e C ne implementano l'applicazione tecnica.
