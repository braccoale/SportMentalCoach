# Affidabilità della pipeline di trascrizione AI

Data: 2026-08-08
Stato: approvato in brainstorming, da pianificare

## Il problema

La trascrizione AI è la funzionalità centrale del prodotto, e oggi perde
silenziosamente parte del lavoro quando una sessione non fila liscia.

Tre difetti, trovati leggendo la pipeline, in ordine di gravità.

**1. Dopo la prima disconnessione la registrazione non riparte più.**
Quando un partecipante esce, `participant_left` ferma *tutte* le tracce della
sessione, non solo la sua (`livekit-webhook.ts`, ramo `room_finished` /
`participant_left`). I file si chiudono, e alla chiusura del primo egress
valido la sessione avanza a `processing` (`livekit-webhook.ts`, ramo
`EGRESS_COMPLETE`). Al rientro, `track_published` riavvia la registrazione solo
`if (session.status === 'active')`: la condizione è ormai falsa, e la macchina a
stati non prevede il ritorno da `processing` ad `active`
(`state-machine.ts`). Risultato: **tutto ciò che accade dopo la prima
disconnessione non viene registrato**, senza alcun segnale.

**2. Le sessioni lunghe non si trascrivono.**
Il worker gira su Vercel con `maxDuration = 60` e chiama Deepgram in modo
sincrono con timeout anch'esso a 60 secondi (`providers.ts`). Prima ancora,
scarica il file audio in memoria e lo ricarica verso Deepgram
(`processing.ts`, `transcribeParticipantRecording`). Un file da due ore
(~10-25 MB per traccia) non sta in quel budget. Il job va in
`PROVIDER_TIMEOUT`, esaurisce i tre tentativi e fallisce in via definitiva. Un
singolo segmento è atomico: la ripartenza per segmento non lo salva.

**3. Il Session Compass non si rigenera quando la trascrizione si estende.**
La chiave di idempotenza è `session-compass:auto:${sessionId}` e il recupero
salta le sessioni che hanno già un job `report_generation` (`processing.ts`).
La timeline invece *si ricostruisce* correttamente quando arrivano nuovi
segmenti. Il riepilogo resta quindi fermo alla prima porzione trascritta, e
nulla lo dichiara.

Il filo comune non è la mancanza di meccanica: il modello a segmenti esiste,
è ben fatto e sarebbe sufficiente. Manca il permesso di usarlo, e manca la
franchezza verso il coach quando qualcosa va storto.

## Obiettivi

1. Una riconnessione — di uno o di entrambi i partecipanti, una o più volte —
   non deve far perdere un solo minuto di sessione.
2. La durata di una sessione non deve essere un limite alla trascrizione.
3. Il riepilogo AI deve sempre riflettere l'intera trascrizione disponibile.
4. A sessione finita, il coach deve capire in italiano chiaro quanta parte
   della sessione è stata registrata, cosa manca e perché.

## Non obiettivi

Esclusi deliberatamente, dopo confronto:

