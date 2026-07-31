# AI Session Notes — Fase 3D.1

Sono definiti confini server-only per executor DB, storage audio, STT e clock. La factory di produzione conserva DB e adapter Supabase/Deepgram correnti; la factory di test accetta sostituzioni esplicite. `InMemoryAudioStorage` consente metadati, download, oggetti mancanti e cancellazione senza rete. `TEST_DATABASE_URL` è obbligatorio per E2E futuri, non può coincidere con `POSTGRES_URL` e deve riferirsi a un database riconoscibilmente di test salvo override esplicito.

Il runtime prodotto non è stato intenzionalmente modificato. La propagazione completa dell'executor attraverso webhook e pipeline sarà il passo necessario prima dell'E2E transazionale di Fase 3D.
