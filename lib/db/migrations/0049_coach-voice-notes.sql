-- Note vocali del coach.
--
-- Dopo una seduta da telefono scrivere e' scomodo, parlare no: il coach dice
-- in trenta secondi quello che non scriverebbe mai.
--
-- Il ciclo di trascrizione e' qui dentro e non nella tabella delle richieste
-- audio: quella lega ogni riga a un segmento di registrazione, e una nota
-- vocale non e' un segmento di sessione. Tenerlo separato evita di rendere
-- polimorfa una tabella che oggi ha un solo significato.
CREATE TABLE "session_coach_voice_notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_ai_notes_id" integer NOT NULL,
  "storage_bucket" varchar(100) NOT NULL,
  "storage_object_key" varchar(500) NOT NULL,
  "duration_ms" integer,
  "size_bytes" integer,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "transcript" text,
  "callback_token" varchar(64),
  "provider_request_id" varchar(200),
  "error_code" varchar(80),
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_coach_voice_notes_token_unique" UNIQUE ("callback_token"),
  CONSTRAINT "session_coach_voice_notes_status_check"
    CHECK ("status" IN ('pending', 'transcribing', 'ready', 'failed'))
);--> statement-breakpoint

ALTER TABLE "session_coach_voice_notes"
  ADD CONSTRAINT "session_coach_voice_notes_session_fk"
  FOREIGN KEY ("session_ai_notes_id")
  REFERENCES "public"."session_ai_notes"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_coach_voice_notes"
  ADD CONSTRAINT "session_coach_voice_notes_createdby_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_coach_voice_notes"
  ADD CONSTRAINT "session_coach_voice_notes_updatedby_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "session_coach_voice_notes_session_idx"
  ON "session_coach_voice_notes" ("session_ai_notes_id", "createddate");
