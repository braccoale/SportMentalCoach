# Tour guidato del prodotto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire 7 tour contestuali brevi (4 coach, 3 atleta) che guidano l'utente al primo uso di un'azione chiave — creare un appuntamento, entrare in videochiamata, avviare la trascrizione — mostrati una sola volta per utente, mai invasivi.

**Architecture:** Una tabella server (`user_product_tours`) traccia cosa ha già visto ogni utente. Un catalogo statico in codice (`lib/core/tours/catalog.ts`) elenca gli step di ogni tour con un selettore CSS del bersaglio. Un componente client (`<ProductTour>`) legge lo stato "già visto" (passato come prop da un Server Component, zero query lato client) e, se il tour non è ancora stato visto, cerca nel DOM il bersaglio del primo step e mostra una card ancorata via Radix Popover — stesso pattern di posizionamento con collision-detection già scritto per il tooltip di `VideoCallButton`.

**Tech Stack:** Next.js 15 (App Router, Server Components), React 19, TypeScript, Drizzle ORM / PostgreSQL, Tailwind CSS 4, `radix-ui` (Popover — già una dipendenza, usata altrove per Dialog/Tooltip).

## Global Constraints

- Solo web per questa v1 — nessun codice mobile.
- Niente overlay bloccante a schermo intero; ogni tour è sempre annullabile ("Salta il tour"), mai ripetuto una volta chiuso in un modo o nell'altro.
- Un tour non mostra mai uno step il cui bersaglio non esiste davvero nel DOM in quel momento (es. bottone trascrizione assente per permessi mancanti) — quello step viene saltato, non forzato.
- Anello di risalto sul bersaglio: blu/indaco, mai rosso (regola esistente: nessun elemento in stile bottone/azione è rosso sulla piattaforma).
- Ogni funzione che decide/scrive lo stato di un tour vive in `lib/core/tours/`, mai duplicata nei singoli componenti pagina.
- Tabella nuova additiva — nessuna modifica a tabelle esistenti, migrazione generata con `drizzle-kit generate` e mai modificata a mano dopo essere stata applicata (vedi `database-migrations`).
- Al termine di ogni task: `npx tsc --noEmit -p tsconfig.json` pulito e `npm test` verde prima di committare.

---

## File Structure

| File | Responsabilità |
|---|---|
| `lib/db/schema.ts` (modifica) | Aggiunge la tabella `userProductTours` |
| `lib/db/migrations/0075_*.sql` (generato) | Migrazione SQL della nuova tabella |
| `lib/core/tours/catalog.ts` (nuovo) | Dati statici: chiave, ruolo, step di ognuno dei 7 tour |
| `lib/core/tours/catalog.test.ts` (nuovo) | Verifica che il catalogo sia internamente coerente |
| `lib/core/tours/state.ts` (nuovo) | `hasSeenTour`, `markTourSeen` — unica fonte di verità server-side |
| `lib/core/tours/actions.ts` (nuovo) | Server action `markTourSeenAction`, invocabile da un client component |
| `components/product-tour.tsx` (nuovo) | Il componente `<ProductTour>` — motore di posizionamento e avanzamento |
| 7 file pagina/componente esistenti (modifica) | Aggiungono `data-tour="..."` ai bersagli e montano `<ProductTour>` |

---

### Task 1: Schema e migrazione `user_product_tours`

**Files:**
- Modify: `lib/db/schema.ts` (vicino a `userOnboarding`, riga ~2984, stesso stile)
- Create (generato): `lib/db/migrations/0075_*.sql`

**Interfaces:**
- Produces: `userProductTours` (tabella Drizzle), tipi `UserProductTour`, `NewUserProductTour`.

- [ ] **Step 1: Aggiungere la tabella allo schema**

In `lib/db/schema.ts`, subito dopo il blocco `userOnboarding` (dopo la riga con `export type NewUserOnboarding = ...`):

```ts
/**
 * Traccia quali tour guidati del prodotto un utente ha già visto (o
 * saltato) — non "come completare il profilo" (vedi `userOnboarding`), ma
 * "come si usa una schermata specifica", mostrato una volta sola.
 */
export const userProductTours = pgTable(
  'user_product_tours',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tourKey: varchar('tour_key', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    ...audit,
  },
  (table) => [
    unique('user_product_tours_user_tour_unique').on(
      table.userId,
      table.tourKey
    ),
  ]
);

export type UserProductTour = typeof userProductTours.$inferSelect;
export type NewUserProductTour = typeof userProductTours.$inferInsert;
```

