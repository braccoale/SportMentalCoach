CREATE TABLE "academy_session_recordings" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"course_id" integer NOT NULL,
	"status" varchar(24) DEFAULT 'waiting_for_consent' NOT NULL,
	"room_name" varchar(160) NOT NULL,
	"egress_id" varchar(120),
	"audio_object_key" text,
	"consent_given_by" integer,
	"consent_given_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"stt_callback_token" varchar(64),
	"transcription_submitted_at" timestamp with time zone,
	"processing_completed_at" timestamp with time zone,
	"error_code" varchar(80),
	"error_message" text,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "academy_session_recordings_session_unique" UNIQUE("session_id"),
	CONSTRAINT "academy_session_recordings_status_check" CHECK ("academy_session_recordings"."status" in ('waiting_for_consent', 'recording', 'processing', 'ready', 'failed', 'consent_rejected', 'cancelled')),
	CONSTRAINT "academy_session_recordings_room_matches_session_check" CHECK ("academy_session_recordings"."room_name" = 'academy-session-' || "academy_session_recordings"."session_id"::text)
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" DROP CONSTRAINT "admin_audit_events_action_check";--> statement-breakpoint
ALTER TABLE "academy_session_recordings" ADD CONSTRAINT "academy_session_recordings_session_id_academy_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academy_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_recordings" ADD CONSTRAINT "academy_session_recordings_consent_given_by_users_id_fk" FOREIGN KEY ("consent_given_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_recordings" ADD CONSTRAINT "academy_session_recordings_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_recordings" ADD CONSTRAINT "academy_session_recordings_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_recordings" ADD CONSTRAINT "academy_session_recordings_session_course_fk" FOREIGN KEY ("session_id","course_id") REFERENCES "public"."academy_sessions"("id","course_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_action_check" CHECK ("admin_audit_events"."action" in ('coach_approved', 'coach_rejected', 'coach_verification_changed', 'user_role_changed', 'ai_notes_entitlement_granted', 'ai_notes_entitlement_revoked', 'ai_notes_session_reopened', 'ai_notes_worker_run', 'ai_notes_guidelines_saved', 'ai_notes_callback_probed', 'sensitive_content_accessed', 'data_exported', 'data_deleted', 'configuration_changed', 'package_created', 'package_features_updated', 'user_package_assigned', 'user_package_revoked', 'academy_course_created', 'academy_course_status_changed', 'academy_course_edition_created', 'academy_module_saved', 'academy_instructor_nominated', 'academy_instructor_removed', 'academy_course_assigned', 'academy_course_assignment_removed', 'academy_session_created', 'academy_session_cancelled', 'academy_session_completed', 'academy_recap_generated', 'academy_recap_edited', 'academy_recording_consent_given', 'academy_recording_consent_declined', 'academy_material_uploaded', 'academy_material_published', 'academy_module_completed', 'academy_module_completion_corrected'));