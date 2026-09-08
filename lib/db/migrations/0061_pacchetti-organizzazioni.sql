-- Pacchetti: un pacchetto acquistato da un'organizzazione porta con sé un
-- insieme di feature reali (vedi docs/superpowers/specs/2026-09-06-pacchetti-feature-entitlement-design.md).
--
-- Nessun client legge queste tabelle direttamente: la valutazione delle
-- feature (`lib/core/features`) e il pannello admin (`/dashboard/admin/packages`)
-- passano sempre dal server, dopo `requireRole('admin')` o come parte del
-- calcolo a lettura di `getFeatureAccess`. Stessa postura di
-- `admin_audit_events` (migrazione 0060): RLS abilitata, nessuna concessione
-- a `anon`/`authenticated`.

CREATE TABLE "organization_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" integer NOT NULL,
	"package_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "organization_packages_status_check" CHECK ("organization_packages"."status" in ('active', 'expired', 'suspended')),
	CONSTRAINT "organization_packages_window_check" CHECK ("organization_packages"."expires_at" is null or "organization_packages"."starts_at" is null or "organization_packages"."expires_at" > "organization_packages"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "package_features" (
	"id" serial PRIMARY KEY NOT NULL,
	"package_id" integer NOT NULL,
	"feature_code" varchar(80) NOT NULL,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	CONSTRAINT "package_features_package_feature_unique" UNIQUE("package_id","feature_code")
);
--> statement-breakpoint
CREATE TABLE "packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(60) NOT NULL,
	"name" varchar(120) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "packages_key_unique" UNIQUE("key"),
	CONSTRAINT "packages_status_check" CHECK ("packages"."status" in ('active', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" DROP CONSTRAINT "admin_audit_events_action_check";--> statement-breakpoint
ALTER TABLE "admin_audit_events" DROP CONSTRAINT "admin_audit_events_subject_type_check";--> statement-breakpoint
ALTER TABLE "organization_packages" ADD CONSTRAINT "organization_packages_organization_id_teams_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_packages" ADD CONSTRAINT "organization_packages_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_packages" ADD CONSTRAINT "organization_packages_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_packages" ADD CONSTRAINT "organization_packages_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_features" ADD CONSTRAINT "package_features_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_features" ADD CONSTRAINT "package_features_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packages" ADD CONSTRAINT "packages_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_packages_one_active_idx" ON "organization_packages" USING btree ("organization_id") WHERE "organization_packages"."status" = 'active';--> statement-breakpoint
CREATE INDEX "organization_packages_org_status_idx" ON "organization_packages" USING btree ("organization_id","status");--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_action_check" CHECK ("admin_audit_events"."action" in ('coach_approved', 'coach_rejected', 'coach_verification_changed', 'user_role_changed', 'ai_notes_entitlement_granted', 'ai_notes_entitlement_revoked', 'ai_notes_session_reopened', 'ai_notes_worker_run', 'ai_notes_guidelines_saved', 'ai_notes_callback_probed', 'sensitive_content_accessed', 'data_exported', 'data_deleted', 'configuration_changed', 'package_created', 'package_features_updated', 'organization_package_assigned', 'organization_package_revoked', 'organization_member_added'));--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_subject_type_check" CHECK ("admin_audit_events"."subject_type" in ('provider_profile', 'user', 'ai_session', 'feature', 'configuration', 'system', 'package', 'organization'));--> statement-breakpoint

REVOKE ALL ON "public"."packages" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."package_features" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."organization_packages" FROM anon, authenticated;--> statement-breakpoint

REVOKE ALL ON SEQUENCE "public"."packages_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."package_features_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."organization_packages_id_seq" FROM anon, authenticated;--> statement-breakpoint

ALTER TABLE "packages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "package_features" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_packages" ENABLE ROW LEVEL SECURITY;