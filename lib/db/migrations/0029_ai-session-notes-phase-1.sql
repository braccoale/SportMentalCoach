-- Appunti AI della sessione - Phase 1 foundation only.
-- No audio capture, transcription or report generation is enabled here.

CREATE TABLE "user_feature_entitlements" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "feature_code" varchar(80) NOT NULL,
  "status" varchar(20) DEFAULT 'enabled' NOT NULL,
  "source" varchar(20) NOT NULL,
  "starts_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "usage_limit" integer,
  "usage_count" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "user_feature_entitlements_user_feature_unique"
    UNIQUE("user_id", "feature_code"),
  CONSTRAINT "user_feature_entitlements_status_check"
    CHECK ("status" IN ('enabled', 'disabled', 'trial', 'expired', 'suspended')),
  CONSTRAINT "user_feature_entitlements_source_check"
    CHECK ("source" IN ('admin', 'beta', 'subscription', 'addon', 'trial', 'system')),
  CONSTRAINT "user_feature_entitlements_usage_check"
    CHECK ("usage_count" >= 0 AND ("usage_limit" IS NULL OR "usage_limit" >= 0)),
  CONSTRAINT "user_feature_entitlements_window_check"
    CHECK ("expires_at" IS NULL OR "starts_at" IS NULL OR "expires_at" > "starts_at")
);--> statement-breakpoint

CREATE TABLE "session_ai_notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_id" integer NOT NULL,
  "livekit_room_name" varchar(160) NOT NULL,
  "requested_by" integer NOT NULL,
  "status" varchar(32) DEFAULT 'waiting_for_consent' NOT NULL,
  "feature_code" varchar(80) DEFAULT 'AI_SESSION_NOTES' NOT NULL,
  "consent_required" boolean DEFAULT true NOT NULL,
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "processing_started_at" timestamp with time zone,
  "processing_completed_at" timestamp with time zone,
  "error_code" varchar(80),
  "error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_ai_notes_status_check"
    CHECK ("status" IN (
      'waiting_for_consent', 'active', 'processing', 'ready_for_review',
      'approved', 'shared', 'consent_rejected', 'cancelled',
      'transcription_failed', 'report_failed'
    )),
  CONSTRAINT "session_ai_notes_feature_check"
    CHECK ("feature_code" = 'AI_SESSION_NOTES'),
  CONSTRAINT "session_ai_notes_room_matches_booking_check"
    CHECK ("livekit_room_name" = 'booking-' || "booking_id"::text)
);--> statement-breakpoint

CREATE TABLE "session_ai_consents" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_ai_notes_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "participant_role" varchar(24) NOT NULL,
  "consent_status" varchar(20) DEFAULT 'pending' NOT NULL,
  "consent_version" varchar(32) NOT NULL,
  "consent_text_hash" varchar(64) NOT NULL,
  "consented_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "ip_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "user_agent_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_ai_consents_session_user_unique"
    UNIQUE("session_ai_notes_id", "user_id"),
  CONSTRAINT "session_ai_consents_role_check"
    CHECK ("participant_role" IN ('coach', 'athlete')),
  CONSTRAINT "session_ai_consents_status_check"
    CHECK ("consent_status" IN ('pending', 'accepted', 'rejected', 'revoked'))
);--> statement-breakpoint

CREATE TABLE "session_transcript_segments" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_ai_notes_id" integer NOT NULL,
  "participant_user_id" integer,
  "speaker_role" varchar(24) NOT NULL,
  "sequence_number" integer NOT NULL,
  "started_at_ms" integer NOT NULL,
  "ended_at_ms" integer NOT NULL,
  "text" text NOT NULL,
  "is_final" boolean DEFAULT false NOT NULL,
  "confidence" real,
  "provider" varchar(80),
  "provider_segment_id" varchar(160),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_transcript_segments_session_sequence_unique"
    UNIQUE("session_ai_notes_id", "sequence_number"),
  CONSTRAINT "session_transcript_segments_provider_segment_unique"
    UNIQUE("session_ai_notes_id", "provider", "provider_segment_id"),
  CONSTRAINT "session_transcript_segments_timing_check"
    CHECK (
      "sequence_number" >= 0
      AND "started_at_ms" >= 0
      AND "ended_at_ms" >= "started_at_ms"
    ),
  CONSTRAINT "session_transcript_segments_confidence_check"
    CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1))
);--> statement-breakpoint

CREATE TABLE "session_ai_reports" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_ai_notes_id" integer NOT NULL UNIQUE,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "report_version" integer DEFAULT 1 NOT NULL,
  "generated_report_json" jsonb,
  "coach_edited_report_json" jsonb,
  "shared_report_json" jsonb,
  "private_coach_notes" text,
  "generated_by_provider" varchar(80),
  "generated_by_model" varchar(120),
  "prompt_version" varchar(40),
  "approved_by" integer,
  "approved_at" timestamp with time zone,
  "shared_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_ai_reports_status_check"
    CHECK ("status" IN ('pending', 'generating', 'ready_for_review', 'approved', 'shared', 'failed')),
  CONSTRAINT "session_ai_reports_version_check"
    CHECK ("report_version" >= 1)
);--> statement-breakpoint

