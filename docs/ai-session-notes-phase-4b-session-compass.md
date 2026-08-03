# AI Session Notes — Fase 4B: Session Compass v1

Session Compass è il report post-sessione riservato al coach. Non è un summary della trascrizione: è una lettura contestualizzata in cui ogni elemento è ancorato a un segmento di transcript. Non è visibile all'atleta, né via UI né via API o RLS.

## Sorgente e confini

La fase parte dalla transcript intelligence già pronta (`session_transcript_timeline_segments`). Registrazione, LiveKit Egress, storage audio, STT e normalizzazione non sono toccati.

Il fingerprint SHA-256 della timeline (`compassSourceFingerprint`) copre id, tempi, speaker e testo dei segmenti più la versione del contratto. Una bozza viene rigenerata **solo** quando cambia quel fingerprint o `AI_NOTES_COMPASS_PROMPT_VERSION`: un secondo tentativo sullo stesso input non richiama il modello e restituisce `regenerated: false`.

## Contenuto

`session_overview` (sintesi neutra, 2–3 temi, al massimo una risorsa emersa), `key_moments` (max 3), `commitments` (owner `coach` o `athlete`, stato iniziale `pending`, scadenza solo se detta esplicitamente), `next_session_prep` (max 3), `coach_note`.

Regole di merito applicate dal codice, non solo dal prompt:

- ogni insight richiede `transcript_segment_id`, `startMs`/minuto e un estratto realmente contenuto nel segmento citato;
- se l'evidenza non si risolve, l'elemento viene **omesso** in fase di montaggio (`assembleSessionCompassReport`), mai completato;
- i testi che presentano una causa o una diagnosi come fatto sono scartati (`containsForbiddenClaim`);
- nessun KPI psicologico numerico è previsto dal contratto.

Il contesto passato al modello è limitato a: nome e ruolo del coach, sport dell'atleta, obiettivo del percorso e al massimo gli ultimi due report approvati (in forma sintetica). Nessuno storico grezzo delle sessioni.

## Persistenza e versioni

`session_ai_reports` è stata estesa, non duplicata: `report_kind`, `source_fingerprint`, unicità su `(session_ai_notes_id, report_kind, report_version)` e indice parziale che ammette una sola bozza aperta per sessione.

- `generated_report_json` — bozza AI;
- `coach_edited_report_json` — documento con le modifiche manuali agli impegni;
- `private_coach_notes` — `coach_note`, mai prodotta né sovrascritta dall'AI.

Un report approvato è immutabile: la rigenerazione apre `report_version + 1` riportando la nota del coach e le modifiche agli impegni (correlate per evidenza, non per id).

## Autorizzazione

`authorizeSessionCompass` è una policy pura e ordinata: admin, poi negazione esplicita dell'atleta, poi coach titolare con entitlement. Solo il coach titolare scrive `coach_note`. A livello di database la policy `ai_reports_select_coach_or_admin` resta l'unico percorso di lettura e i ruoli browser non hanno privilegi di scrittura.

## API

- `GET /api/coach/ai-session-notes/[sessionId]/compass`
- `PATCH …/compass` — `coachNote` oppure `commitment: { id, text?, owner?, status? }`
- `POST …/compass/regenerate`
- `POST …/compass/approve`
- `GET …/compass/transcript` — timeline con gli stessi id citati dalle evidenze

## Configurazione

`AI_NOTES_COMPASS_MODEL` (per l'MVP `gpt-5-mini`) e `AI_NOTES_COMPASS_PROMPT_VERSION`. Il dominio non ha default di modello.

## Fuori scope

Timeline storiche, trend, dashboard KPI, check-in atleta e nuove funzionalità di registrazione restano alla fase successiva.
