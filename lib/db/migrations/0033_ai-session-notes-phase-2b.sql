-- AI Session Notes - Phase 2B: logical participant recordings and a
-- provider-neutral asynchronous processing ledger. No AI/STT provider is
-- configured or called by this migration.

CREATE TABLE "session_participant_recordings" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_ai_notes_id" integer NOT NULL,
  "participant_user_id" integer NOT NULL,
  "participant_role" varchar(24) NOT NULL,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "aggregate_started_at" timestamp with time zone,
  "aggregate_ended_at" timestamp with time zone,
  "aggregate_duration_seconds" integer DEFAULT 0 NOT NULL,
  "segment_count" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_participant_recordings_session_user_unique"
    UNIQUE("session_ai_notes_id", "participant_user_id"),
  CONSTRAINT "session_participant_recordings_role_check"
    CHECK ("participant_role" IN ('coach', 'athlete')),
  CONSTRAINT "session_participant_recordings_status_check"
    CHECK ("status" IN ('pending', 'recording', 'recorded', 'failed', 'deleted')),
  CONSTRAINT "session_participant_recordings_aggregate_check"
    CHECK ("aggregate_duration_seconds" >= 0 AND "segment_count" >= 0)
);--> statement-breakpoint

ALTER TABLE "session_audio_recordings"
  ADD COLUMN "participant_recording_id" integer;--> statement-breakpoint
ALTER TABLE "session_audio_recordings"
  ADD COLUMN "segment_order" integer;--> statement-breakpoint

ALTER TABLE "session_transcript_segments"
  ADD COLUMN "participant_recording_id" integer;--> statement-breakpoint
ALTER TABLE "session_transcript_segments"
  ADD COLUMN "physical_recording_id" integer;--> statement-breakpoint
ALTER TABLE "session_transcript_segments"
  ADD COLUMN "normalization_status" varchar(24) DEFAULT 'pending' NOT NULL;--> statement-breakpoint

CREATE TABLE "session_ai_processing_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_ai_notes_id" integer NOT NULL,
  "participant_recording_id" integer,
  "job_type" varchar(40) NOT NULL,
  "status" varchar(24) DEFAULT 'queued' NOT NULL,
  "provider" varchar(80) DEFAULT 'disabled' NOT NULL,
  "provider_operation_id" varchar(200),
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "available_after" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "locked_at" timestamp with time zone,
  "locked_by" varchar(160),
  "error_code" varchar(80),
  "error_message_sanitized" varchar(500),
  "idempotency_key" varchar(200) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_ai_processing_jobs_idempotency_key_unique"
    UNIQUE("idempotency_key"),
  CONSTRAINT "session_ai_processing_jobs_type_check"
    CHECK ("job_type" IN ('transcription', 'transcript_normalization', 'report_generation')),
  CONSTRAINT "session_ai_processing_jobs_status_check"
    CHECK ("status" IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  CONSTRAINT "session_ai_processing_jobs_attempts_check"
    CHECK ("attempt_count" >= 0 AND "max_attempts" > 0 AND "attempt_count" <= "max_attempts")
);--> statement-breakpoint

ALTER TABLE "session_participant_recordings"
  ADD CONSTRAINT "session_participant_recordings_session_fk"
  FOREIGN KEY ("session_ai_notes_id") REFERENCES "public"."session_ai_notes"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participant_recordings"
  ADD CONSTRAINT "session_participant_recordings_user_fk"
  FOREIGN KEY ("participant_user_id") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participant_recordings"
  ADD CONSTRAINT "session_participant_recordings_createdby_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participant_recordings"
  ADD CONSTRAINT "session_participant_recordings_updatedby_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_audio_recordings"
  ADD CONSTRAINT "session_audio_recordings_participant_recording_fk"
  FOREIGN KEY ("participant_recording_id") REFERENCES "public"."session_participant_recordings"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcript_segments"
  ADD CONSTRAINT "session_transcript_segments_participant_recording_fk"
  FOREIGN KEY ("participant_recording_id") REFERENCES "public"."session_participant_recordings"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcript_segments"
  ADD CONSTRAINT "session_transcript_segments_physical_recording_fk"
  FOREIGN KEY ("physical_recording_id") REFERENCES "public"."session_audio_recordings"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_processing_jobs"
  ADD CONSTRAINT "session_ai_processing_jobs_session_fk"
  FOREIGN KEY ("session_ai_notes_id") REFERENCES "public"."session_ai_notes"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_processing_jobs"
  ADD CONSTRAINT "session_ai_processing_jobs_participant_recording_fk"
  FOREIGN KEY ("participant_recording_id") REFERENCES "public"."session_participant_recordings"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_processing_jobs"
  ADD CONSTRAINT "session_ai_processing_jobs_createdby_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_processing_jobs"
  ADD CONSTRAINT "session_ai_processing_jobs_updatedby_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "session_participant_recordings_session_status_idx"
  ON "session_participant_recordings" ("session_ai_notes_id", "status");--> statement-breakpoint