CREATE TABLE "session_ai_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_ai_notes_id" integer,
  "event_type" varchar(40) NOT NULL,
  "actor_user_id" integer,
  "previous_status" varchar(32),
  "new_status" varchar(32),
  "event_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer,
  CONSTRAINT "session_ai_audit_events_type_check"
    CHECK ("event_type" IN (
      'feature_requested', 'consent_accepted', 'consent_rejected',
      'consent_revoked', 'session_activated', 'session_cancelled',
      'entitlement_denied', 'entitlement_granted',
      'entitlement_trial_started', 'entitlement_revoked',
      'status_transitioned'
    ))
);--> statement-breakpoint

ALTER TABLE "user_feature_entitlements"
  ADD CONSTRAINT "user_feature_entitlements_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feature_entitlements"
  ADD CONSTRAINT "user_feature_entitlements_createdby_users_id_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feature_entitlements"
  ADD CONSTRAINT "user_feature_entitlements_updatedby_users_id_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "session_ai_notes"
  ADD CONSTRAINT "session_ai_notes_booking_id_bookings_id_fk"
  FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_notes"
  ADD CONSTRAINT "session_ai_notes_requested_by_users_id_fk"
  FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_notes"
  ADD CONSTRAINT "session_ai_notes_createdby_users_id_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_notes"
  ADD CONSTRAINT "session_ai_notes_updatedby_users_id_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "session_ai_consents"
  ADD CONSTRAINT "session_ai_consents_session_id_session_ai_notes_id_fk"
  FOREIGN KEY ("session_ai_notes_id") REFERENCES "public"."session_ai_notes"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_consents"
  ADD CONSTRAINT "session_ai_consents_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_consents"
  ADD CONSTRAINT "session_ai_consents_createdby_users_id_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_consents"
  ADD CONSTRAINT "session_ai_consents_updatedby_users_id_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "session_transcript_segments"
  ADD CONSTRAINT "session_transcript_segments_session_id_session_ai_notes_id_fk"
  FOREIGN KEY ("session_ai_notes_id") REFERENCES "public"."session_ai_notes"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcript_segments"
  ADD CONSTRAINT "session_transcript_segments_participant_user_id_users_id_fk"
  FOREIGN KEY ("participant_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcript_segments"
  ADD CONSTRAINT "session_transcript_segments_createdby_users_id_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_transcript_segments"
  ADD CONSTRAINT "session_transcript_segments_updatedby_users_id_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "session_ai_reports"
  ADD CONSTRAINT "session_ai_reports_session_id_session_ai_notes_id_fk"
  FOREIGN KEY ("session_ai_notes_id") REFERENCES "public"."session_ai_notes"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_reports"
  ADD CONSTRAINT "session_ai_reports_approved_by_users_id_fk"
  FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_reports"
  ADD CONSTRAINT "session_ai_reports_createdby_users_id_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_reports"
  ADD CONSTRAINT "session_ai_reports_updatedby_users_id_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "session_ai_audit_events"
  ADD CONSTRAINT "session_ai_audit_events_session_id_session_ai_notes_id_fk"
  FOREIGN KEY ("session_ai_notes_id") REFERENCES "public"."session_ai_notes"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_audit_events"
  ADD CONSTRAINT "session_ai_audit_events_actor_user_id_users_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_audit_events"
  ADD CONSTRAINT "session_ai_audit_events_createdby_users_id_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_audit_events"
  ADD CONSTRAINT "session_ai_audit_events_updatedby_users_id_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "user_feature_entitlements_feature_status_idx"
  ON "user_feature_entitlements" ("feature_code", "status");--> statement-breakpoint
CREATE UNIQUE INDEX "session_ai_notes_one_open_per_booking_idx"
  ON "session_ai_notes" ("booking_id")
  WHERE "status" IN (
    'waiting_for_consent', 'active', 'processing', 'ready_for_review', 'approved'
  );--> statement-breakpoint
CREATE INDEX "session_ai_notes_booking_created_idx"
  ON "session_ai_notes" ("booking_id", "createddate");--> statement-breakpoint
CREATE INDEX "session_ai_consents_user_status_idx"
  ON "session_ai_consents" ("user_id", "consent_status");--> statement-breakpoint
CREATE INDEX "session_transcript_segments_session_sequence_idx"
  ON "session_transcript_segments" ("session_ai_notes_id", "sequence_number");--> statement-breakpoint
CREATE INDEX "session_ai_audit_events_session_created_idx"
  ON "session_ai_audit_events" ("session_ai_notes_id", "createddate");--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."set_updateddate"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updateddate = now();
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "trg_set_updateddate"
  BEFORE UPDATE ON "user_feature_entitlements"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updateddate"();--> statement-breakpoint
CREATE TRIGGER "trg_set_updateddate"
  BEFORE UPDATE ON "session_ai_notes"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updateddate"();--> statement-breakpoint
CREATE TRIGGER "trg_set_updateddate"
  BEFORE UPDATE ON "session_ai_consents"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updateddate"();--> statement-breakpoint
CREATE TRIGGER "trg_set_updateddate"
  BEFORE UPDATE ON "session_transcript_segments"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updateddate"();--> statement-breakpoint
CREATE TRIGGER "trg_set_updateddate"
  BEFORE UPDATE ON "session_ai_reports"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updateddate"();--> statement-breakpoint
CREATE TRIGGER "trg_set_updateddate"
  BEFORE UPDATE ON "session_ai_audit_events"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updateddate"();--> statement-breakpoint

COMMENT ON COLUMN "session_ai_consents"."ip_metadata" IS
  'Privacy-minimised evidence only. Full IP addresses must not be stored.';
COMMENT ON COLUMN "session_ai_reports"."private_coach_notes" IS
  'Coach-only content. Never include in athlete or shared projections.';
COMMENT ON TABLE "session_transcript_segments" IS
  'Phase 1 schema only. Direct client inserts are forbidden.';

-- RLS identity helpers use the existing Supabase Auth -> public.users link.
CREATE OR REPLACE FUNCTION "public"."current_app_user_id"()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.users
  WHERE auth_id = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."current_app_user_is_admin"()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = public.current_app_user_id()
      AND ur.role_key = 'admin'
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."current_app_user_id"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."current_app_user_is_admin"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."current_app_user_id"() TO authenticated;
GRANT EXECUTE ON FUNCTION "public"."current_app_user_is_admin"() TO authenticated;--> statement-breakpoint

ALTER TABLE "user_feature_entitlements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_ai_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_ai_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_transcript_segments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_ai_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session_ai_audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "entitlements_select_own_or_admin"
  ON "user_feature_entitlements"
  FOR SELECT TO authenticated
  USING (
    "user_id" = public.current_app_user_id()
    OR public.current_app_user_is_admin()
  );--> statement-breakpoint

CREATE POLICY "ai_notes_select_participant_or_admin"
  ON "session_ai_notes"
  FOR SELECT TO authenticated
  USING (
    public.current_app_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.provider_profiles pp ON pp.id = b.provider_id
      WHERE b.id = "session_ai_notes"."booking_id"
        AND public.current_app_user_id() IN (b.client_id, pp.user_id)
    )
  );--> statement-breakpoint

