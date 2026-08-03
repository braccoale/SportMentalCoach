# AI Session Notes — Fase 4C: follow-through degli impegni

Gli impegni concordati in sessione smettono di essere testo dentro il JSON del report e diventano entità operative condivise fra coach e atleta. Nessuna generazione AI aggiuntiva: questa fase parte da [Session Compass v1](ai-session-notes-phase-4b-session-compass.md).

## Il momento in cui un impegno diventa operativo

L'approvazione del report. Una bozza non crea nulla di visibile all'atleta: `approveSessionCompass` sincronizza gli impegni solo quando il report passa ad `approved`.

Il report approvato resta immutabile. Ogni evoluzione successiva — stato, scadenza, testo, esito dichiarato dall'atleta — avviene su `session_ai_commitments`, con evento di audit dedicato.

## Identità e idempotenza

`commitment_key` è lo SHA-256 di `transcript_segment_id + estratto normalizzato`: la stessa evidenza è lo stesso impegno anche se il testo è stato riscritto. La chiave è unica per sessione, quindi una seconda approvazione non duplica.

`planCommitmentSync` è una funzione pura. Alla sincronizzazione di una nuova versione approvata:

- la tracciabilità (`source_report_id`, `source_report_version`) viene sempre aggiornata;
- testo, owner, scadenza ed evidenza vengono riallineati **solo** se l'impegno non è `manually_edited` e non è già `completed` o `skipped`: la decisione umana prevale;
- lo stato operativo non viene mai riscritto dal report;
- un impegno sparito dalla nuova versione viene archiviato solo se nessuno l'ha ancora toccato; se ricompare in una versione successiva viene riattivato.

## Privacy

La proiezione per l'atleta (`AthleteCommitmentView`) è un tipo separato, non un sottoinsieme opzionale: estratto del transcript, timestamp, `commitment_key` e ogni altro contenuto del Compass non hanno un percorso verso la UI atleta. Overview, temi, momenti chiave, preparazione e nota del coach restano dietro l'autorizzazione Compass, che nega esplicitamente l'atleta.

RLS su `session_ai_commitments`: `SELECT` a coach della sessione, admin, oppure atleta owner della riga (`owner = 'athlete' AND athlete_user_id = current_app_user_id()`). Gli impegni con `owner = 'coach'` sono invisibili all'atleta anche a livello di database. Nessun ruolo browser ha privilegi di scrittura. La verifica è in `npm run test:ai-notes:rls`.

## Superfici

- Coach: sezione "Impegni attivi" nel pannello Session Compass, con stato reale, esito dichiarato dall'atleta e modifica di testo/owner/scadenza/stato — `PATCH /api/coach/ai-session-notes/[sessionId]/compass/commitments`.
- Atleta: "I tuoi prossimi passi" nella dashboard, ordinato per scadenza e poi per sessione più recente, con "Completato" / "Non sono riuscito" più nota facoltativa — server action `updateCommitmentOutcomeAction`.

## Fuori scope

Timeline storica, trend, KPI psicologici, notifiche e promemoria automatici.
