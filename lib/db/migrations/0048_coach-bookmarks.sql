-- Segnalibri del coach durante la sessione.
--
-- Un tocco che marca l'istante: «questo momento riguardalo». Nessun testo da
-- scrivere, perché un coach che scrive durante una seduta smette di guardare
-- l'atleta — ed è esattamente il motivo per cui esistono gli Appunti AI.
--
-- La posizione è in millisecondi dall'inizio della sessione, non un orario
-- assoluto: è ciò che permette di allinearla alla mappa della conversazione e
-- alla trascrizione, che ragionano nella stessa unità.
CREATE TABLE "session_coach_bookmarks" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_ai_notes_id" integer NOT NULL,
  "at_ms" integer NOT NULL,
  "note" varchar(280),
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_coach_bookmarks_at_ms_check" CHECK ("at_ms" >= 0)
);--> statement-breakpoint

ALTER TABLE "session_coach_bookmarks"
  ADD CONSTRAINT "session_coach_bookmarks_session_fk"
  FOREIGN KEY ("session_ai_notes_id")
  REFERENCES "public"."session_ai_notes"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_coach_bookmarks"
  ADD CONSTRAINT "session_coach_bookmarks_createdby_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_coach_bookmarks"
  ADD CONSTRAINT "session_coach_bookmarks_updatedby_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "session_coach_bookmarks_session_idx"
  ON "session_coach_bookmarks" ("session_ai_notes_id", "at_ms");
