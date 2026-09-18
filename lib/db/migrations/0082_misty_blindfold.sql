CREATE TABLE "academy_session_confidence_ratings" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"course_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"timing" varchar(10) NOT NULL,
	"rating" integer NOT NULL,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "academy_session_confidence_ratings_unique" UNIQUE("session_id","user_id","timing"),
	CONSTRAINT "academy_session_confidence_ratings_timing_check" CHECK ("academy_session_confidence_ratings"."timing" in ('before', 'after')),
	CONSTRAINT "academy_session_confidence_ratings_rating_check" CHECK ("academy_session_confidence_ratings"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "academy_session_recaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"course_id" integer NOT NULL,
	"transcript_text" text NOT NULL,
	"status" varchar(20) DEFAULT 'generated' NOT NULL,
	"content" jsonb,
	"error_message" text,
	"generation_provider" varchar(60),
	"generation_model" varchar(60),
	"generated_at" timestamp with time zone,
	"edited_by" integer,
	"edited_at" timestamp with time zone,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "academy_session_recaps_session_unique" UNIQUE("session_id"),
	CONSTRAINT "academy_session_recaps_status_check" CHECK ("academy_session_recaps"."status" in ('generated', 'edited', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" DROP CONSTRAINT "admin_audit_events_action_check";--> statement-breakpoint
ALTER TABLE "academy_session_confidence_ratings" ADD CONSTRAINT "academy_session_confidence_ratings_session_id_academy_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academy_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_confidence_ratings" ADD CONSTRAINT "academy_session_confidence_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_confidence_ratings" ADD CONSTRAINT "academy_session_confidence_ratings_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_confidence_ratings" ADD CONSTRAINT "academy_session_confidence_ratings_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_confidence_ratings" ADD CONSTRAINT "academy_session_confidence_ratings_session_course_fk" FOREIGN KEY ("session_id","course_id") REFERENCES "public"."academy_sessions"("id","course_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_recaps" ADD CONSTRAINT "academy_session_recaps_session_id_academy_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academy_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_recaps" ADD CONSTRAINT "academy_session_recaps_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_recaps" ADD CONSTRAINT "academy_session_recaps_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_recaps" ADD CONSTRAINT "academy_session_recaps_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_recaps" ADD CONSTRAINT "academy_session_recaps_session_course_fk" FOREIGN KEY ("session_id","course_id") REFERENCES "public"."academy_sessions"("id","course_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_action_check" CHECK ("admin_audit_events"."action" in ('coach_approved', 'coach_rejected', 'coach_verification_changed', 'user_role_changed', 'ai_notes_entitlement_granted', 'ai_notes_entitlement_revoked', 'ai_notes_session_reopened', 'ai_notes_worker_run', 'ai_notes_guidelines_saved', 'ai_notes_callback_probed', 'sensitive_content_accessed', 'data_exported', 'data_deleted', 'configuration_changed', 'package_created', 'package_features_updated', 'user_package_assigned', 'user_package_revoked', 'academy_course_created', 'academy_course_status_changed', 'academy_course_edition_created', 'academy_module_saved', 'academy_instructor_nominated', 'academy_instructor_removed', 'academy_course_assigned', 'academy_session_created', 'academy_session_cancelled', 'academy_session_completed', 'academy_recap_generated', 'academy_recap_edited', 'academy_material_uploaded', 'academy_material_published', 'academy_module_completed', 'academy_module_completion_corrected'));