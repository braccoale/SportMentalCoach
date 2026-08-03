# AI Session Notes — Fase 2B

`session_audio_recordings` conserva i segmenti fisici prodotti da LiveKit Track Egress. `session_participant_recordings` li raggruppa per sessione e partecipante: il trigger assegna ogni nuovo Track SID al gruppo e un `segment_order` serializzato, aggiornando aggregati di inizio, fine, durata, conteggio e stato. I file non vengono uniti.

`session_ai_processing_jobs` è il registro server-only dei lavori asincroni. I tipi sono `transcription`, `transcript_normalization` e `report_generation`; gli stati sono `queued`, `processing`, `completed`, `failed` e `cancelled`. Le chiavi di idempotenza e l'indice parziale sui lavori attivi impediscono duplicati. Il worker reclama un job con una transazione atomica e `FOR UPDATE SKIP LOCKED`, applica retry ritardati fino al massimo tentativi, recupera lock scaduti e annulla il lavoro quando la sessione è cancellata o il consenso non è più valido.

Le interfacce `SpeechToTextProvider` e `SessionReportProvider` sono selezionate solo lato server. In questa fase le factory restituiscono esclusivamente provider disabilitati, che producono l'errore tipizzato `PROVIDER_NOT_CONFIGURED`; non esistono chiamate a provider esterni né credenziali dal client.

Il comando `npm run ai-notes:process -- --limit=5` recupera eventuali job stale e processa un batch finito, quindi termina. È adatto a una futura esecuzione schedulata (per esempio Cloud Run Jobs o cron), senza richiedere un worker residente.

`session_transcript_segments` ora può riferire sia la registrazione logica sia il segmento fisico e contiene lo stato di normalizzazione. Non produce ancora trascrizioni e resta inaccessibile ai ruoli browser.

Non inclusi in Fase 2B: STT, LLM, generazione report, output transcript, unione audio, upload/download audio aggiuntivi e invocazioni di servizi esterni.
