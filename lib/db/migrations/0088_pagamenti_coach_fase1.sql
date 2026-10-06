-- Pagamenti del coach, fase 1 — solo ciò che serve ad attivarli e a preparare
-- i piani. Ordini, abbonamenti e crediti NON sono qui: arrivano con i passi
-- che li usano, così in produzione non restano tabelle vuote in attesa.
--
-- Il modello è quello degli addebiti diretti: il coach è l'esercente sul
-- proprio account Stripe e il denaro non transita mai da KaiPai. Per questo
-- `coach_billing_profiles` tiene separati `payments_enabled` (lo decide
-- l'admin) e `charges_enabled`/`payouts_enabled` (li decide Stripe dopo il
-- KYC): una riga assente significa pagamenti spenti, cioè la piattaforma di
-- oggi. I piani si chiamano `coach_session_plans` e non `packages` perché
-- quest'ultimo nome è già dei bundle di funzionalità assegnati dall'admin.
--
-- Nessuna delle due tabelle è letta da un client: solo il server. Quindi RLS
-- attiva senza policy e ogni privilegio tolto ad anon/authenticated, come
-- `system_config`. Il CHECK del registro admin viene solo allargato di una
-- voce (`coach_payments_toggled`): nessuna riga esistente cambia.

CREATE TABLE "coach_billing_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"coach_user_id" integer NOT NULL,
	"payments_enabled" boolean DEFAULT false NOT NULL,
	"payments_enabled_at" timestamp with time zone,
	"stripe_account_id" varchar(255),
	"stripe_account_namespace" varchar(16),
	"onboarding_status" varchar(24) DEFAULT 'not_started' NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"requirements_due" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "coach_billing_profiles_coach_user_id_unique" UNIQUE("coach_user_id"),
	CONSTRAINT "coach_billing_profiles_stripe_account_id_unique" UNIQUE("stripe_account_id"),
	CONSTRAINT "coach_billing_profiles_onboarding_status_check" CHECK ("coach_billing_profiles"."onboarding_status" in ('not_started', 'pending', 'active', 'restricted', 'disabled')),
	CONSTRAINT "coach_billing_profiles_account_namespace_check" CHECK ("coach_billing_profiles"."stripe_account_namespace" is null or "coach_billing_profiles"."stripe_account_namespace" in ('v1', 'v2'))
);
--> statement-breakpoint
CREATE TABLE "coach_session_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"coach_user_id" integer NOT NULL,
	"name" varchar(80) NOT NULL,
	"sessions_per_month" integer NOT NULL,
	"monthly_price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"status" varchar(16) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "coach_session_plans_sessions_check" CHECK ("coach_session_plans"."sessions_per_month" > 0),
	CONSTRAINT "coach_session_plans_price_check" CHECK ("coach_session_plans"."monthly_price_cents" > 0),
	CONSTRAINT "coach_session_plans_currency_check" CHECK ("coach_session_plans"."currency" = 'EUR'),
	CONSTRAINT "coach_session_plans_status_check" CHECK ("coach_session_plans"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" DROP CONSTRAINT "admin_audit_events_action_check";--> statement-breakpoint
ALTER TABLE "coach_billing_profiles" ADD CONSTRAINT "coach_billing_profiles_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_session_plans" ADD CONSTRAINT "coach_session_plans_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_session_plans_coach_status_idx" ON "coach_session_plans" USING btree ("coach_user_id","status");--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_action_check" CHECK ("admin_audit_events"."action" in ('coach_approved', 'coach_rejected', 'coach_verification_changed', 'coach_payments_toggled', 'user_role_changed', 'ai_notes_entitlement_granted', 'ai_notes_entitlement_revoked', 'ai_notes_session_reopened', 'ai_notes_worker_run', 'ai_notes_guidelines_saved', 'ai_notes_callback_probed', 'sensitive_content_accessed', 'data_exported', 'data_deleted', 'configuration_changed', 'package_created', 'package_features_updated', 'user_package_assigned', 'user_package_revoked', 'academy_course_created', 'academy_course_status_changed', 'academy_course_edition_created', 'academy_module_saved', 'academy_instructor_nominated', 'academy_instructor_removed', 'academy_course_assigned', 'academy_course_assignment_removed', 'academy_session_created', 'academy_session_cancelled', 'academy_session_completed', 'academy_recap_generated', 'academy_recap_edited', 'academy_recording_consent_given', 'academy_recording_consent_declined', 'academy_material_uploaded', 'academy_material_published', 'academy_module_completed', 'academy_module_completion_corrected'));
--> statement-breakpoint

REVOKE ALL ON "public"."coach_billing_profiles" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."coach_session_plans" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."coach_billing_profiles_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."coach_session_plans_id_seq" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "coach_billing_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_session_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Il trigger condiviso (0011) tiene onesto updated_at.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS "coach_billing_profiles_set_updated_at"
      ON "public"."coach_billing_profiles";
    CREATE TRIGGER "coach_billing_profiles_set_updated_at"
      BEFORE UPDATE ON "public"."coach_billing_profiles"
      FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

    DROP TRIGGER IF EXISTS "coach_session_plans_set_updated_at"
      ON "public"."coach_session_plans";
    CREATE TRIGGER "coach_session_plans_set_updated_at"
      BEFORE UPDATE ON "public"."coach_session_plans"
      FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
  END IF;
END $$;
