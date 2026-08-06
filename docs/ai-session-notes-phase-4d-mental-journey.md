# AI Session Notes — Fase 4D: Mental Journey v1

Vista storica del percorso di un atleta, riservata al coach. È una **proiezione read-only**: non scrive nulla, non chiama modelli, non rilegge transcript, audio o bozze. Nessuna migrazione: tutto è derivato da dati già persistiti nelle fasi [4B](ai-session-notes-phase-4b-session-compass.md) e [4C](ai-session-notes-phase-4c-commitments.md).

## Fonti ammesse

Due, e solo due:

- `session_ai_reports` con `status = 'approved'` e `report_kind = 'session_compass_v1'`, documento efficace (`coach_edited_report_json ?? generated_report_json`);
- `session_ai_commitments` non archiviati, con il loro stato reale.

La regola di ammissione vive in `isApprovedCompassReport`, funzione pura riapplicata dall'adapter oltre alla clausola SQL: bozze, `failed`, `ready_for_review` e versioni non approvate non hanno alcun percorso verso lo storico.

## Cosa contiene

`summary` (periodo, sessioni approvate, impegni per stato) — la percentuale di completamento è `null` sotto i 5 impegni, perché sotto quella soglia racconterebbe rumore.

`timeline` — una card per sessione approvata, dalla più recente: data, coach, sintesi già approvata, temi, eventuale risorsa emersa, metriche strutturate senza citazioni, momenti chiave, impegni con stato attuale, link al Session Compass della sessione.

`recurringThemes` — aggregazione dei soli temi scritti nei report approvati, accorpati per etichetta normalizzata (accenti, punteggiatura, spaziatura), con ricorrenza, prima e ultima comparsa. La formulazione è `Tema emerso in N sessioni`: nessuna direzione, nessun miglioramento o peggioramento attribuito.

`followThrough` — impegni aperti, più quelli chiusi nelle 3 sessioni più recenti; segnala i ritardi confrontando `due_date` con la data corrente.

`pointsToRevisit` — derivazione deterministica, mai AI, da: temi ricorrenti nelle ultime 3 sessioni, impegni atleta aperti o non riusciti, `next_session_prep` del report approvato più recente. Ogni punto porta la propria provenienza (`Dal report del …`, `Impegno non completato — dalla sessione del …`).

## Privacy

Il modello di autorizzazione è quello del Compass: admin, poi **negazione esplicita dell'atleta**, poi coach in relazione con l'atleta e con entitlement. In questa fase la Mental Journey non è una superficie dell'atleta.

Un coach vede soltanto le proprie sessioni con quell'atleta (`coachUserId` nello scope della query); l'admin vede l'intero percorso. La proiezione non trasporta estratti di transcript, `summaryEvidence`, `coach_note` o `source_excerpt`: la timeline espone solo testi già approvati.

## Superfici

- `GET /api/coach/athletes/[athleteId]/mental-journey`
- `/dashboard/coach/athletes/[athleteId]/mental-journey` — la pagina legge il dominio direttamente, senza chiamare la propria API
- Ingresso dalla dashboard coach: sezione "Mental Journey" con gli atleti seguiti
- `GET /api/coach/athletes/[athleteId]/transcript-search` — ricerca paginata nei soli transcript delle sessioni approvate e autorizzate; gli id ammessi sono derivati server-side dalla Mental Journey

Colori di stato coerenti: completato verde, in corso blu, da fare neutro, da riprendere ambra. Nessun controllo di modifica: ogni azione operativa rimanda al Session Compass.

## Grafici e performance

Il percorso mostra grafici multi-sessione solo per le metriche realmente presenti; il coach può scegliere fino a quattro serie e ha sempre una tabella testuale equivalente. In assenza di metriche viene mostrata la frequenza documentata dei temi, non valori inventati. Timeline, temi e trascrizioni hanno caricamento progressivo; le trascrizioni complete restano lazy/on demand.

## Fuori scope

Confronti fra atleti, vista atleta, player e download audio.
