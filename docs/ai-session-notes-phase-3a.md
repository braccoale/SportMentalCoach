# AI Session Notes — Fase 3A

Con `AI_NOTES_STT_PROVIDER=deepgram` e una `DEEPGRAM_API_KEY` solo server-side, il batch processa i job di trascrizione con Deepgram Nova-3 (`AI_NOTES_STT_MODEL=nova-3`, lingua italiana, punteggiatura, smart formatting e utterance timestamp). Il valore predefinito resta `disabled`; provider, modello, lingua e credenziali non arrivano mai dal browser.

Ogni file Ogg/Opus privato è verificato (sessione, consenso, stato `recorded`, MIME, dimensione, esistenza e checksum quando disponibile) e scaricato dal backend. I segmenti Track Egress sono ordinati per `segment_order`; non vengono uniti. Le utterance hanno sequenza deterministica per registrazione logica e sono sostituite atomicamente per file fisico, quindi i retry non duplicano testo.

I job restano atomici con `SKIP LOCKED`; rate limit, timeout e errori provider sono classificati e sanitizzati. Un consenso revocato o una sessione cancellata blocca nuove chiamate e la persistenza successiva. Il successo di un partecipante resta conservato se l'altro fallisce.

I transcript e i metadati provider restano server-only; la retention transcript è distinta dalla retention audio esistente e non ha cancellazione automatica in questa fase. `npm run ai-notes:diagnose-transcription` verifica configurazione, DB e storage senza inviare audio. Un eventuale smoke test reale richiede chiave, storage privato, file sintetico e autorizzazione esplicita; non è eseguito automaticamente.

Esclusi: LLM/report, riassunti, normalizzazione LLM, diarization, merge audio, LiveKit Agents e visualizzazione browser dei transcript.