- [ ] **Step 2: Generare la migrazione**

```bash
npm run db:generate
```

- [ ] **Step 3: Leggere l'SQL generato**

Apri `lib/db/migrations/0075_*.sql` e conferma che contenga solo un `CREATE TABLE public.user_product_tours` più il vincolo `UNIQUE` — nessun `DROP`, nessuna modifica a tabelle esistenti. Se drizzle-kit propone altro, fermati e chiedi prima di procedere (vedi `database-migrations`).

- [ ] **Step 4: Applicare la migrazione**

```bash
npm run db:migrate
```

Comunica prima all'utente cosa stai per eseguire — questo tocca il database di produzione, non ce n'è uno di sviluppo separato.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

Deve uscire pulito (`userProductTours` referenziata da nessun altro file ancora, ma lo schema deve compilare).

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts lib/db/migrations/0075_*.sql
git commit -m "feat(tours): aggiunge la tabella user_product_tours"
```

---

### Task 2: Catalogo dei 7 tour

**Files:**
- Create: `lib/core/tours/catalog.ts`
- Test: `lib/core/tours/catalog.test.ts`

**Interfaces:**
- Consumes: nessuno (dati puri).
- Produces: `type TourKey`, `type TourStep = { target: string; title: string; body: string }`, `TOUR_CATALOG: Record<TourKey, { role: 'coach' | 'athlete'; steps: TourStep[] }>`.

`target` è sempre una stringa pronta per `document.querySelector` — quasi sempre `'[data-tour="..."]'`, tranne un caso che punta a una classe CSS di LiveKit (vedi Task 8).

- [ ] **Step 1: Scrivere il file del catalogo**

```ts
// lib/core/tours/catalog.ts

export type TourStep = {
  /** Selettore CSS del bersaglio — `[data-tour="..."]` quasi sempre. */
  target: string;
  title: string;
  body: string;
};

export type TourKey =
  | 'coach_dashboard_intro'
  | 'coach_create_appointment'
  | 'coach_video_call'
  | 'coach_ai_report_review'
  | 'athlete_dashboard_intro'
  | 'athlete_booking'
  | 'athlete_video_call';

export const TOUR_CATALOG: Record<
  TourKey,
  { role: 'coach' | 'athlete'; steps: TourStep[] }
> = {
  coach_dashboard_intro: {
    role: 'coach',
    steps: [
      {
        target: '[data-tour="coach-new-appointment"]',
        title: 'Crea il tuo primo appuntamento',
        body: 'Da qui prenoti una sessione con un atleta che segui già, scegliendo giorno e ora fra quelli che hai reso disponibili.',
      },
      {
        target: '#richieste-in-attesa',
        title: 'Le richieste da valutare',
        body: 'Ogni atleta che ti chiede una sessione compare qui, in attesa che tu accetti o rifiuti.',
      },
    ],
  },
  coach_create_appointment: {
    role: 'coach',
    steps: [
      {
        target: '[data-tour="coach-booking-datetime"]',
        title: 'Scegli giorno e ora',
        body: 'Solo i giorni e gli orari che hai impostato come disponibile compaiono qui — nessun rischio di doppie prenotazioni.',
      },
    ],
  },
  coach_video_call: {
    role: 'coach',
    steps: [
      {
        target: '[data-tour="coach-start-transcription"]',
        title: 'Avvia la trascrizione',
        body: 'Premi qui a inizio sessione per registrare e ottenere il riepilogo automatico da validare dopo la call.',
      },
    ],
  },
  coach_ai_report_review: {
    role: 'coach',
    steps: [
      {
        target: '[data-tour="approve-report"]',
        title: 'Approva il riepilogo',
        body: 'Controlla che il riepilogo generato sia corretto, poi approvalo: solo da qui in poi l’atleta può vederlo.',
      },
      {
        target: '[data-tour="regenerate-report"]',
        title: 'Non ti convince?',
        body: 'Puoi rigenerarlo quante volte vuoi prima di approvarlo.',
      },
    ],
  },
  athlete_dashboard_intro: {
    role: 'athlete',
    steps: [
      {
        target: '[data-tour="find-a-coach"]',
        title: 'Trova il tuo coach',
        body: 'Da qui sfogli i coach disponibili e scegli con chi iniziare il tuo percorso.',
      },
      {
        target: '[data-tour="my-sessions"]',
        title: 'Le tue sessioni',
        body: 'Ogni sessione prenotata, in attesa o già svolta, la trovi qui.',
      },
    ],
  },
  athlete_booking: {
    role: 'athlete',
    steps: [
      {
        target: '[data-tour="athlete-booking-calendar"]',
        title: 'Scegli quando iniziare',
        body: 'Tocca un giorno per vedere gli orari liberi di questo coach, poi scegli quello che preferisci.',
      },
    ],
  },
  athlete_video_call: {
    role: 'athlete',
    steps: [
      {
        target: '.lk-control-bar',
        title: 'Microfono e videocamera',
        body: 'Da qui puoi disattivare temporaneamente audio o video durante la sessione.',
      },
    ],
  },
};
```

- [ ] **Step 2: Scrivere il test di coerenza del catalogo**

```ts
// lib/core/tours/catalog.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_CATALOG } from './catalog';

