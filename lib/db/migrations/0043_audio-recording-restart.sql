-- Riavvio di una registrazione audio interrotta.
--
-- Il modello a segmenti esiste già: un trigger assegna a ogni riga fisica il
-- proprio `participant_recording_id` e un `segment_order` progressivo, e la
-- trascrizione ricompone i segmenti in ordine. Mancava solo il permesso di
-- averne più di uno per la stessa traccia: l'unicità su
-- (sessione, traccia) rendeva impossibile registrare di nuovo lo stesso
-- microfono dopo un'interruzione, perché la traccia pubblicata è la stessa.
--
-- La nuova unicità include il numero di segmento: due registrazioni
-- contemporanee sulla stessa traccia restano impossibili (il segmento
-- avrebbe lo stesso ordine), ma una successiva è consentita.
ALTER TABLE "session_audio_recordings"
  DROP CONSTRAINT IF EXISTS "session_audio_recordings_session_track_unique";--> statement-breakpoint

-- Il trigger valorizza sempre `segment_order`, ma le righe anteriori al
-- modello a segmenti potrebbero averlo nullo: con un NULL l'unicità non
-- proteggerebbe più nulla (in Postgres due NULL non sono uguali).
UPDATE "session_audio_recordings" SET "segment_order" = 0
  WHERE "segment_order" IS NULL;--> statement-breakpoint

ALTER TABLE "session_audio_recordings"
  ALTER COLUMN "segment_order" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "session_audio_recordings"
  ALTER COLUMN "segment_order" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "session_audio_recordings"
  ADD CONSTRAINT "session_audio_recordings_session_track_segment_unique"
  UNIQUE ("session_ai_notes_id", "livekit_track_sid", "segment_order");