CREATE UNIQUE INDEX "session_audio_recordings_participant_segment_order_unique"
  ON "session_audio_recordings" ("participant_recording_id", "segment_order");--> statement-breakpoint
CREATE INDEX "session_transcript_segments_participant_physical_idx"
  ON "session_transcript_segments" ("participant_recording_id", "physical_recording_id", "sequence_number");--> statement-breakpoint
CREATE INDEX "session_ai_processing_jobs_claim_idx"
  ON "session_ai_processing_jobs" ("status", "available_after", "id");--> statement-breakpoint
CREATE INDEX "session_ai_processing_jobs_session_status_idx"
  ON "session_ai_processing_jobs" ("session_ai_notes_id", "status");--> statement-breakpoint
CREATE INDEX "session_ai_processing_jobs_participant_type_idx"
  ON "session_ai_processing_jobs" ("participant_recording_id", "job_type");--> statement-breakpoint
CREATE UNIQUE INDEX "session_ai_processing_jobs_active_operation_unique"
  ON "session_ai_processing_jobs" (
    "session_ai_notes_id",
    COALESCE("participant_recording_id", 0),
    "job_type"
  ) WHERE "status" IN ('queued', 'processing');--> statement-breakpoint

-- Backfill physical Track Egress rows into exactly one logical record per
-- session/user and preserve deterministic chronological segment order.
INSERT INTO "session_participant_recordings" (
  "session_ai_notes_id", "participant_user_id", "participant_role", "status",
  "aggregate_started_at", "aggregate_ended_at", "aggregate_duration_seconds",
  "segment_count", "createddate", "createdby", "updateddate", "updatedby"
)
SELECT
  r."session_ai_notes_id",
  r."participant_user_id",
  MIN(r."participant_role"),
  CASE
    WHEN BOOL_OR(r."status" IN ('pending', 'starting', 'recording', 'stopping')) THEN 'recording'
    WHEN BOOL_OR(r."status" IN ('failed', 'deletion_failed')) THEN 'failed'
    WHEN BOOL_AND(r."status" = 'deleted') THEN 'deleted'
    ELSE 'recorded'
  END,
  MIN(r."started_at"),
  MAX(r."ended_at"),
  COALESCE(SUM(r."duration_seconds"), 0),
  COUNT(*)::integer,
  MIN(r."createddate"),
  MIN(r."createdby"),
  MAX(r."updateddate"),
  MIN(r."updatedby")
FROM "session_audio_recordings" r
GROUP BY r."session_ai_notes_id", r."participant_user_id";--> statement-breakpoint

WITH ranked AS (
  SELECT
    r."id",
    p."id" AS participant_recording_id,
    ROW_NUMBER() OVER (
      PARTITION BY r."session_ai_notes_id", r."participant_user_id"
      ORDER BY COALESCE(r."started_at", r."createddate"), r."id"
    ) - 1 AS segment_order
  FROM "session_audio_recordings" r
  JOIN "session_participant_recordings" p
    ON p."session_ai_notes_id" = r."session_ai_notes_id"
   AND p."participant_user_id" = r."participant_user_id"
)
UPDATE "session_audio_recordings" r
SET
  "participant_recording_id" = ranked.participant_recording_id,
  "segment_order" = ranked.segment_order
FROM ranked
WHERE ranked.id = r.id;--> statement-breakpoint

ALTER TABLE "session_audio_recordings"
  ADD CONSTRAINT "session_audio_recordings_segment_order_check"
  CHECK ("segment_order" IS NULL OR "segment_order" >= 0);--> statement-breakpoint
ALTER TABLE "session_transcript_segments"
  ADD CONSTRAINT "session_transcript_segments_normalization_status_check"
  CHECK ("normalization_status" IN ('pending', 'normalized', 'failed'));--> statement-breakpoint

-- New physical rows receive their logical group and sequence inside the same
-- transaction. The advisory lock serializes concurrent device/reconnect rows.
CREATE OR REPLACE FUNCTION "public"."attach_audio_segment_to_participant_recording"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  logical_id integer;
  existing_role varchar(24);