test('ogni tour ha almeno uno step', () => {
  for (const [key, tour] of Object.entries(TOUR_CATALOG)) {
    assert.ok(tour.steps.length > 0, `${key} non ha step`);
  }
});

test('ogni step ha un target, un titolo e un testo non vuoti', () => {
  for (const [key, tour] of Object.entries(TOUR_CATALOG)) {
    for (const step of tour.steps) {
      assert.ok(step.target.trim().length > 0, `${key}: target vuoto`);
      assert.ok(step.title.trim().length > 0, `${key}: title vuoto`);
      assert.ok(step.body.trim().length > 0, `${key}: body vuoto`);
    }
  }
});

test('nessun tour coach è assegnato al ruolo athlete e viceversa (per chiave)', () => {
  assert.equal(TOUR_CATALOG.coach_dashboard_intro.role, 'coach');
  assert.equal(TOUR_CATALOG.coach_create_appointment.role, 'coach');
  assert.equal(TOUR_CATALOG.coach_video_call.role, 'coach');
  assert.equal(TOUR_CATALOG.coach_ai_report_review.role, 'coach');
  assert.equal(TOUR_CATALOG.athlete_dashboard_intro.role, 'athlete');
  assert.equal(TOUR_CATALOG.athlete_booking.role, 'athlete');
  assert.equal(TOUR_CATALOG.athlete_video_call.role, 'athlete');
});
```

- [ ] **Step 3: Aggiungere il test allo script `test`**

In `package.json`, nella stringa dello script `"test"`, aggiungi `lib/core/tours/catalog.test.ts` subito dopo `lib/core/email/localhost-guard.test.ts`.

- [ ] **Step 4: Eseguire i test**

```bash
npm test 2>&1 | tail -20
```

Expected: tutti verdi, incluso il nuovo file.

- [ ] **Step 5: Commit**

```bash
git add lib/core/tours/catalog.ts lib/core/tours/catalog.test.ts package.json
git commit -m "feat(tours): catalogo statico dei 7 tour guidati"
```

---

### Task 3: Stato server — `hasSeenTour` / `markTourSeen`

**Files:**
- Create: `lib/core/tours/state.ts`
- Test: `lib/core/tours/state.test.ts`

**Interfaces:**
- Consumes: `db` da `@/lib/db/drizzle`, `userProductTours` da `@/lib/db/schema`, `TourKey` da `./catalog`.
- Produces: `hasSeenTour(userId: number, tourKey: TourKey): Promise<boolean>`, `markTourSeen(userId: number, tourKey: TourKey, status: 'seen' | 'skipped' | 'completed'): Promise<void>`.

- [ ] **Step 1: Scrivere `state.ts`**

```ts
// lib/core/tours/state.ts
import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { userProductTours } from '@/lib/db/schema';
import type { TourKey } from './catalog';

/** Se l'utente ha già una riga per questo tour — visto, saltato o
 * completato non fa differenza: in ogni caso non si ripresenta. */
export async function hasSeenTour(
  userId: number,
  tourKey: TourKey
): Promise<boolean> {
  const [row] = await db
    .select({ id: userProductTours.id })
    .from(userProductTours)
    .where(
      and(
        eq(userProductTours.userId, userId),
        eq(userProductTours.tourKey, tourKey)
      )
    )
    .limit(1);
  return !!row;
}

/** Upsert su (userId, tourKey): scritta una sola volta per tour, alla
 * chiusura (avanti fino in fondo, o "Salta"). */
