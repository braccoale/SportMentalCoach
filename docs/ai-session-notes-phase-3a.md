# AI Session Notes — Fase 3A

Con `AI_NOTES_STT_PROVIDER=deepgram` e una `DEEPGRAM_API_KEY` solo server-side, il batch processa i job di trascrizione con Deepgram Nova-3 (`AI_NOTES_STT_MODEL=nova-3`, lingua italiana, punteggiatura, smart formatting e utterance timestamp). Il valore predefinito resta `disabled`; provider, modello, lingua e credenziali non arrivano mai dal browser.

Ogni file Ogg/Opus privato è verificato (sessione, consenso, stato `recorded`, MIME, dimensione, esistenza e checksum quando disponibile). I segmenti Track Egress sono ordinati per `segment_order`; non vengono uniti. Le utterance hanno sequenza deterministica per registrazione logica e sono sostituite atomicamente per file fisico, quindi i retry non duplicano testo.

## Trascrizione asincrona

**Il worker non attende il provider.** Prima lo faceva, dentro un'invocazione
con un tetto di sessanta secondi: un file da due ore non stava in quel budget
e falliva sempre, esaurendo i tentativi. La durata di una sessione era di
fatto un limite alla sua trascrivibilità.

Il flusso attuale:

```
worker (~1s)                    provider              callback
──────────────────────────────────────────────────────────────────
per ogni segmento non fatto:
  signed URL (900s)
  POST /v1/listen?callback=…  →  { request_id }
  registra la richiesta,
  job → awaiting_provider              │
  esce                                 │  (minuti)
                                       ↓
                                  POST risultati  →  valida il token
                                                     scrive i segmenti
                                                     job finito? → normalizza
```

- **L'audio non passa da noi.** Il worker genera una signed URL Supabase con
  TTL 900 secondi e consegna quella; è il provider a scaricare. L'URL è
  rigenerata a ogni tentativo, così una reimmissione a distanza di ore non
  dipende da una firma vecchia. Il bucket resta privato e l'URL non raggiunge
  mai il browser.
- **`awaiting_provider`** è uno stato non claimabile: il job ha consegnato il
  lavoro e nessun worker deve riprenderlo. È incluso nell'indice di unicità
  del job attivo, altrimenti un segmento nuovo prodotto da una riconnessione
  creerebbe un secondo orchestratore in parallelo.
- **L'autenticazione della callback** è un token casuale di 32 byte per
  singola richiesta, nel percorso dell'URL. L'header `dg-token` di Deepgram
  **non** è sufficiente: è l'identificatore della chiave API, non un segreto.
  Deve corrispondere anche il `request_id` nel corpo, così un token valido con
  un payload altrui non passa. Un token sconosciuto riceve 404.
- **L'ingestione è idempotente** perché il provider ritenta fino a dieci volte
  a trenta secondi di distanza. La riga in `session_transcription_requests` è
  il punto di serializzazione: solo chi la porta da `submitted` a `received`
  scrive i segmenti.
- **Il job non si completa alla cieca.** Se nel frattempo è comparso un
  segmento nuovo, torna in coda invece di chiudersi.

### Nessuna trascrizione si perde

Il provider non conserva le trascrizioni: se una consegna si smarrisce,
l'unico recupero possibile è **reinviare l'audio**, che resta disponibile per
la durata della retention. Una richiesta ferma in `submitted` da oltre **venti
minuti** viene marcata `failed` e il job torna `queued`.

La soglia è volutamente più larga della finestra di ritentativi del provider
(circa cinque minuti) sommata al tempo di trascrizione di un file lungo:
reimmettere prima significherebbe pagare e trascrivere due volte lo stesso
parlato.

**Non esiste un percorso sincrono di riserva.** Un ramo esercitato di rado
marcisce e fallisce proprio quando serve, e sarebbe comunque un ritorno allo
stato rotto — il percorso sincrono non regge le sessioni lunghe. La robustezza
sta nel recupero, non nell'alternativa.

### Configurazione

`AI_NOTES_CALLBACK_BASE_URL` deve puntare a un host **raggiungibile da
internet**. In sviluppo locale serve un tunnel: senza, le trascrizioni non
tornano mai e il recupero si limita a reinviarle verso lo stesso vicolo cieco.

I job restano atomici con `SKIP LOCKED`; rate limit, timeout e errori provider sono classificati e sanitizzati. Un consenso revocato o una sessione cancellata blocca nuove chiamate e la persistenza successiva. Il successo di un partecipante resta conservato se l'altro fallisce.

I transcript e i metadati provider restano server-only; la retention transcript è distinta dalla retention audio esistente e non ha cancellazione automatica in questa fase. `npm run ai-notes:diagnose-transcription` verifica configurazione, DB e storage senza inviare audio. Un eventuale smoke test reale richiede chiave, storage privato, file sintetico e autorizzazione esplicita; non è eseguito automaticamente.

Esclusi: LLM/report, riassunti, normalizzazione LLM, diarization, merge audio, LiveKit Agents e visualizzazione browser dei transcript.