BEGIN
  PERFORM pg_advisory_xact_lock(NEW.session_ai_notes_id, NEW.participant_user_id);

  INSERT INTO public.session_participant_recordings (
    session_ai_notes_id, participant_user_id, participant_role,
    createdby, updatedby
  ) VALUES (
    NEW.session_ai_notes_id, NEW.participant_user_id, NEW.participant_role,
    NEW.createdby, NEW.updatedby
  ) ON CONFLICT (session_ai_notes_id, participant_user_id) DO NOTHING
  RETURNING id INTO logical_id;

  IF logical_id IS NULL THEN
    SELECT id, participant_role
    INTO logical_id, existing_role
    FROM public.session_participant_recordings
    WHERE session_ai_notes_id = NEW.session_ai_notes_id
      AND participant_user_id = NEW.participant_user_id;
    IF existing_role <> NEW.participant_role THEN
      RAISE EXCEPTION 'participant recording role mismatch';
    END IF;
  END IF;

  NEW.participant_recording_id := logical_id;
  SELECT COALESCE(MAX(segment_order), -1) + 1
  INTO NEW.segment_order
  FROM public.session_audio_recordings
  WHERE participant_recording_id = logical_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."refresh_participant_recording_aggregate"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  logical_id integer := NEW.participant_recording_id;
BEGIN
  IF logical_id IS NULL THEN RETURN NEW; END IF;
  UPDATE public.session_participant_recordings p
  SET
    status = source.status,
    aggregate_started_at = source.aggregate_started_at,
    aggregate_ended_at = source.aggregate_ended_at,
    aggregate_duration_seconds = source.aggregate_duration_seconds,
    segment_count = source.segment_count,
    updateddate = now()
  FROM (
    SELECT
      participant_recording_id,
      CASE
        WHEN BOOL_OR(status IN ('pending', 'starting', 'recording', 'stopping')) THEN 'recording'
        WHEN BOOL_OR(status IN ('failed', 'deletion_failed')) THEN 'failed'
        WHEN BOOL_AND(status = 'deleted') THEN 'deleted'
        ELSE 'recorded'
      END AS status,
      MIN(started_at) AS aggregate_started_at,
      MAX(ended_at) AS aggregate_ended_at,
      COALESCE(SUM(duration_seconds), 0)::integer AS aggregate_duration_seconds,
      COUNT(*)::integer AS segment_count
    FROM public.session_audio_recordings
    WHERE participant_recording_id = logical_id
    GROUP BY participant_recording_id
  ) source
  WHERE p.id = source.participant_recording_id;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "trg_attach_audio_segment_to_participant_recording"
  BEFORE INSERT ON "session_audio_recordings"
  FOR EACH ROW EXECUTE FUNCTION "public"."attach_audio_segment_to_participant_recording"();--> statement-breakpoint
CREATE TRIGGER "trg_refresh_participant_recording_aggregate"
  AFTER INSERT OR UPDATE OF "status", "started_at", "ended_at", "duration_seconds", "participant_recording_id"
  ON "session_audio_recordings"
  FOR EACH ROW EXECUTE FUNCTION "public"."refresh_participant_recording_aggregate"();--> statement-breakpoint

CREATE TRIGGER "trg_set_updateddate"
  BEFORE UPDATE ON "session_participant_recordings"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updateddate"();--> statement-breakpoint
CREATE TRIGGER "trg_set_updateddate"
  BEFORE UPDATE ON "session_ai_processing_jobs"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updateddate"();--> statement-breakpoint

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
    'processing_job_cancelled', 'processing_job_recovered'
  ));--> statement-breakpoint

ALTER TABLE "session_participant_recordings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_ai_processing_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

REVOKE ALL ON "session_participant_recordings" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON "session_ai_processing_jobs" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "session_participant_recordings_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "session_ai_processing_jobs_id_seq" FROM PUBLIC, anon, authenticated;--> statement-breakpoint

GRANT ALL ON "session_participant_recordings" TO service_role;
GRANT ALL ON "session_ai_processing_jobs" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "session_participant_recordings_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "session_ai_processing_jobs_id_seq" TO service_role;--> statement-breakpoint

COMMENT ON TABLE "session_participant_recordings" IS
  'Logical grouping of physical Track Egress segments. Audio is not merged in Phase 2B.';
COMMENT ON TABLE "session_ai_processing_jobs" IS
  'Server-only provider-neutral async processing ledger. No provider credentials or transcript content.';

-- Manual rollback (isolated environment only): drop processing jobs, the two
-- trigger functions/triggers, participant recordings, and Phase 2B columns.
