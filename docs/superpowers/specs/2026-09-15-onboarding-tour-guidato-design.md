# Tour guidato del prodotto (onboarding contestuale)

## Problema

L'utente che arriva per la prima volta sulla piattaforma non sa *come si usa* — quali bottoni premere per creare un appuntamento, entrare in una videochiamata, avviare la trascrizione/note AI. Questo è diverso dall'onboarding già esistente:

- **Wizard di registrazione** (`/onboarding`, `lib/core/onboarding/`) — raccolta dati (sport, obiettivi, profilo coach), gira *prima* di vedere la dashboard vera, tracciato in `user_onboarding` (status/step).
- **Checklist "Completa il tuo profilo"** (`OnboardingProgress`, dashboard coach) — checklist statica di completezza profilo, con deep-link alle sezioni mancanti.

Nessuno dei due spiega la UI vera in uso. Questo spec descrive un terzo pezzo, additivo: **tour contestuali brevi**, ognuno agganciato al primo arrivo su una schermata/azione specifica, mostrati *dopo* che l'utente ha già superato wizard e checklist.

## Principio guida

Non invasivo, prima di tutto. Niente overlay bloccante a schermo intero. Un tour non deve mai essere un ostacolo tra l'utente e il suo lavoro — sempre annullabile, mai obbligatorio, mai ripetuto una volta chiuso.

## Scope v1

- **Solo web.** Il mobile (React Native/Expo) è uno stack diverso — nessun codice condiviso possibile con la UI web. Valutabile in un secondo giro, fuori da questo spec.
- **7 tour**, elencati sotto. Niente pannello admin per editarli: sono pochi, piccoli, e cambiarli è una PR — non serve l'editabilità da database come per i template email (dove il pubblico che scrive copy è diverso, i copywriter, non solo sviluppatori).
- **Nessun rilancio manuale** (es. un "Rivedi il tour" da un menu Aiuto) in v1. Annotato come estensione futura naturale, non costruito ora.

## Modello dati

Nuova tabella `user_product_tours`, additiva (vedi `database-migrations`):

```
id            serial primary key
user_id       integer references users(id), not null
tour_key      varchar(64), not null
status        varchar(20), not null   -- 'seen' | 'skipped' | 'completed'
completed_at  timestamp
+ createdAt/updatedAt/createdBy/updatedBy (spread `audit`, stessa convenzione di ogni altra tabella)

unique (user_id, tour_key)
```

`status` distingue "l'ha visto fino in fondo" da "l'ha saltato" solo per eventuale analisi futura (quanti utenti saltano un tour specifico) — il comportamento verso l'utente è identico in entrambi i casi: il tour non si ripresenta più.

## Catalogo dei tour (codice, non dati)

`lib/core/tours/catalog.ts`, sullo stile di `lib/core/notifications/catalog.ts`: un oggetto che mappa ogni `tour_key` a `{ role, steps: [{ target, title, body }] }`. `target` è il valore di un attributo `data-tour="..."` da aggiungere ai componenti esistenti nei punti giusti (bottone "Nuovo appuntamento", calendario orari, bottone avvio trascrizione, ecc.).

Pure data, nessun `server-only` — leggibile sia dal Server Component che decide se mostrare il tour sia dal componente client che lo renderizza.

## Funzioni core

`lib/core/tours/index.ts` (server-only):

- `hasSeenTour(userId, tourKey): Promise<boolean>` — letta una volta nel Server Component della pagina.
- `markTourSeen(userId, tourKey, status: 'seen' | 'skipped' | 'completed')` — scritta al termine/salto del tour (server action leggera, `onConflictDoNothing` non serve: è un upsert su `(user_id, tour_key)`).

## Componente

`<ProductTour tourKey="..." alreadySeen={boolean} />` — client component, montato una volta per pagina/schermata interessata. `alreadySeen` arriva come prop dal Server Component (niente query lato client, niente flash del tour che appare e sparisce mentre carica).

Se `alreadySeen` è `false`, il componente:
1. Legge gli step dal catalogo per quel `tourKey`.
2. Per ogni step, cerca nel DOM l'elemento con `data-tour="<target>"`. **Se non lo trova, salta quello step silenziosamente** — questo è il meccanismo che garantisce che un tour non punti mai a un bottone assente (es. "Avvia trascrizione" quando il coach non ha il permesso `AI_SESSION_NOTES`, o non è nella finestra di chiamata giusta). Se *nessuno* step trova il proprio target, il tour non parte affatto.
3. Mostra lo step corrente in una card ancorata all'elemento, via Radix Popover (`radix-ui`, già una dipendenza) — stesso pattern di posizionamento-con-collision-detection appena scritto per il tooltip di `VideoCallButton`. Un anello/bordo blu discreto (non rosso — vedi regola esistente) risalta l'elemento bersaglio.
4. "Avanti" (ultimo step: "Fatto") avanza; "Salta il tour" chiude subito. Entrambi chiamano `markTourSeen` in background (fire-and-forget, non blocca la UI).
5. Se due tour sarebbero idonei a partire sulla stessa schermata, ne parte solo uno — il più specifico al contesto, mai il generico insieme a uno più mirato.

## I 7 tour

| # | `tour_key` | Ruolo | Trigger (pagina) | Bersagli / step |
|---|---|---|---|---|
| 1 | `coach_dashboard_intro` | coach | primo arrivo su `/dashboard/coach` dopo approvazione profilo | "Nuovo appuntamento", richieste in attesa, elenco atleti — 2-3 step |
| 2 | `coach_create_appointment` | coach | prima apertura del form "Nuovo appuntamento" | calendario/orari cliccabili — 1-2 step |
| 3 | `coach_video_call` | coach | primo ingresso reale in `/dashboard/video/[bookingId]` | controlli camera/mic, bottone avvio trascrizione (solo se presente) — 2-3 step |
| 4 | `coach_ai_report_review` | coach | prima apertura di un riepilogo AI "da validare" | bottoni Approva/Rigenera — 1-2 step |
| 5 | `athlete_dashboard_intro` | atleta | primo arrivo su `/dashboard/athlete` | link "Trova un coach", elenco sessioni proprie — 2 step |
| 6 | `athlete_booking` | atleta | prima apertura di `/coaches/[slug]` da loggato | calendario/orari cliccabili — 1-2 step |
| 7 | `athlete_video_call` | atleta | primo ingresso reale in videochiamata come atleta | controlli camera/mic, chat (niente riferimento alla trascrizione) — 1-2 step |

## Cosa NON fa questo spec

- Non tocca le regole di `booking-scheduling`, `realtime-video-calls`, `ai-session-notes` — il tour osserva se un elemento esiste, non decide se deve esistere.
- Non introduce un pannello admin per editare i tour.
- Non copre il mobile.
- Non introduce un modo per l'utente di rivedere un tour già visto (rimandato).

## Testing

`lib/core/tours/` è pure logic dove possibile: `hasSeenTour`/`markTourSeen` toccano il DB (non puramente testabili senza mock), ma la selezione "quale step mostrare dato quali target esistono nel DOM" e la logica "un solo tour alla volta" vanno isolate in funzioni pure testabili con `node --test`, seguendo la convenzione del resto di `lib/core/`.
