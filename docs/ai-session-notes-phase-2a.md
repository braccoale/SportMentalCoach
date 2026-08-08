# AI Session Notes — Fase 2A

## Confini

Questa fase registra esclusivamente le tracce microfono autorizzate di coach e
atleta tramite LiveKit Track Egress. Non implementa STT, diarizzazione, Agents,
LLM, report AI, analisi emotiva, video o Room Composite Egress.

Il browser non riceve mai Track SID, Egress ID, bucket, object key, credenziali,
URL pubblici o firmati. Le API di mutazione accettano soltanto un body vuoto:
room, identità, tracce e destinazione sono sempre risolte dal backend.

## Architettura

Il lifecycle della sessione/consenso (`session_ai_notes`) resta separato dal
lifecycle audio (`session_audio_recordings`):

```text
pending -> starting -> recording -> stopping -> recorded
                         \--------------------> failed
recorded/failed -> deletion_pending -> deleted
                                  \-> deletion_failed
```

Ogni Track SID ha una riga unica. Coach e atleta producono file Ogg/Opus
distinti. Il nome visualizzato non partecipa mai alla correlazione:

```text
booking + user ID -> identity user-{id} -> microphone Track SID
                   -> Egress ID -> object key casuale -> riga DB
```

LiveKit Track Egress è legato al Track SID e non segue una nuova pubblicazione.
Un mute che non fa unpublish lascia attivo lo stesso Egress. Un unpublish
arresta quella riga; una riconnessione, un cambio dispositivo o una
ripubblicazione genera un nuovo Track SID e quindi una nuova riga/file. Il
vincolo `(session_ai_notes_id, livekit_track_sid)` rende i retry idempotenti.

## Condizioni di avvio

L’avvio è fail-closed e richiede contemporaneamente:

- booking `accepted` e room canonica `booking-{bookingId}`;
- sessione AI `active`;
- entitlement del richiedente ancora valido;
- esattamente due consensi `accepted`;
- coach e atleta presenti con le identity canoniche;
- una traccia `AUDIO` con source `MICROPHONE` per entrambi;
- nessun guest, utente estraneo, bot o servizio presente;
- bucket Supabase dedicato verificato privato;
- configurazione LiveKit e S3 completa.

Il secondo consenso prova l’avvio server-side. Se una traccia non è ancora
pubblicata, un successivo webhook `track_published` ripete la valutazione.
L’endpoint manuale di retry è riservato al coach.

Gli inviti guest vengono bloccati allo scambio del token mentre una sessione AI
è aperta. Se un partecipante non verificato entra dopo l’avvio, il webhook
richiede immediatamente lo stop e registra un audit.

## Stop

Lo stop usa un claim DB condizionale ed è idempotente. Viene richiesto da:

- revoca o rifiuto del consenso;
- cancellazione della richiesta/sessione;
- completamento o cancellazione dell’appuntamento;
- `participant_left`, `track_unpublished` e `room_finished`;
- ingresso di un partecipante non verificato;
- revoca dell’entitlement;
- timeout di sicurezza rilevato dalla riconciliazione.

La risposta sincrona di LiveKit non marca mai il file come finale. Lo stato
`recorded` viene assegnato soltanto dopo un evento Egress terminale e la
verifica dell’oggetto nello storage; la riconciliazione copre webhook mancanti.

## Webhook

Endpoint: `POST /api/livekit/webhook`.

La firma è verificata con `WebhookReceiver` e la chiave del progetto. La
finestra timestamp è configurabile (default 24 ore, per tollerare retry del
provider); eventi futuri oltre 5 minuti sono respinti. `event_id` è primary key
nel ledger `livekit_webhook_receipts`. Vengono memorizzati soltanto digest,
tipo, room, timestamp e stato di elaborazione, mai il body grezzo.

Sono gestiti:

- `participant_joined`, `participant_left`;
- `track_published`, `track_unpublished`;
- `egress_started`, `egress_updated`, `egress_ended`;
- `room_finished`.

LiveKit rappresenta un fallimento Egress nello stato terminale
`EGRESS_FAILED`/`EGRESS_ABORTED`/`EGRESS_LIMIT_REACHED` contenuto
nell’evento `egress_ended`; non esiste un distinto evento webhook
`egress_failed` nel protocollo corrente.

## Storage e retention

Provider: Supabase Storage tramite endpoint S3-compatible, bucket privato
dedicato. Il backend crea/aggiorna il bucket con:

- `public: false`;
- MIME consentito `audio/ogg`;
- limite predefinito 128 MiB, configurabile;
- object key `audio-recordings/{sessionId}/{role}/{UUID}.ogg`;
- accesso tramite service role e credenziali S3 esclusivamente server-side.

Il progetto non ha policy browser su `storage.objects`; le tabelle di
registrazione e ricevute non hanno grant o policy browser. Non esiste alcuna
API di download nella Fase 2A.

Retention MVP proposta: **7 giorni**, configurabile tra 1 e 30. Il comando è
dry-run per default:

```text
npm run ai-notes:retention
npm run ai-notes:retention -- --apply
```

`--apply` effettua claim, eliminazione, verifica di assenza, `deleted_at`,
audit e stato `deletion_failed` ritentabile. Non usarlo su un ambiente
production-like per test non isolati.

## Riconciliazione

Il comando è dry-run per default:

```text
npm run ai-notes:reconcile
npm run ai-notes:reconcile -- --repair
```

Confronta DB, lista Egress, oggetti storage e ricevute webhook e segnala:

- Egress attivo senza record DB;
- record transitorio senza Egress ID o senza Egress LiveKit;
- Egress terminale con DB transitorio;
- file mancante o orfano;
- Egress live duplicato;
- transizione oltre il timeout di sicurezza;
- cancellazione incompleta;
- ricevuta webhook fallita o bloccata.

