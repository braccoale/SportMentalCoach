-- Fase 4C: gli impegni approvati diventano entità operative.
-- Il report approvato resta immutabile: stato, scadenza e note vivono qui.
-- Coach e admin vedono tutti gli impegni della sessione; l'atleta vede solo
-- quelli di cui è owner, e nessun altro contenuto del Compass.

CREATE TABLE "session_ai_commitments" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_ai_notes_id" integer NOT NULL,
  "source_report_id" integer NOT NULL,
  "source_report_version" integer NOT NULL,
  "athlete_user_id" integer NOT NULL,
  "coach_user_id" integer NOT NULL,
  "commitment_key" varchar(64) NOT NULL,
  "title" text NOT NULL,
  "owner" varchar(16) NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "due_date" date,
  "completed_at" timestamp with time zone,
  "athlete_note" text,
  "source_transcript_segment_id" integer,
  "source_timestamp_ms" integer NOT NULL,
  "source_excerpt" text NOT NULL,
  "manually_edited" boolean DEFAULT false NOT NULL,
  "archived_at" timestamp with time zone,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_ai_commitments_session_key_unique"
    UNIQUE ("session_ai_notes_id", "commitment_key"),
  CONSTRAINT "session_ai_commitments_owner_check"
    CHECK ("owner" IN ('coach', 'athlete')),
  CONSTRAINT "session_ai_commitments_status_check"
    CHECK ("status" IN ('pending', 'in_progress', 'completed', 'skipped')),
  CONSTRAINT "session_ai_commitments_completed_check"
    CHECK (("status" = 'completed') = ("completed_at" IS NOT NULL)),
  CONSTRAINT "session_ai_commitments_timestamp_check"
    CHECK ("source_timestamp_ms" >= 0)
);--> statement-breakpoint

ALTER TABLE "session_ai_commitments"
  ADD CONSTRAINT "session_ai_commitments_session_fk"
  FOREIGN KEY ("session_ai_notes_id")
  REFERENCES "public"."session_ai_notes"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "session_ai_commitments"
  ADD CONSTRAINT "session_ai_commitments_report_fk"
  FOREIGN KEY ("source_report_id")
  REFERENCES "public"."session_ai_reports"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "session_ai_commitments"
  ADD CONSTRAINT "session_ai_commitments_athlete_fk"
  FOREIGN KEY ("athlete_user_id")
  REFERENCES "public"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "session_ai_commitments"
  ADD CONSTRAINT "session_ai_commitments_coach_fk"
  FOREIGN KEY ("coach_user_id")
  REFERENCES "public"."users"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "session_ai_commitments"
  ADD CONSTRAINT "session_ai_commitments_segment_fk"
  FOREIGN KEY ("source_transcript_segment_id")
  REFERENCES "public"."session_transcript_segments"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "session_ai_commitments"
  ADD CONSTRAINT "session_ai_commitments_createdby_fk"
  FOREIGN KEY ("createdby")
  REFERENCES "public"."users"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "session_ai_commitments"
  ADD CONSTRAINT "session_ai_commitments_updatedby_fk"
  FOREIGN KEY ("updatedby")
  REFERENCES "public"."users"("id") ON DELETE set null;--> statement-breakpoint

CREATE INDEX "session_ai_commitments_athlete_owner_idx"
  ON "session_ai_commitments" ("athlete_user_id", "owner", "status");--> statement-breakpoint
CREATE INDEX "session_ai_commitments_session_idx"
  ON "session_ai_commitments" ("session_ai_notes_id", "owner");--> statement-breakpoint

CREATE TRIGGER "trg_set_updateddate"
  BEFORE UPDATE ON "session_ai_commitments"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updateddate"();--> statement-breakpoint

COMMENT ON COLUMN "session_ai_commitments"."commitment_key" IS
  'Identità stabile derivata dall''evidenza transcript: rende idempotente la sincronizzazione fra versioni approvate del report.';--> statement-breakpoint
COMMENT ON COLUMN "session_ai_commitments"."manually_edited" IS
  'Quando true, una nuova approvazione non sovrascrive testo, owner o scadenza: la modifica umana prevale.';--> statement-breakpoint
COMMENT ON COLUMN "session_ai_commitments"."source_excerpt" IS
  'Estratto transcript di origine. Riservato a coach e admin: non viene mai proiettato nella UI atleta.';--> statement-breakpoint

ALTER TABLE "session_ai_commitments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Il coach della sessione e l'amministrazione leggono tutto; l'atleta legge
-- soltanto gli impegni di cui è owner. Gli impegni del coach restano invisibili.
CREATE POLICY "ai_commitments_select_coach_admin_or_owning_athlete"
  ON "session_ai_commitments"
  FOR SELECT
  TO authenticated
  USING (
    public.current_app_user_is_admin()
    OR public.current_app_user_coaches_ai_session("session_ai_notes_id")
    OR (
      "owner" = 'athlete'
      AND "athlete_user_id" = public.current_app_user_id()
    )
  );--> statement-breakpoint

-- Le scritture restano server-side, come per il resto della pipeline AI Notes.
REVOKE ALL ON "session_ai_commitments" FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "session_ai_commitments_id_seq"
  FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT SELECT ON "session_ai_commitments" TO authenticated;--> statement-breakpoint
GRANT ALL ON "session_ai_commitments" TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "session_ai_commitments_id_seq" TO service_role;--> statement-breakpoint

ALTER TABLE "session_ai_audit_events"
  DROP CONSTRAINT "session_ai_audit_events_type_check";--> statement-breakpoint
ALTER TABLE "session_ai_audit_events"
  ADD CONSTRAINT "session_ai_audit_events_type_check"
  CHECK ("event_type" IN (
    'feature_requested', 'consent_accepted', 'consent_rejected',
    'consent_revoked', 'session_activated', 'session_cancelled',
    'entitlement_denied', 'entitlement_granted',
    'entitlement_trial_started', 'entitlement_revoked',
    'status_transitioned', 'recording_start_requested',
    'recording_started', 'recording_stop_requested', 'recording_recorded',
    'recording_failed', 'recording_deletion_requested', 'recording_deleted',
    'recording_deletion_failed', 'recording_reconciled',
    'unverified_participant_blocked', 'participant_recording_grouped',
    'processing_job_queued', 'processing_job_claimed',
    'processing_job_completed', 'processing_job_failed',
    'processing_job_cancelled', 'processing_job_recovered',
    'compass_report_generated', 'compass_report_regenerated',
    'compass_report_approved', 'compass_report_failed',
    'compass_note_updated', 'compass_commitment_updated',
    'commitment_synced', 'commitment_archived',
    'commitment_updated_by_coach', 'commitment_updated_by_athlete'
  ));
