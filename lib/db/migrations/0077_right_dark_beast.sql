-- Academy: corsi di formazione per i coach, erogati con vere sessioni video
-- (individuali o di gruppo), non con `bookings` (vedi
-- docs/superpowers/specs/2026-09-17-academy-corsi-design.md e
-- docs/superpowers/plans/2026-09-17-academy-corsi.md). `bookings` resta un
-- client + un provider, usata da ~150 moduli di AI Session Notes, dalla
-- policy di cancellazione, dalle notifiche e dalla app mobile — tutti
-- scritti assumendo un atleta. Le tabelle qui sotto sono additive e
-- parallele: stessa infrastruttura LiveKit, autorizzazione propria pensata
-- per un docente e più partecipanti fin dall'inizio.
--
-- Più tabelle portano una colonna `course_id` ridondante, vincolata da una
-- chiave esterna composta verso `(id, course_id)` della tabella
-- referenziata (modulo, assegnazione, sessione): un completamento o un
-- partecipante non possono puntare a un corso diverso da quello reale del
-- modulo/assegnazione/sessione a cui si agganciano — vincolo di database,
-- non solo controllo applicativo.
--
-- `admin_audit_events` si estende, non si duplica: stessa tecnica della
-- migrazione 0061 (pacchetti/organizzazioni).

