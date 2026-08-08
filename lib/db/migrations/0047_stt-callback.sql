-- Trascrizione asincrona: una riga per ogni invio di un segmento audio al
-- provider STT.
--
-- Prima il worker attendeva la risposta dentro l'invocazione della function,
-- con un tetto di 60 secondi: una sessione di due ore non stava in quel
-- budget e falliva sempre, esaurendo i tentativi. Ora l'invio e la risposta
-- sono due momenti distinti, e questa tabella è ciò che li tiene legati:
-- rende la consegna idempotente e rende possibile accorgersi di una risposta
-- che non è mai arrivata.
CREATE TABLE "session_transcription_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "physical_recording_id" integer NOT NULL,
  "processing_job_id" integer NOT NULL,
  "callback_token" varchar(64) NOT NULL,
  "provider_request_id" varchar(200),
  "provider" varchar(80) NOT NULL,
  "status" varchar(24) DEFAULT 'submitted' NOT NULL,
  "attempt" integer DEFAULT 1 NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "received_at" timestamp with time zone,
  "error_code" varchar(80),
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_transcription_requests_token_unique"
    UNIQUE ("callback_token"),
  CONSTRAINT "session_transcription_requests_status_check"
    CHECK ("status" IN ('submitted', 'received', 'failed')),
  CONSTRAINT "session_transcription_requests_attempt_check"
    CHECK ("attempt" >= 1)
);--> statement-breakpoint

ALTER TABLE "session_transcription_requests"
  ADD CONSTRAINT "session_transcription_requests_physical_fk"
  FOREIGN KEY ("physical_recording_id")
  REFERENCES "public"."session_audio_recordings"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcription_requests"
  ADD CONSTRAINT "session_transcription_requests_job_fk"
  FOREIGN KEY ("processing_job_id")
  REFERENCES "public"."session_ai_processing_jobs"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcription_requests"
  ADD CONSTRAINT "session_transcription_requests_createdby_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcription_requests"
  ADD CONSTRAINT "session_transcription_requests_updatedby_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Una sola richiesta viva per segmento fisico: due invii contemporanei dello
-- stesso audio produrrebbero due trascrizioni dello stesso parlato.
CREATE UNIQUE INDEX "session_transcription_requests_live_unique"
  ON "session_transcription_requests" ("physical_recording_id")
  WHERE "status" = 'submitted';--> statement-breakpoint

CREATE INDEX "session_transcription_requests_stale_idx"
  ON "session_transcription_requests" ("status", "submitted_at");--> statement-breakpoint

-- `awaiting_provider`: il job ha consegnato il lavoro e attende la callback.
-- Non è né in coda né in esecuzione, e nessun worker deve riprenderlo.
ALTER TABLE "session_ai_processing_jobs"
  DROP CONSTRAINT IF EXISTS "session_ai_processing_jobs_status_check";--> statement-breakpoint
ALTER TABLE "session_ai_processing_jobs"
  ADD CONSTRAINT "session_ai_processing_jobs_status_check"
  CHECK ("status" IN ('queued', 'processing', 'awaiting_provider',
                      'completed', 'failed', 'cancelled'));--> statement-breakpoint

-- L'unicità del job attivo deve coprire anche l'attesa del provider: un
-- segmento nuovo prodotto da una riconnessione creerebbe altrimenti un
-- secondo job orchestratore in parallelo al primo.
DROP INDEX IF EXISTS "session_ai_processing_jobs_active_operation_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "session_ai_processing_jobs_active_operation_unique"
  ON "session_ai_processing_jobs" (
    "session_ai_notes_id",
    COALESCE("participant_recording_id", 0),
    "job_type"
  ) WHERE "status" IN ('queued', 'processing', 'awaiting_provider');