export async function markTourSeen(
  userId: number,
  tourKey: TourKey,
  status: 'seen' | 'skipped' | 'completed'
): Promise<void> {
  const now = new Date();
  await db
    .insert(userProductTours)
    .values({
      userId,
      tourKey,
      status,
      completedAt: status === 'completed' ? now : null,
      createdBy: userId,
      updatedBy: userId,
    })
    .onConflictDoUpdate({
      target: [userProductTours.userId, userProductTours.tourKey],
      set: {
        status,
        completedAt: status === 'completed' ? now : null,
        updatedAt: now,
        updatedBy: userId,
      },
    });
}
```

- [ ] **Step 2: Scrivere il test**

Questo modulo importa `server-only` e tocca il DB, quindi non è testabile in isolamento con `node --test` (stesso motivo per cui `lib/core/email/index.ts` non ha un test diretto — vedi il precedente `localhost-guard.ts`). Non creare `state.test.ts`: la copertura per la logica di stato arriva dai test end-to-end manuali del Task 6. Salta questo step — non c'è niente di puro da isolare qui (a differenza del catalogo, che è dati puri).

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add lib/core/tours/state.ts
git commit -m "feat(tours): hasSeenTour e markTourSeen"
```

---

### Task 4: Server action `markTourSeenAction`

**Files:**
- Create: `lib/core/tours/actions.ts`

**Interfaces:**
- Consumes: `markTourSeen` da `./state`, `getUser` da `@/lib/db/queries`.
- Produces: `markTourSeenAction(tourKey: TourKey, status: 'skipped' | 'completed'): Promise<void>` — server action invocabile da un client component.

- [ ] **Step 1: Scrivere l'action**

```ts
// lib/core/tours/actions.ts
'use server';

import { getUser } from '@/lib/db/queries';
import { markTourSeen } from './state';
import type { TourKey } from './catalog';

/**
 * Chiamata dal componente client alla chiusura di un tour (avanti fino in
 * fondo, o "Salta"). Fallisce in silenzio se l'utente non è più loggato —
 * non è un'azione critica, non deve mai rompere l'interfaccia sopra di lei.
 */
export async function markTourSeenAction(
  tourKey: TourKey,
  status: 'skipped' | 'completed'
): Promise<void> {
  const user = await getUser();
  if (!user) return;
  await markTourSeen(user.id, tourKey, status);
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add lib/core/tours/actions.ts
git commit -m "feat(tours): server action markTourSeenAction"
```

---

### Task 5: Componente `<ProductTour>`

**Files:**
- Create: `components/product-tour.tsx`

**Interfaces:**
- Consumes: `TOUR_CATALOG`, `TourKey` da `@/lib/core/tours/catalog`; `markTourSeenAction` da `@/lib/core/tours/actions`; `Popover` da `radix-ui`.
- Produces: `<ProductTour tourKey={TourKey} alreadySeen={boolean} />` — nessun altro export.

- [ ] **Step 1: Scrivere il componente**

```tsx
// components/product-tour.tsx
'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { Popover } from 'radix-ui';
import { X } from 'lucide-react';
import { TOUR_CATALOG, type TourKey } from '@/lib/core/tours/catalog';
import { markTourSeenAction } from '@/lib/core/tours/actions';

type Rect = { top: number; left: number; width: number; height: number };

/**
 * Il bersaglio di uno step vive in un altro punto dell'albero React (un
 * bottone dentro un'altra card, non un figlio di questo componente): non è
 * possibile usare `Popover.Anchor` nel modo consueto (avvolgere il
 * bersaglio). Si crea invece un "ancora proxy" — un div invisibile
 * posizionato esattamente sul rettangolo del bersaglio reale, aggiornato ad
 * ogni scroll/resize — e si ancora il popover a quello.
 */
function useTargetRect(selector: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) {
      setRect(null);
      return;
    }
    const update = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [selector]);

  return rect;
}

export function ProductTour({
  tourKey,
  alreadySeen,
}: {
  tourKey: TourKey;
  alreadySeen: boolean;
}) {
  const steps = TOUR_CATALOG[tourKey].steps;
  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(alreadySeen);
  const step = dismissed ? undefined : steps[stepIndex];
  const rect = useTargetRect(step?.target ?? null);

  // Se il bersaglio dello step corrente non esiste nel DOM, prova il
  // prossimo step; se non ne resta nessuno, il tour non parte.
  useEffect(() => {
    if (dismissed || !step || rect) return;
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      setDismissed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo quando cambia il bersaglio trovato
  }, [rect, dismissed, stepIndex]);

  function finish(status: 'skipped' | 'completed') {
    setDismissed(true);
    void markTourSeenAction(tourKey, status);
  }

  function next() {
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      finish('completed');
    }
  }

  if (dismissed || !step || !rect) return null;

  return (
    <Popover.Root open>
      <Popover.Anchor asChild>
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            pointerEvents: 'none',
          }}
          className="rounded-lg ring-2 ring-indigo-500 ring-offset-2"
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="center"
          collisionPadding={12}
          sideOffset={10}
          className="z-[100] w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">
              {step.title}
            </p>
            <button
              type="button"
              aria-label="Chiudi il tour"
              onClick={() => finish('skipped')}
              className="text-gray-400 transition-colors hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-sm text-gray-600">{step.body}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {stepIndex + 1}/{steps.length}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => finish('skipped')}
                className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-700"
              >
                Salta il tour
              </button>
              <button
                type="button"
                onClick={next}
                className="rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700"
              >
                {stepIndex === steps.length - 1 ? 'Fatto' : 'Avanti'}
              </button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add components/product-tour.tsx
git commit -m "feat(tours): componente ProductTour"
```