- Feedback in tempo reale durante la chiamata.
- Alerting proattivo verso l'amministratore (la dashboard di health esiste già).
- Qualità dei contenuti del Session Compass (prompt, accuratezza dell'analisi).
- Spostamento del worker fuori da Vercel.

## Vincoli

- Produzione su piano Vercel Hobby: 60 secondi per invocazione, cron
  giornaliero. Il passaggio a Pro è possibile ma **non deve essere un
  prerequisito**: migliora la latenza di recupero, non abilita il design.
- La sveglia del worker via webhook LiveKit è il percorso normale
  (`app/api/livekit/webhook/route.ts`); il cron è la rete di sicurezza.
- L'audio è conservato 7 giorni (`AI_NOTES_AUDIO_RETENTION_DAYS`), il che rende
  possibile reimmettere una trascrizione persa.

## Decisioni prese

**Approccio: trascrizione asincrona via callback Deepgram.** Scartate: la
segmentazione in file da 15 minuti (sposta il problema, moltiplica i punti di
rottura) e lo spostamento del worker su infrastruttura long-running
(sproporzionato, un ambiente in più da mantenere).

**Nessun interruttore di rollback `sync|callback`.** Un secondo percorso
esercitato di rado marcisce e fallisce quando serve; e sarebbe comunque un
ritorno allo stato rotto, dato che il percorso sincrono non regge le sessioni
lunghe. La sicurezza operativa viene dal recupero automatico e da un'azione
admin "ritrascrivi" che percorre **la stessa strada** del flusso normale, e
resta quindi collaudata dall'uso.

**Chiusura della sessione su azione esplicita del coach**, non su euristica di
stanza vuota. Con un fermo di sicurezza automatico come rete, perché una
sessione dimenticata aperta non deve restare appesa a tempo indefinito.

**Signed URL verso Deepgram** invece del caricamento dei byte dal nostro
server: è l'opzione che toglie memoria e tempo dalla function, cioè
esattamente ciò che oggi si rompe.

---

## Sezione 1 — Ciclo di vita della sessione e riavvio

Principio: disaccoppiare *«il file audio è pronto»* da *«la sessione è
finita»*. Oggi coincidono, ed è la causa del difetto 1.

### Cosa cambia

**La chiusura dell'egress non chiude più la sessione.** Si rimuove
l'avanzamento a `processing` dal ramo `EGRESS_COMPLETE` di
`handleEgressEvent`. La sessione resta `active`, e quindi registrabile, finché
non arriva un segnale di fine.

**Tre segnali chiudono la sessione**, in ordine di autorità:

| segnale | origine | motivo registrato |
|---|---|---|
| Il coach preme *Termina sessione* | nuova azione, endpoint dedicato | `coach_closed` |
| `room_finished` | webhook LiveKit | `room_finished` |
| Fermo di sicurezza | spazzino periodico | `closed_by_timeout` |

**Due azioni distinte, non una.** L'attuale pulsante di stop
(`recording/stop`) mette in pausa la registrazione lasciando la sessione
`active`: il coach può riprenderla, ed è un comportamento da preservare — usarlo
come chiusura definitiva toglierebbe la pausa. Si aggiunge quindi
un'azione separata *Termina sessione*, che è l'unica a portare la sessione a
`processing`.

Terminare la sessione AI **non chiude la videochiamata**: coach e atleta
possono restare in stanza a parlare dopo aver concluso la parte registrata.

Il fermo di sicurezza usa la soglia già esistente
`AI_NOTES_AUDIO_SAFETY_TIMEOUT_MINUTES` (180 minuti di default): una sessione
`active` più vecchia di così viene chiusa d'ufficio. Non è un fallimento
silenzioso — il motivo `closed_by_timeout` compare nella copertura mostrata al
coach (sezione 4).

**Chi esce ferma solo la propria traccia.** Su `participant_left` si usa
`stopAiNotesRecordingByTrack` per le tracce di quel partecipante, non
`stopAiNotesRecordings` che oggi le ferma tutte. Se cade l'atleta, il coach
continua a essere registrato senza interruzione.

**Il rientro riparte da solo.** La guardia `session.status === 'active'` su
`track_published` resta invariata: ora è semplicemente *vera*, perché la
sessione non è stata chiusa. Non serve altro.

### Cosa non si tocca

Il modello a segmenti (`session_participant_recordings` +
`segment_order`), il trigger
`attach_audio_segment_to_participant_recording`, la verifica dei partecipanti
in stanza (`verifyRoomForTrackEgress`), la prenotazione che salta le tracce
già in corso (`reserveTracks`), e il riallineamento sull'orologio reale in
`rebuildSessionTimeline`. Sono già progettati per questo scenario.

### Comportamento atteso

Sessione di due ore, entrambi escono a metà e rientrano: quattro file fisici,
due registrazioni logiche, una timeline continua con un intervallo scoperto
segnalato.

---

## Sezione 2 — Trascrizione asincrona

Principio: il worker non deve mai *aspettare* Deepgram.

### Il flusso

1. Il worker claima un job `transcription`. Per ogni segmento fisico non
   ancora trascritto e non ancora inviato:
   - genera una **signed URL Supabase con TTL 15 minuti**, rigenerata a ogni
     tentativo (una reimmissione a distanza di ore non dipende mai da un link
     vecchio);
   - chiama `POST /v1/listen?callback=<url>&model=nova-3&language=it&...`
     passando `{ "url": "<signed url>" }`, e riceve subito un `request_id`;
   - registra la richiesta e porta il job in `awaiting_provider`.
2. Il worker esce. L'invocazione dura circa un secondo e non tocca mai i byte
   dell'audio.
3. Deepgram scarica il file, trascrive, e consegna i risultati via `POST` alla
   callback.
4. L'endpoint di callback valida, scrive i segmenti di trascrizione, e — se
   tutti i segmenti del job hanno ricevuto risposta — completa il job e innesca
   la normalizzazione.

### Nuova tabella `session_transcription_requests`

Una riga per segmento fisico inviato. È il registro che rende la callback
idempotente e il recupero possibile.

| colonna | note |
|---|---|
| `physical_recording_id` | FK a `session_audio_recordings` |
| `processing_job_id` | FK al job orchestratore |
| `callback_token` | casuale, non indovinabile, unico |
| `provider_request_id` | il `request_id` restituito da Deepgram |
| `status` | `submitted` / `received` / `failed` |
| `submitted_at`, `received_at`, `attempt` | |

### Autenticazione della callback

L'header `dg-token` di Deepgram è l'*identificatore* della chiave API, non un
segreto: non è sufficiente da solo. La callback URL contiene invece un token
casuale per singola richiesta:

```
/api/internal/ai-notes/stt-callback/<callback_token>
```

Verifica: confronto a tempo costante del token contro la riga, più
corrispondenza del `provider_request_id` nel payload. Un token vale per una
sola richiesta.

### Idempotenza

Deepgram ritenta la consegna **fino a 10 volte con 30 secondi di intervallo**
se non riceve un 2xx. La callback deve quindi tollerare consegne ripetute. Si
riusa il pattern già collaudato di `livekit_webhook_receipts`: claim della
ricevuta, digest del payload, stati `processing` / `processed`. Una richiesta
già `received` risponde 200 senza riscrivere nulla.

### Il job cambia stato, non natura

Si aggiunge `awaiting_provider` al vincolo di stato di
`session_ai_processing_jobs`. Il job resta per-partecipante e resta
l'orchestratore: si completa quando *tutti* i suoi segmenti hanno ricevuto la
callback, e solo allora innesca la normalizzazione. La logica «salta ciò che è
già trascritto» resta il meccanismo di ripartenza.

**Un job solo per partecipante, anche durante l'attesa.** `awaiting_provider`
va aggiunto all'indice unico parziale che oggi copre `('queued',
'processing')`, altrimenti un segmento nuovo — prodotto proprio da una
riconnessione — creerebbe un secondo job orchestratore in parallelo al primo.
Con `awaiting_provider` incluso, l'accodamento per il nuovo segmento risulta
duplicato e non fa nulla; è il job esistente a farsene carico.

Perché ciò funzioni, la callback **non completa il job alla cieca**: prima di
chiuderlo verifica se il partecipante ha segmenti non ancora inviati. Se ne
esistono, riporta il job a `queued` invece di completarlo, così la corsa
successiva del worker li invia. Il job si completa solo quando non resta nulla
da trascrivere.

### Quando la callback non arriva

Deepgram non conserva le trascrizioni: se la consegna si perde, l'unico
recupero è **reinviare l'audio**, che è ancora disponibile per 7 giorni.

`recoverStaleAiProcessingJobs` viene esteso: una richiesta ferma in
`submitted` da oltre **20 minuti** viene reinviata, entro il tetto dei
tentativi già previsto (`max_attempts`, 3). La soglia è volutamente più ampia
della finestra di ritentativi di Deepgram (~5 minuti) sommata al tempo di
elaborazione di un file lungo.

Su piano Hobby questo recupero dipende dal cron giornaliero; il percorso
normale resta la sveglia via webhook. Il passaggio a Pro accorcia solo questa
coda.

### Conseguenza da documentare

Con la signed URL, Deepgram scarica l'audio da Supabase invece di riceverlo
dal nostro server. Il destinatario e il dato trattato non cambiano — cambia il
percorso. Vanno aggiornati `docs/legal/dpa-fornitori.md` e
`docs/legal/registro-trattamenti.md`.

---

## Sezione 3 — Rigenerazione del Session Compass

Il Compass va legato al *contenuto*, non alla sessione.

- Chiave di idempotenza: `session-compass:auto:${sessionId}:${fingerprint}`,
  dove il fingerprint è quello della timeline già calcolato da
  `sourceFingerprint` in `timeline.ts`.
- `enqueueReadySessionCompassJobs` cerca l'assenza di un job **per quel
  fingerprint**, non di un job qualsiasi.

Timeline invariata → nessun lavoro doppio. Timeline estesa → un Compass nuovo,
automaticamente.

**Vincolo sui report già approvati.** Se il coach ha già approvato o condiviso
un report, il Compass rigenerato non lo sostituisce: viene proposto come nuova
versione da rivedere, e il coach vede che la trascrizione si è estesa.

---

## Sezione 4 — Copertura della sessione e feedback al coach

Principio: il coach deve poter rispondere a una domanda sola — *«di questa
sessione, quanto ha davvero sentito l'AI, e cosa manca?»* — senza aprire un
database.

### Il modello: `getSessionCoverage(sessionId)`

Funzione di dominio che confronta la finestra della sessione con i segmenti
effettivamente registrati e trascritti. Restituisce una struttura, mai testo.

| campo | significato |
|---|---|
| `sessionWindow` | inizio, chiusura, e **come** si è chiusa (`coach_closed`, `room_finished`, `closed_by_timeout`) |
| `recordedSpans` | intervalli coperti, dagli `startedAt`/`endedAt` reali degli egress |
| `gaps[]` | buchi: inizio, durata, causa |
| `coveragePercent` | quota della sessione effettivamente registrata |
| `transcription` | per partecipante: segmenti completati, in attesa, falliti con codice |
| `state` | `completa` / `con_interruzioni` / `in_corso` / `parziale` / `fallita` |

Le cause dei buchi esistono già ma nessuno le legge: lo `stopReason` salvato
nei metadata della registrazione e gli eventi in `session_ai_audit_events`.
Qui diventano la spiegazione.

Mappatura delle cause in linguaggio umano:

| codice | testo |
|---|---|
| `participant_left` | disconnessione di un partecipante |
| `track_unpublished` | microfono disattivato |
| `unverified_participant_joined` | è entrato un partecipante non verificato |
| `closed_by_timeout` | sessione chiusa automaticamente dopo il limite di sicurezza |
| `EGRESS_*` | registrazione non riuscita |

### La presentazione, separata dal modello

Un modulo distinto traduce la struttura in italiano comprensibile. Il coach non
legge mai un codice d'errore.

> **Sessione registrata al 94%** — 2h 04m di sessione, 1h 57m registrati.
> Un'interruzione di 7 minuti dalle 15:32, per una disconnessione. Il resto è
> integro. Trascrizione completa.

> **Trascrizione in corso** — 3 parti su 4 completate. L'ultima è in
> elaborazione, di solito richiede pochi minuti.

> **Trascrizione non riuscita** su una parte della sessione. Riproviamo
> automaticamente; se non si risolve, il riepilogo coprirà solo il resto.

### La regola che tiene tutto insieme

**Il riepilogo dichiara sempre la propria base.** Se il Compass è stato
generato su una sessione con buchi, lo dice dentro il riepilogo stesso.
Un'analisi AI presentata come completa quando copre l'80% della seduta è
peggio di nessuna analisi: è il fallimento silenzioso che questo lavoro esiste
per eliminare.

### Collocazione

Una card nel workspace post-sessione del coach
(`components/session-compass/`, pagina `appointments/[id]`), accanto al
Compass. Discreta quando la copertura è integra, esplicita e in evidenza
quando non lo è.

`buildAiSessionArchiveIndicator` viene arricchito con la copertura per lo stato
sintetico in lista, non sostituito.

---

## Ordine di realizzazione

Le quattro sezioni sono un solo lavoro coerente, ma vanno realizzate in
quest'ordine, perché ognuna è utile da sola e le prime due fermano una perdita
di dati in corso.

1. **Sezione 1** — ferma la perdita di registrazione dopo una riconnessione.
   È il difetto più grave ed è il più contenuto da correggere.
2. **Sezione 2** — sblocca le sessioni lunghe. Indipendente dalla 1.
3. **Sezione 3** — piccola, ma ha senso solo dopo la 1, che è ciò che rende
   comune l'estensione della timeline.
4. **Sezione 4** — il feedback al coach; poggia sui motivi di chiusura
   introdotti dalla 1 e sugli stati introdotti dalla 2.

## Gestione degli errori

| situazione | comportamento |
|---|---|
| Deepgram rifiuta l'invio (4xx/5xx) | job `failed` con codice, ritentativo entro `max_attempts` |
| Callback mai ricevuta | richiesta reinviata dopo 20 minuti, entro `max_attempts` |
| Callback duplicata | 200, nessuna riscrittura |
| Callback con token non valido | 404, nessuna informazione all'esterno |
| Signed URL scaduta prima del download | Deepgram fallisce, si reinvia con URL nuova |
| Egress fallito su un segmento | copertura `parziale`, buco dichiarato al coach |
| Sessione mai chiusa dal coach | chiusa dal fermo di sicurezza, motivo dichiarato |
| Trascrizione definitivamente fallita | sessione `transcription_failed`, coach informato con la porzione utilizzabile |

## Testing

**Unitari, senza rete:**
- `getSessionCoverage` su casi costruiti: sessione integra, una riconnessione,
  entrambi caduti, trascrizione parziale, chiusura per timeout, nessun audio.
- Livello di presentazione: le frasi prodotte per ciascuno stato.
- Chiave del Compass: stesso fingerprint → nessun job nuovo; fingerprint
  diverso → job nuovo.

**Integrazione, con dipendenze finte** (esiste già l'iniezione via
`AiSessionNotesDependencies` e i test
`livekit-dependency-injection.test.ts` / `transcription-worker-dependency-injection.test.ts`):
- Sequenza webhook: join → publish → leave di uno solo → rientro → publish →
  chiusura coach. Attesa: 3 segmenti fisici, nessuna perdita, sessione chiusa
  una volta sola.
- Callback: consegna singola, consegna duplicata, token errato, `request_id`
  non corrispondente.
- Reimmissione di una richiesta ferma oltre soglia.

**Verifica end-to-end:** estendere
`scripts/verify/ai-session-notes-recording-flow.ts` con lo scenario di
riconnessione.

## Rischi noti

- **Latenza di recupero su Hobby.** Se sia la sveglia via webhook sia la
  callback falliscono, il recupero attende il cron giornaliero. Mitigazione
  disponibile ma non richiesta: passaggio a Pro.
- **Tempo di elaborazione Deepgram su file lunghi non misurato.** Il design non
  ne dipende (la callback è indipendente dalla durata), ma la soglia di 20
  minuti per la reimmissione va confermata con una misura reale su un file da
  due ore.
- **Sessione chiusa tardi dal coach.** Con la chiusura esplicita, un coach che
  dimentica lascia la registrazione attiva fino al fermo di sicurezza,
  producendo audio inutile e costo di trascrizione. La copertura lo dichiara,
  ma non lo previene.