CREATE TABLE "academy_course_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'assigned' NOT NULL,
	"assigned_date" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by" integer,
	"completed_date" timestamp with time zone,
	CONSTRAINT "academy_course_assignments_course_user_unique" UNIQUE("course_id","user_id"),
	CONSTRAINT "academy_course_assignments_id_course_unique" UNIQUE("id","course_id"),
	CONSTRAINT "academy_course_assignments_status_check" CHECK ("academy_course_assignments"."status" in ('assigned', 'in_progress', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "academy_course_instructors" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"nominated_date" timestamp with time zone DEFAULT now() NOT NULL,
	"nominated_by" integer,
	CONSTRAINT "academy_course_instructors_course_user_unique" UNIQUE("course_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "academy_course_modules" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"hours" real DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "academy_course_modules_id_course_unique" UNIQUE("id","course_id"),
	CONSTRAINT "academy_course_modules_hours_check" CHECK ("academy_course_modules"."hours" >= 0)
);
--> statement-breakpoint
CREATE TABLE "academy_courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"edition" varchar(60),
	"previous_course_id" integer,
	"structure_locked_at" timestamp with time zone,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "academy_courses_status_check" CHECK ("academy_courses"."status" in ('draft', 'active', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "academy_module_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" integer,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer
);
--> statement-breakpoint
CREATE TABLE "academy_module_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"assignment_id" integer NOT NULL,
	"course_id" integer NOT NULL,
	"module_id" integer NOT NULL,
	"session_id" integer,
	"completed_date" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_by" integer,
	CONSTRAINT "academy_module_completions_assignment_module_unique" UNIQUE("assignment_id","module_id")
);
--> statement-breakpoint
CREATE TABLE "academy_session_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"course_id" integer NOT NULL,
	"assignment_id" integer NOT NULL,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	CONSTRAINT "academy_session_participants_session_assignment_unique" UNIQUE("session_id","assignment_id")
);
--> statement-breakpoint
CREATE TABLE "academy_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"course_id" integer NOT NULL,
	"module_id" integer NOT NULL,
	"instructor_user_id" integer NOT NULL,
	"mode" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"duration_min" integer NOT NULL,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "academy_sessions_id_course_unique" UNIQUE("id","course_id"),
	CONSTRAINT "academy_sessions_mode_check" CHECK ("academy_sessions"."mode" in ('individual', 'group')),
	CONSTRAINT "academy_sessions_status_check" CHECK ("academy_sessions"."status" in ('scheduled', 'cancelled')),
	CONSTRAINT "academy_sessions_duration_check" CHECK ("academy_sessions"."duration_min" > 0)
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" DROP CONSTRAINT "admin_audit_events_action_check";--> statement-breakpoint
ALTER TABLE "admin_audit_events" DROP CONSTRAINT "admin_audit_events_subject_type_check";--> statement-breakpoint
ALTER TABLE "academy_course_assignments" ADD CONSTRAINT "academy_course_assignments_course_id_academy_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academy_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_course_assignments" ADD CONSTRAINT "academy_course_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_course_assignments" ADD CONSTRAINT "academy_course_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_course_instructors" ADD CONSTRAINT "academy_course_instructors_course_id_academy_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academy_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_course_instructors" ADD CONSTRAINT "academy_course_instructors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_course_instructors" ADD CONSTRAINT "academy_course_instructors_nominated_by_users_id_fk" FOREIGN KEY ("nominated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_course_modules" ADD CONSTRAINT "academy_course_modules_course_id_academy_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academy_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_course_modules" ADD CONSTRAINT "academy_course_modules_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_course_modules" ADD CONSTRAINT "academy_course_modules_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_courses" ADD CONSTRAINT "academy_courses_previous_course_id_academy_courses_id_fk" FOREIGN KEY ("previous_course_id") REFERENCES "public"."academy_courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_courses" ADD CONSTRAINT "academy_courses_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_courses" ADD CONSTRAINT "academy_courses_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_module_attachments" ADD CONSTRAINT "academy_module_attachments_module_id_academy_course_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."academy_course_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_module_attachments" ADD CONSTRAINT "academy_module_attachments_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_module_attachments" ADD CONSTRAINT "academy_module_attachments_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_module_completions" ADD CONSTRAINT "academy_module_completions_session_id_academy_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academy_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_module_completions" ADD CONSTRAINT "academy_module_completions_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_module_completions" ADD CONSTRAINT "academy_module_completions_assignment_course_fk" FOREIGN KEY ("assignment_id","course_id") REFERENCES "public"."academy_course_assignments"("id","course_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_module_completions" ADD CONSTRAINT "academy_module_completions_module_course_fk" FOREIGN KEY ("module_id","course_id") REFERENCES "public"."academy_course_modules"("id","course_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_participants" ADD CONSTRAINT "academy_session_participants_session_id_academy_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."academy_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_participants" ADD CONSTRAINT "academy_session_participants_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_participants" ADD CONSTRAINT "academy_session_participants_session_course_fk" FOREIGN KEY ("session_id","course_id") REFERENCES "public"."academy_sessions"("id","course_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_session_participants" ADD CONSTRAINT "academy_session_participants_assignment_course_fk" FOREIGN KEY ("assignment_id","course_id") REFERENCES "public"."academy_course_assignments"("id","course_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_sessions" ADD CONSTRAINT "academy_sessions_course_id_academy_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academy_courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_sessions" ADD CONSTRAINT "academy_sessions_instructor_user_id_users_id_fk" FOREIGN KEY ("instructor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_sessions" ADD CONSTRAINT "academy_sessions_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_sessions" ADD CONSTRAINT "academy_sessions_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_sessions" ADD CONSTRAINT "academy_sessions_module_course_fk" FOREIGN KEY ("module_id","course_id") REFERENCES "public"."academy_course_modules"("id","course_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academy_sessions" ADD CONSTRAINT "academy_sessions_instructor_course_fk" FOREIGN KEY ("course_id","instructor_user_id") REFERENCES "public"."academy_course_instructors"("course_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "academy_course_assignments_user_idx" ON "academy_course_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "academy_course_modules_course_idx" ON "academy_course_modules" USING btree ("course_id","sort_order");--> statement-breakpoint
CREATE INDEX "academy_module_attachments_module_idx" ON "academy_module_attachments" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX "academy_sessions_course_idx" ON "academy_sessions" USING btree ("course_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "academy_sessions_instructor_idx" ON "academy_sessions" USING btree ("instructor_user_id","scheduled_for");--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_action_check" CHECK ("admin_audit_events"."action" in ('coach_approved', 'coach_rejected', 'coach_verification_changed', 'user_role_changed', 'ai_notes_entitlement_granted', 'ai_notes_entitlement_revoked', 'ai_notes_session_reopened', 'ai_notes_worker_run', 'ai_notes_guidelines_saved', 'ai_notes_callback_probed', 'sensitive_content_accessed', 'data_exported', 'data_deleted', 'configuration_changed', 'package_created', 'package_features_updated', 'user_package_assigned', 'user_package_revoked', 'academy_course_created', 'academy_course_status_changed', 'academy_course_edition_created', 'academy_module_saved', 'academy_instructor_nominated', 'academy_course_assigned', 'academy_session_created', 'academy_session_cancelled', 'academy_material_uploaded', 'academy_material_published', 'academy_module_completed', 'academy_module_completion_corrected'));--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_subject_type_check" CHECK ("admin_audit_events"."subject_type" in ('provider_profile', 'user', 'ai_session', 'feature', 'configuration', 'system', 'package', 'academy_course'));--> statement-breakpoint

REVOKE ALL ON "public"."academy_courses" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."academy_course_modules" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."academy_course_instructors" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."academy_course_assignments" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."academy_sessions" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."academy_session_participants" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."academy_module_attachments" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."academy_module_completions" FROM anon, authenticated;--> statement-breakpoint

REVOKE ALL ON SEQUENCE "public"."academy_courses_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."academy_course_modules_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."academy_course_instructors_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."academy_course_assignments_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."academy_sessions_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."academy_session_participants_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."academy_module_attachments_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."academy_module_completions_id_seq" FROM anon, authenticated;--> statement-breakpoint

ALTER TABLE "academy_courses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_course_modules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_course_instructors" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_course_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_session_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_module_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_module_completions" ENABLE ROW LEVEL SECURITY;