-- AI Session Notes - Phase 2A: private, per-microphone Track Egress.
-- This migration adds recording state only. It does not add STT, LLM, reports,
-- video recording, composite recording, or browser media access.

CREATE TABLE "session_audio_recordings" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_ai_notes_id" integer NOT NULL,
  "booking_id" integer NOT NULL,
  "participant_user_id" integer NOT NULL,
  "participant_role" varchar(24) NOT NULL,
  "livekit_room_name" varchar(160) NOT NULL,
  "livekit_participant_identity" varchar(160) NOT NULL,
  "livekit_track_sid" varchar(160) NOT NULL,
  "livekit_egress_id" varchar(160),
  "provider" varchar(40) DEFAULT 'livekit' NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "storage_provider" varchar(40) DEFAULT 'supabase_s3' NOT NULL,
  "storage_bucket" varchar(100) NOT NULL,
  "storage_object_key" varchar(500) NOT NULL,
  "mime_type" varchar(100) DEFAULT 'audio/ogg' NOT NULL,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "duration_seconds" integer,
  "size_bytes" integer,
  "checksum" varchar(160),
  "error_code" varchar(80),
  "error_message_sanitized" varchar(500),
  "retention_until" timestamp with time zone NOT NULL,
  "deleted_at" timestamp with time zone,
  "last_webhook_event_id" varchar(160),
  "last_reconciled_at" timestamp with time zone,
  "deletion_attempts" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_audio_recordings_livekit_egress_id_unique"
    UNIQUE("livekit_egress_id"),
  CONSTRAINT "session_audio_recordings_session_track_unique"
    UNIQUE("session_ai_notes_id", "livekit_track_sid"),
  CONSTRAINT "session_audio_recordings_storage_object_unique"
    UNIQUE("storage_bucket", "storage_object_key"),
  CONSTRAINT "session_audio_recordings_role_check"
    CHECK ("participant_role" IN ('coach', 'athlete')),
  CONSTRAINT "session_audio_recordings_status_check"
    CHECK ("status" IN (
      'pending', 'starting', 'recording', 'stopping', 'recorded', 'failed',
      'deletion_pending', 'deleted', 'deletion_failed'
    )),
  CONSTRAINT "session_audio_recordings_provider_check"
    CHECK ("provider" = 'livekit' AND "storage_provider" = 'supabase_s3'),
  CONSTRAINT "session_audio_recordings_mime_check"
    CHECK ("mime_type" = 'audio/ogg'),
  CONSTRAINT "session_audio_recordings_size_duration_check"
    CHECK (
      ("duration_seconds" IS NULL OR "duration_seconds" >= 0)
      AND ("size_bytes" IS NULL OR "size_bytes" >= 0)
      AND "deletion_attempts" >= 0
    ),
  CONSTRAINT "session_audio_recordings_room_booking_check"
    CHECK ("livekit_room_name" = 'booking-' || "booking_id"::text),
  CONSTRAINT "session_audio_recordings_identity_user_check"
    CHECK (
      "livekit_participant_identity" =
      'user-' || "participant_user_id"::text
    )
);--> statement-breakpoint

CREATE TABLE "livekit_webhook_receipts" (
  "event_id" varchar(160) PRIMARY KEY NOT NULL,
  "event_type" varchar(80) NOT NULL,
  "room_name" varchar(160),
  "event_created_at" timestamp with time zone NOT NULL,
  "payload_digest" varchar(64) NOT NULL,
  "status" varchar(20) DEFAULT 'processing' NOT NULL,
  "processed_at" timestamp with time zone,
  "error_code" varchar(80),
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "livekit_webhook_receipts_status_check"
    CHECK ("status" IN ('processing', 'processed', 'failed')),
  CONSTRAINT "livekit_webhook_receipts_digest_check"
    CHECK (length("payload_digest") = 64)
);--> statement-breakpoint

ALTER TABLE "session_audio_recordings"
  ADD CONSTRAINT "session_audio_recordings_session_ai_notes_id_fk"
  FOREIGN KEY ("session_ai_notes_id") REFERENCES "public"."session_ai_notes"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_audio_recordings"
  ADD CONSTRAINT "session_audio_recordings_booking_id_fk"
  FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_audio_recordings"
  ADD CONSTRAINT "session_audio_recordings_participant_user_id_fk"
  FOREIGN KEY ("participant_user_id") REFERENCES "public"."users"("id")
  ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_audio_recordings"
  ADD CONSTRAINT "session_audio_recordings_createdby_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_audio_recordings"
  ADD CONSTRAINT "session_audio_recordings_updatedby_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livekit_webhook_receipts"
  ADD CONSTRAINT "livekit_webhook_receipts_createdby_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livekit_webhook_receipts"
  ADD CONSTRAINT "livekit_webhook_receipts_updatedby_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "session_audio_recordings_session_status_idx"
  ON "session_audio_recordings" ("session_ai_notes_id", "status");--> statement-breakpoint
CREATE INDEX "session_audio_recordings_retention_status_idx"
  ON "session_audio_recordings" ("retention_until", "status");--> statement-breakpoint
CREATE INDEX "livekit_webhook_receipts_created_status_idx"
  ON "livekit_webhook_receipts" ("event_created_at", "status");--> statement-breakpoint

CREATE TRIGGER "trg_set_updateddate"
  BEFORE UPDATE ON "session_audio_recordings"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updateddate"();--> statement-breakpoint
CREATE TRIGGER "trg_set_updateddate"
  BEFORE UPDATE ON "livekit_webhook_receipts"
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
    'unverified_participant_blocked'
  ));--> statement-breakpoint

ALTER TABLE "session_audio_recordings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "livekit_webhook_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Intentionally no browser policies and no browser grants. All reads and
-- writes go through participant-authorized server APIs using the application
-- database connection/service role.
REVOKE ALL ON "session_audio_recordings" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON "livekit_webhook_receipts" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "session_audio_recordings_id_seq"
  FROM PUBLIC, anon, authenticated;--> statement-breakpoint

GRANT ALL ON "session_audio_recordings" TO service_role;
GRANT ALL ON "livekit_webhook_receipts" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "session_audio_recordings_id_seq"
  TO service_role;--> statement-breakpoint

COMMENT ON TABLE "session_audio_recordings" IS
  'Server-only Phase 2A per-microphone Track Egress state. No browser media access.';
COMMENT ON COLUMN "session_audio_recordings"."storage_object_key" IS
  'Private non-enumerable object key; never return in participant APIs.';
COMMENT ON TABLE "livekit_webhook_receipts" IS
  'Verified webhook replay ledger. Raw webhook payloads are not stored.';

-- Manual rollback (only in an isolated environment):
-- restore the Phase 1 audit constraint, then drop livekit_webhook_receipts and
-- session_audio_recordings. Never use this rollback against recorded data.