CREATE POLICY "ai_consents_select_own_or_admin"
  ON "session_ai_consents"
  FOR SELECT TO authenticated
  USING (
    public.current_app_user_is_admin()
    OR "user_id" = public.current_app_user_id()
  );--> statement-breakpoint

-- A report row contains private coach notes, so athletes get no direct table
-- access even after sharing. Future athlete reads must project shared JSON.
CREATE POLICY "ai_reports_select_coach_or_admin"
  ON "session_ai_reports"
  FOR SELECT TO authenticated
  USING (
    public.current_app_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.session_ai_notes san
      JOIN public.bookings b ON b.id = san.booking_id
      JOIN public.provider_profiles pp ON pp.id = b.provider_id
      WHERE san.id = "session_ai_reports"."session_ai_notes_id"
        AND pp.user_id = public.current_app_user_id()
    )
  );--> statement-breakpoint

GRANT SELECT ON "user_feature_entitlements" TO authenticated;
GRANT SELECT ON "session_ai_notes" TO authenticated;
GRANT SELECT ON "session_ai_consents" TO authenticated;
GRANT SELECT ON "session_ai_reports" TO authenticated;

-- The backend/service credential is the only non-owner role allowed to
-- populate future transcripts, reports and audit rows. It bypasses RLS by
-- design; browser roles never receive these grants.
GRANT ALL ON "user_feature_entitlements" TO service_role;
GRANT ALL ON "session_ai_notes" TO service_role;
GRANT ALL ON "session_ai_consents" TO service_role;
GRANT ALL ON "session_transcript_segments" TO service_role;
GRANT ALL ON "session_ai_reports" TO service_role;
GRANT ALL ON "session_ai_audit_events" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "user_feature_entitlements_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "session_ai_notes_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "session_ai_consents_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "session_transcript_segments_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "session_ai_reports_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "session_ai_audit_events_id_seq" TO service_role;

REVOKE INSERT, UPDATE, DELETE ON "user_feature_entitlements" FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON "session_ai_notes" FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON "session_ai_consents" FROM anon, authenticated;
REVOKE ALL ON "session_transcript_segments" FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON "session_ai_reports" FROM anon, authenticated;
REVOKE ALL ON "session_ai_audit_events" FROM anon, authenticated;

-- Manual rollback (Drizzle in this repository has no down-migration runner):
-- DROP TABLE in this order: session_ai_audit_events, session_ai_reports,
-- session_transcript_segments, session_ai_consents, session_ai_notes,
-- user_feature_entitlements; then drop current_app_user_id(),
-- current_app_user_is_admin() and set_updateddate().