---

### Task 6: Collegare `coach_dashboard_intro` (implementazione di riferimento)

Questo è il primo tour collegato per intero — prova che tutta la catena (Server Component legge `hasSeenTour` → passa `alreadySeen` → `<ProductTour>` trova i bersagli → "Avanti"/"Salta" scrivono lo stato) funziona davvero, prima di ripetere lo stesso schema altre 6 volte.

**Files:**
- Modify: `app/(dashboard)/dashboard/coach/new-appointment-button.tsx:218` (bottone "Nuovo appuntamento")
- Modify: `app/(dashboard)/dashboard/coach/page.tsx` (aggiunge `hasSeenTour` + monta `<ProductTour>`)

**Interfaces:**
- Consumes: `hasSeenTour` da `@/lib/core/tours/state`, `<ProductTour>` da `@/components/product-tour`.

- [ ] **Step 1: Aggiungere l'attributo al bottone**

In `app/(dashboard)/dashboard/coach/new-appointment-button.tsx`, riga 218:

```tsx
      <Button
        type="button"
        data-tour="coach-new-appointment"
        onClick={openDialog}
        className="rounded-full bg-green-600 text-white hover:bg-green-700"
      >
```

- [ ] **Step 2: Leggere lo stato del tour nella pagina**

In `app/(dashboard)/dashboard/coach/page.tsx`, aggiungi l'import vicino agli altri di `lib/core`:

```tsx
import { hasSeenTour } from '@/lib/core/tours/state';
import { ProductTour } from '@/components/product-tour';
```

Nel componente pagina, dove già esiste `const user = await getUser()` (o equivalente — verifica il nome esatto della variabile utente già in scope in questo file), aggiungi:

```tsx
  const tourSeen = isApproved
    ? await hasSeenTour(user.id, 'coach_dashboard_intro')
    : true; // niente tour finché il profilo non è approvato: il bottone non c'è ancora
```

- [ ] **Step 3: Montare il componente**

Nel JSX restituito da `CoachDashboardPage` (o nome equivalente), subito prima della chiusura di `</section>` finale (o del primo elemento di primo livello ritornato):

```tsx
      {isApproved && <ProductTour tourKey="coach_dashboard_intro" alreadySeen={tourSeen} />}
```

- [ ] **Step 4: Aggiungere l'id al contenitore "Richieste in attesa" (verifica)**

Conferma che `id="richieste-in-attesa"` sia già presente (riga 514 di `page.tsx`, sezione `title="Nuove richieste da valutare"`) — non serve aggiungerlo, esiste già.

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 6: Verifica manuale in locale**

```bash
npm run dev
```

Accedi come coach approvato con un account che non ha ancora una riga in `user_product_tours` per `coach_dashboard_intro` (o cancellala manualmente per un account di prova). Verifica:
- Il tour appare sul bottone "Nuovo appuntamento" con l'anello blu/indaco.
- "Avanti" sposta il tour su "Richieste in attesa".
- "Fatto" chiude il tour; ricaricando la pagina, non ricompare.
- Su un secondo account (o dopo aver saltato), "Salta il tour" produce lo stesso effetto — non si ripresenta.