`--repair` aggiorna il timestamp di riconciliazione, audita e richiede lo stop
delle registrazioni oltre timeout. Non elimina file orfani automaticamente.

## Configurazione

Variabili documentate in `.env.example`:

```text
AI_NOTES_AUDIO_S3_ENDPOINT
AI_NOTES_AUDIO_S3_REGION
AI_NOTES_AUDIO_S3_ACCESS_KEY
AI_NOTES_AUDIO_S3_SECRET_KEY
AI_NOTES_AUDIO_BUCKET
AI_NOTES_AUDIO_RETENTION_DAYS
AI_NOTES_AUDIO_MAX_BYTES
AI_NOTES_AUDIO_SAFETY_TIMEOUT_MINUTES
LIVEKIT_WEBHOOK_MAX_AGE_SECONDS
```

L’endpoint S3 deve appartenere allo stesso progetto Supabase configurato. La
registrazione non usa fallback locale o pubblico.

## Ciclo di vita della sessione e riconnessioni

**Un file audio pronto non significa sessione finita.** Sono due fatti
distinti, e trattarli come uno solo era il difetto più grave della pipeline:
alla chiusura del primo Egress la sessione avanzava a `processing`, e da lì
`track_published` non riavviava più nulla. Bastava una disconnessione a metà
seduta perché tutto il parlato successivo al rientro finisse senza audio,
senza alcun segnale né al coach né all'atleta.

La sessione resta `active`, e quindi registrabile, finché non la chiude uno
di questi tre segnali — e nessun altro percorso può chiuderla:

| segnale | origine | motivo registrato |
|---|---|---|
| Il coach preme *Fine sessione* | `POST /api/ai-session-notes/:id/close` | `coach_closed` |
| La stanza LiveKit cessa di esistere | webhook `room_finished` | `room_finished` |
| Limite di sicurezza superato | `closeExpiredAiNotesSessions` nel worker | `closed_by_timeout` |

Il motivo finisce in `session_ai_notes.metadata.closeReason`. Serve a
distinguere una chiusura decisa da una subita: una sessione chiusa d'ufficio
non deve mai sembrare una sessione conclusa normalmente.

**La stanza vuota non è un criterio.** «Non c'è più nessuno in call» è
indistinguibile da «sono caduti entrambi e stanno rientrando», che è
esattamente il caso da salvare. Solo `room_finished`, in cui la stanza
smette di esistere, è definitivo.

**Uscire non chiude niente.** Su `participant_left` si fermano le sole tracce
di chi esce (`stopAiNotesRecordingsByParticipant`). Se cade l'atleta, il
coach continua a essere registrato senza interruzione. Al rientro,
`track_published` apre un segmento nuovo.

**Pausa e chiusura sono azioni diverse.** `recording/stop` mette in pausa e
la sessione resta riprendibile — nel pannello corrisponde a *Riprendi
registrazione*. `close` chiude, e dopo di essa nemmeno un microfono
ripubblicato fa ripartire la registrazione. Nessuna delle due tocca la
videochiamata.

### Quanti file, quante trascrizioni

Ogni interruzione produce un file in più, ma **non** una trascrizione in più:

```
2 partecipanti × N rientri  →  file audio separati (mai concatenati)
                                        ↓
              1 registrazione logica per partecipante
                                        ↓
                     1 timeline unica, cronologica
                                        ↓
                     1 Session Compass · 1 report
```

I segmenti vengono riallineati sull'orologio reale usando lo `started_at` di
ciascun Egress, quindi coach e atleta restano correttamente intrecciati anche
attraverso il buco della disconnessione, che resta visibile come intervallo
scoperto. Gli audio non vengono mai uniti: l'unificazione avviene sulla
trascrizione, non sui byte.

**Una sola registrazione viva per traccia.** L'indice parziale
`session_audio_recordings_live_track_unique` (migrazione `0046`) impedisce due
registrazioni simultanee dello stesso microfono, mentre lascia liberi i
segmenti già conclusi. Serve a garantire che lo stesso parlato non venga
trascritto due volte: la migrazione `0043` credeva di dare questa garanzia
tramite l'unicità su `(sessione, traccia, segment_order)`, ma il trigger
assegna sempre `MAX(segment_order) + 1` e quel vincolo non poteva mai
scattare.

## Piano e costi

Il progetto è LiveKit Cloud, ma il piano non è esposto dall’API di servizio
configurata. `npm run ai-notes:diagnose` effettua soltanto letture e indica i
dati da verificare nella dashboard.

La pagina pricing LiveKit corrente indica Track Egress come export raw a
singolo stream: Build include 60 minuti, Ship 600 e Scale 8.000; l’overage
pubblicato per Ship/Scale è $0,001/minuto. Una sessione di 60 minuti con due
tracce usa 120 Track Egress minutes, quindi l’overage teorico è $0,12. Sul
piano Build supera i 60 minuti inclusi e la pagina non pubblica un overage
Build: occorre verificare nella dashboard se l’operazione viene bloccata o
richiede upgrade.

Fonti:

- https://livekit.com/pricing
- https://docs.livekit.io/transport/media/ingress-egress/egress/track/
- https://docs.livekit.io/transport/media/ingress-egress/egress/outputs/
- https://supabase.com/docs/guides/storage/s3/compatibility
- https://supabase.com/docs/guides/storage/pricing
- https://supabase.com/docs/guides/platform/manage-your-usage/egress

## Test reale controllato

Non eseguito: il piano non è determinabile via API e non sono configurate
credenziali S3 dedicate per l’audio. Non sono state create room, tracce, Egress
o file. Prima di un test reale servono piano/concorrenza confermati, bucket
isolato, due identità sintetiche, audio sintetico e budget massimo approvato.

