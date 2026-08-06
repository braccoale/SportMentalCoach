ALTER TABLE "agreement_acceptances"
  ADD COLUMN "subject_user_id" integer,
  ADD COLUMN "accepted_by_email" varchar(255),
  ADD COLUMN "acceptance_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "agreement_acceptances"
  ADD CONSTRAINT "agreement_acceptances_subject_user_id_users_id_fk"
  FOREIGN KEY ("subject_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "agreement_acceptances_subject_key_idx"
  ON "agreement_acceptances" USING btree ("subject_user_id", "agreement_key");
--> statement-breakpoint

ALTER TABLE "athlete_guardians"
  ADD COLUMN "status" varchar(24) DEFAULT 'pending' NOT NULL,
  ADD COLUMN "signature_name" varchar(200),
  ADD COLUMN "authority_basis" varchar(32),
  ADD COLUMN "ai_recording_authorized" boolean DEFAULT false NOT NULL,
  ADD COLUMN "confirmed_user_agent" text,
  ADD COLUMN "active_acceptance_id" integer,
  ADD COLUMN "management_token_hash" varchar(64),
  ADD COLUMN "revoked_at" timestamp with time zone,
  ADD COLUMN "revoked_reason" text;
--> statement-breakpoint
ALTER TABLE "athlete_guardians"
  ADD CONSTRAINT "athlete_guardians_active_acceptance_id_fk"
  FOREIGN KEY ("active_acceptance_id") REFERENCES "agreement_acceptances"("id")
  ON DELETE set null ON UPDATE no action,
  ADD CONSTRAINT "athlete_guardians_status_check"
  CHECK ("status" in ('pending', 'confirmed', 'revoked')),
  ADD CONSTRAINT "athlete_guardians_authority_basis_check"
  CHECK ("authority_basis" is null or "authority_basis" in ('joint_agreement', 'sole_responsibility', 'legal_guardian'));
--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_guardians_management_token_hash_unique"
  ON "athlete_guardians" USING btree ("management_token_hash");
--> statement-breakpoint

CREATE TABLE "guardian_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "athlete_guardian_id" integer NOT NULL,
  "athlete_user_id" integer NOT NULL,
  "guardian_name" varchar(200) NOT NULL,
  "guardian_email" varchar(255) NOT NULL,
  "relationship" varchar(60) NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone,
  "consumed_at" timestamp with time zone,
  "invalidated_at" timestamp with time zone,
  "delivery_status" varchar(24) DEFAULT 'pending' NOT NULL,
  "delivery_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  CONSTRAINT "guardian_invitations_token_hash_unique" UNIQUE("token_hash"),
  CONSTRAINT "guardian_invitations_delivery_status_check"
    CHECK ("delivery_status" in ('pending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
ALTER TABLE "guardian_invitations"
  ADD CONSTRAINT "guardian_invitations_athlete_guardian_id_fk"
  FOREIGN KEY ("athlete_guardian_id") REFERENCES "athlete_guardians"("id")
  ON DELETE cascade ON UPDATE no action,
  ADD CONSTRAINT "guardian_invitations_athlete_user_id_fk"
  FOREIGN KEY ("athlete_user_id") REFERENCES "users"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "guardian_invitations_athlete_created_idx"
  ON "guardian_invitations" USING btree ("athlete_user_id", "created_at");
CREATE INDEX "guardian_invitations_guardian_status_idx"
  ON "guardian_invitations" USING btree ("athlete_guardian_id", "consumed_at", "invalidated_at");
--> statement-breakpoint

CREATE TABLE "guardian_authorization_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "athlete_user_id" integer,
  "athlete_guardian_id" integer,
  "acceptance_id" integer,
  "invitation_id" uuid,
  "event_type" varchar(40) NOT NULL,
  "actor_type" varchar(24) NOT NULL,
  "actor_user_id" integer,
  "reason" text,
  "ip_address" varchar(64),
  "user_agent" text,
  "event_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "guardian_authorization_events_type_check"
    CHECK ("event_type" in ('invitation_created', 'invitation_sent', 'invitation_failed', 'authorization_confirmed', 'receipt_sent', 'receipt_failed', 'authorization_revoked', 'guardian_notified', 'guardian_notification_failed')),
  CONSTRAINT "guardian_authorization_events_actor_check"
    CHECK ("actor_type" in ('athlete', 'guardian', 'admin', 'system'))
);
--> statement-breakpoint
ALTER TABLE "guardian_authorization_events"
  ADD CONSTRAINT "guardian_authorization_events_athlete_user_id_fk"
  FOREIGN KEY ("athlete_user_id") REFERENCES "users"("id")
  ON DELETE set null ON UPDATE no action,
  ADD CONSTRAINT "guardian_authorization_events_athlete_guardian_id_fk"
  FOREIGN KEY ("athlete_guardian_id") REFERENCES "athlete_guardians"("id")
  ON DELETE set null ON UPDATE no action,
  ADD CONSTRAINT "guardian_authorization_events_acceptance_id_fk"
  FOREIGN KEY ("acceptance_id") REFERENCES "agreement_acceptances"("id")
  ON DELETE set null ON UPDATE no action,
  ADD CONSTRAINT "guardian_authorization_events_invitation_id_fk"
  FOREIGN KEY ("invitation_id") REFERENCES "guardian_invitations"("id")
  ON DELETE set null ON UPDATE no action,
  ADD CONSTRAINT "guardian_authorization_events_actor_user_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "guardian_authorization_events_guardian_created_idx"
  ON "guardian_authorization_events" USING btree ("athlete_guardian_id", "created_at");
CREATE INDEX "guardian_authorization_events_acceptance_idx"
  ON "guardian_authorization_events" USING btree ("acceptance_id");
--> statement-breakpoint

-- These tables are server-only. RLS plus explicit privilege revocation keeps
-- legal evidence and bearer-token hashes out of the Supabase Data API.
ALTER TABLE "agreement_acceptances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "athlete_guardians" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guardian_authorization_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "agreement_acceptances" FROM anon, authenticated;
REVOKE ALL ON TABLE "athlete_guardians" FROM anon, authenticated;
REVOKE ALL ON TABLE "guardian_invitations" FROM anon, authenticated;
REVOKE ALL ON TABLE "guardian_authorization_events" FROM anon, authenticated;