**Verificato solo a livello di typecheck/codice in questo piano — la verifica in browser va fatta da chi esegue il task, dichiarando il livello raggiunto (vedi convenzione del progetto: mai affermare "funziona" senza averlo guardato sullo schermo).**

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/dashboard/coach/new-appointment-button.tsx" "app/(dashboard)/dashboard/coach/page.tsx"
git commit -m "feat(tours): collega coach_dashboard_intro alla dashboard coach"
```

---

### Task 7: Collegare `coach_create_appointment`

**Files:**
- Modify: `app/(dashboard)/dashboard/coach/new-appointment-button.tsx`

**Interfaces:**
- Consumes: `hasSeenTour`, `<ProductTour>` (stessi import del Task 6 — già presenti se questo file è lo stesso; altrimenti aggiungerli).

Questo tour vive interamente dentro il dialog di "Nuovo appuntamento" (già un client component con `'use client'` in cima al file) — niente Server Component da toccare per lo stato: la prop `alreadySeen` va passata al componente dall'esterno, dalla stessa pagina del Task 6, perché solo un Server Component può leggere `hasSeenTour` prima del render.

- [ ] **Step 1: Passare `alreadySeen` come nuova prop**

In `app/(dashboard)/dashboard/coach/page.tsx`, aggiungi una seconda lettura accanto a quella del Task 6:

```tsx
  const createAppointmentTourSeen = isApproved
    ? await hasSeenTour(user.id, 'coach_create_appointment')
    : true;
```

Passa la prop al componente esistente:

```tsx
            <CoachNewAppointmentButton
              athletes={athletes}
              services={...}
              bookableDays={bookableDays}
              lastServiceByAthlete={lastServiceByAthlete(allBookings)}
              tourAlreadySeen={createAppointmentTourSeen}
            />
```

- [ ] **Step 2: Accettare la prop e aggiungere l'attributo al bersaglio**

In `new-appointment-button.tsx`, aggiungi `tourAlreadySeen: boolean` alla destrutturazione dei props della funzione (riga 63), l'import di `ProductTour`, e l'attributo al contenitore data/ora (riga 322):

```tsx
              {days.length > 0 ? (
                <div className="flex flex-col gap-1.5" data-tour="coach-booking-datetime">
```

- [ ] **Step 3: Montare `<ProductTour>` dentro il dialog**

Subito dopo la riga con `{days.length > 0 ? (` ... fino alla chiusura del blocco form del dialog (dove già c'è `{open && (...)}`), aggiungi, come fratello del contenuto del dialog (non dentro il `<form>`, per non interferire col submit):

```tsx
          {open && (
            <ProductTour
              tourKey="coach_create_appointment"
              alreadySeen={tourAlreadySeen}
            />
          )}
```

Questo va aggiunto una sola volta, non duplicato dentro entrambi i rami `open && (...)` già esistenti — verifica che nel file ci sia un solo blocco `{open && (` che avvolge il dialog intero (riga 227 secondo l'ultima lettura) e aggiungi il componente come primo figlio di quel blocco, prima del backdrop.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/coach/new-appointment-button.tsx" "app/(dashboard)/dashboard/coach/page.tsx"
git commit -m "feat(tours): collega coach_create_appointment al dialog nuovo appuntamento"
```

---

### Task 8: Collegare `coach_video_call` e `athlete_video_call`

Stessa pagina (`app/(dashboard)/dashboard/video/[bookingId]/page.tsx`), tour diverso in base al ruolo di chi guarda — il file esistente già distingue `viewerRole` (vedi `components/ai-session-notes-control.tsx`, che legge `session.viewerRole === 'coach'`).

**Files:**
- Modify: `components/ai-session-notes-control.tsx:510` (bottone "Avvia registrazione")
- Modify: `app/(dashboard)/dashboard/video/[bookingId]/page.tsx`

**Interfaces:**
- Consumes: `hasSeenTour`, `<ProductTour>`.

- [ ] **Step 1: Aggiungere l'attributo al bottone di avvio registrazione**

In `components/ai-session-notes-control.tsx`, riga 510:

```tsx
          <button
            type="button"
            data-tour="coach-start-transcription"
            className="mt-2 mr-3 text-xs font-medium text-white underline"
```

- [ ] **Step 2: Leggere lo stato e montare il tour giusto per ruolo**

In `app/(dashboard)/dashboard/video/[bookingId]/page.tsx`, individua dove il file determina già se il viewer è coach o atleta per quella prenotazione (la stessa logica che alimenta `viewerRole` passato ai componenti figli). Aggiungi:

```tsx
import { hasSeenTour } from '@/lib/core/tours/state';
import { ProductTour } from '@/components/product-tour';
```

```tsx
  const videoTourKey = viewerRole === 'coach' ? 'coach_video_call' : 'athlete_video_call';
  const videoTourSeen = await hasSeenTour(user.id, videoTourKey);
```

(`viewerRole` e `user` sono i nomi già in uso in questo file — verificane l'esatta ortografia leggendo il file prima di scrivere, potrebbero chiamarsi diversamente, es. `role` o `currentUser`.)

Monta il componente nel JSX di ritorno, come fratello di `<VideoRoom>` o del contenitore principale:

```tsx
      <ProductTour tourKey={videoTourKey} alreadySeen={videoTourSeen} />
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 4: Verifica manuale**

Entra in una videochiamata come coach con permesso AI_SESSION_NOTES attivo: il tour deve puntare al bottone "Avvia registrazione". Entra come coach *senza* quel permesso (bottone assente): il tour non deve apparire per niente (nessuno step ha un bersaglio — vedi comportamento del componente). Entra come atleta: il tour deve puntare alla barra controlli LiveKit (`.lk-control-bar`), mai al bottone trascrizione (che l'atleta non vede mai).

- [ ] **Step 5: Commit**

```bash
git add components/ai-session-notes-control.tsx "app/(dashboard)/dashboard/video/[bookingId]/page.tsx"
git commit -m "feat(tours): collega coach_video_call e athlete_video_call alla videochiamata"
```

---

### Task 9: Collegare `coach_ai_report_review`

**Files:**
- Modify: `components/session-compass-panel.tsx:518` (bottone "Rigenera bozza"/"Genera riepilogo"), `:530` (bottone "Approva report")
- Modify: `app/(dashboard)/dashboard/appointments/[id]/page.tsx`

**Interfaces:**
- Consumes: `hasSeenTour`, `<ProductTour>`.

- [ ] **Step 1: Aggiungere gli attributi ai due bottoni**

In `components/session-compass-panel.tsx`, riga 518 (bottone rigenera/genera):

```tsx
              <Button type="button" data-tour="regenerate-report" ...>
                {report ? 'Rigenera bozza' : 'Genera riepilogo sessione'}
              </Button>
```

Riga 530 (bottone approva):

```tsx
                <Button type="button" data-tour="approve-report" ...>
                  <CheckCircle2 className="h-4 w-4" /> Approva report
                </Button>
```

(Adatta alla firma esatta del bottone così com'è nel file — questi sono i due `<Button>`/bottoni già individuati per contenuto testuale; aggiungi solo l'attributo `data-tour`, non toccare il resto delle props.)

- [ ] **Step 2: Leggere lo stato e montare il tour**

In `app/(dashboard)/dashboard/appointments/[id]/page.tsx`, stessa importazione di `hasSeenTour`/`ProductTour` dei task precedenti. Il tour va mostrato solo quando il viewer è il coach e c'è un report da validare (`status === 'draft'` o equivalente già usato dal file per decidere se mostrare i bottoni Approva/Rigenera). Aggiungi la lettura dello stato accanto alle altre query della pagina, e monta:

```tsx
      {isCoachViewer && hasDraftReport && (
        <ProductTour tourKey="coach_ai_report_review" alreadySeen={aiReportTourSeen} />
      )}
```

usando le condizioni booleane già presenti nel file per decidere quando i bottoni Approva/Rigenera sono effettivamente renderizzati (verifica i nomi esatti leggendo il file — non inventare nomi di variabili non presenti).

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add components/session-compass-panel.tsx "app/(dashboard)/dashboard/appointments/[id]/page.tsx"
git commit -m "feat(tours): collega coach_ai_report_review alla validazione riepilogo"
```

---

### Task 10: Collegare `athlete_dashboard_intro`

**Files:**
- Modify: `app/(dashboard)/dashboard/athlete/page.tsx`

**Interfaces:**
- Consumes: `hasSeenTour`, `<ProductTour>`.

- [ ] **Step 1: Aggiungere gli attributi ai due bersagli**

Riga 710, link "Trova un coach":

```tsx
            <Link href="/coaches" data-tour="find-a-coach">Trova un coach</Link>
```

Riga 466, intorno all'intestazione "Prossimi Appuntamenti" — aggiungi l'attributo al contenitore della card (non al testo dell'intestazione stessa; verifica leggendo il file quale elemento avvolge l'intera sezione a partire da quella riga, e mettici `data-tour="my-sessions"`).

- [ ] **Step 2: Leggere lo stato e montare il tour**

```tsx
import { hasSeenTour } from '@/lib/core/tours/state';
import { ProductTour } from '@/components/product-tour';
```

```tsx
  const dashboardTourSeen = await hasSeenTour(user.id, 'athlete_dashboard_intro');
```

Monta `<ProductTour tourKey="athlete_dashboard_intro" alreadySeen={dashboardTourSeen} />` nel JSX di ritorno, come fratello del contenuto principale della pagina.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/dashboard/athlete/page.tsx"
git commit -m "feat(tours): collega athlete_dashboard_intro alla dashboard atleta"
```

---

### Task 11: Collegare `athlete_booking`

**Files:**
- Modify: `app/(marketplace)/coaches/[slug]/booking-request.tsx:180`
- Modify: `app/(marketplace)/coaches/[slug]/page.tsx`

**Interfaces:**
- Consumes: `hasSeenTour`, `<ProductTour>`.

- [ ] **Step 1: Aggiungere l'attributo al contenitore del calendario**

In `booking-request.tsx`, riga 180:

```tsx
        <div className="flex flex-col gap-3" data-tour="athlete-booking-calendar">
```

- [ ] **Step 2: Passare lo stato dalla pagina**

`booking-request.tsx` è già un client component (`'use client'`, come verificato nella sessione precedente) montato da `page.tsx` (Server Component). Segui lo stesso schema del Task 7: leggi `hasSeenTour` in `page.tsx` — solo quando `isAthlete` è vero (il tour non ha senso per un visitatore non loggato o un coach che guarda il proprio stesso profilo) — e passa una prop `tourAlreadySeen` a `<BookingRequest>`.

In `page.tsx`, vicino a dove già si legge `isAthlete`:

```tsx
  const bookingTourSeen = isAthlete && user
    ? await hasSeenTour(user.id, 'athlete_booking')
    : true;
```

Nella chiamata a `<BookingRequest>` (riga ~570):

```tsx
                  <BookingRequest
                    slug={slug}
                    coachFirstName={firstName}
                    services={...}
                    bookableDays={bookableDays}
                    tourAlreadySeen={bookingTourSeen}
                  />
```

- [ ] **Step 3: Accettare la prop e montare il tour**

In `booking-request.tsx`, aggiungi `tourAlreadySeen: boolean` alla destrutturazione dei props, l'import di `ProductTour`, e monta il componente come fratello del `<div data-tour="athlete-booking-calendar">` (non al suo interno):

```tsx
      <ProductTour tourKey="athlete_booking" alreadySeen={tourAlreadySeen} />
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 5: Commit**

```bash
git add "app/(marketplace)/coaches/[slug]/booking-request.tsx" "app/(marketplace)/coaches/[slug]/page.tsx"
git commit -m "feat(tours): collega athlete_booking alla scheda coach"
```

---

### Task 12: Verifica finale e pulizia

**Files:** nessuno (solo verifica)

- [ ] **Step 1: Typecheck completo**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 2: Test completi**

```bash
npm test 2>&1 | tail -20
```

Expected: tutti verdi, incluso `lib/core/tours/catalog.test.ts`.

- [ ] **Step 3: Verifica su worktree pulito**

```bash
git worktree add --detach /tmp/smc-verify-tours HEAD
cd /tmp/smc-verify-tours
pnpm install --frozen-lockfile
npx tsc --noEmit -p tsconfig.json
npm test 2>&1 | tail -20
cd -
git worktree remove /tmp/smc-verify-tours --force
```

- [ ] **Step 4: Verifica manuale end-to-end come coach**

Con un account coach approvato e nessuna riga in `user_product_tours`:
1. Dashboard → tour `coach_dashboard_intro` appare, "Avanti"/"Fatto" funzionano.
2. Apri "Nuovo appuntamento" → tour `coach_create_appointment` appare sul selettore data/ora.
3. Crea l'appuntamento, entra nella call → tour `coach_video_call` appare sul bottone trascrizione (se il permesso c'è).
4. Dopo la call, apri il riepilogo da validare → tour `coach_ai_report_review` appare sui bottoni Approva/Rigenera.

- [ ] **Step 5: Verifica manuale end-to-end come atleta**

Con un account atleta e nessuna riga in `user_product_tours`:
1. Dashboard → tour `athlete_dashboard_intro` appare.
2. Apri la scheda di un coach → tour `athlete_booking` appare sul calendario.
3. Entra in una call → tour `athlete_video_call` appare sulla barra controlli, mai sul bottone trascrizione (che l'atleta non vede).

**Dichiarare esplicitamente il livello di verifica raggiunto** (typecheck/test, o verificato in browser) — mai affermare che il flusso "funziona" senza averlo guardato sullo schermo, per entrambi i ruoli.

- [ ] **Step 6: Push**

```bash
git push origin main
```
