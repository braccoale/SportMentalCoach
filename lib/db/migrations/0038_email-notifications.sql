-- Email notifications, phase 1: editable templates + delivery/idempotency ledger.
--
-- Written by hand (like 0025..0037) and fully idempotent: the development
-- database is the production database, so every statement must be safe to
-- re-run and must never drop or rewrite existing data.
--
-- Design notes:
--  * `email_templates.id` is uuid (new table, no legacy), but `created_by` is
--    integer -> users.id, because users.id is a serial in this project and
--    users.auth_id (uuid) exists only to link Supabase Auth.
--  * `notification_email_deliveries.notification_id` is integer because
--    notifications.id is a serial.
--  * The templates hold CONTENT only. The KaiPai HTML shell, the event
--    catalogue, the recipient rules and the mandatory flags live in code.

CREATE TABLE IF NOT EXISTS "public"."email_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" text NOT NULL,
  "category" text NOT NULL,
  "subject" text NOT NULL,
  "html_body" text NOT NULL,
  "text_body" text,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "locale" text DEFAULT 'it-IT' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_mandatory" boolean DEFAULT false NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_by" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "email_templates_key_locale_version_unique"
    UNIQUE ("key", "locale", "version"),
  CONSTRAINT "email_templates_version_check" CHECK ("version" >= 1)
);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'email_templates_created_by_users_id_fk'
  ) THEN
    ALTER TABLE "public"."email_templates"
      ADD CONSTRAINT "email_templates_created_by_users_id_fk"
      FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
      ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint

-- Exactly one active version per (key, locale). The active version is chosen
-- explicitly via is_active; there is deliberately no redundant is_default.
CREATE UNIQUE INDEX IF NOT EXISTS "email_templates_active_key_locale_idx"
  ON "public"."email_templates" ("key", "locale")
  WHERE "is_active";--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "email_templates_key_idx"
  ON "public"."email_templates" ("key");--> statement-breakpoint

-- One row per attempted notification email: delivery log AND dedup ledger.
-- `idempotency_key` is deterministic over the concrete event (never over a time
-- window), so two chat messages produce two emails while a retry of the same
-- event produces none.
CREATE TABLE IF NOT EXISTS "public"."notification_email_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "notification_id" integer,
  "recipient_user_id" integer,
  "recipient_email" text NOT NULL,
  "template_key" text NOT NULL,
  "template_version" integer,
  "idempotency_key" text NOT NULL,
  "provider_message_id" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "sent_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "notification_email_deliveries_idempotency_key_unique"
    UNIQUE ("idempotency_key"),
  CONSTRAINT "notification_email_deliveries_status_check"
    CHECK ("status" IN ('queued', 'sent', 'failed', 'skipped')),
  CONSTRAINT "notification_email_deliveries_attempts_check"
    CHECK ("attempt_count" >= 0)
);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_email_deliveries_notification_id_fk'
  ) THEN
    ALTER TABLE "public"."notification_email_deliveries"
      ADD CONSTRAINT "notification_email_deliveries_notification_id_fk"
      FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id")
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_email_deliveries_recipient_user_id_fk'
  ) THEN
    ALTER TABLE "public"."notification_email_deliveries"
      ADD CONSTRAINT "notification_email_deliveries_recipient_user_id_fk"
      FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id")
      ON DELETE SET NULL;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notification_email_deliveries_recipient_idx"
  ON "public"."notification_email_deliveries"
  ("recipient_user_id", "created_at" DESC);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "notification_email_deliveries_status_idx"
  ON "public"."notification_email_deliveries" ("status", "created_at");--> statement-breakpoint

-- The preferences UI exposes the two channels separately. In-app stays on for
-- mandatory events regardless of this column; the code catalogue decides.
ALTER TABLE "public"."notification_preferences"
  ADD COLUMN IF NOT EXISTS "in_app_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint

-- These two tables are reached only through the Next.js server (pooler role),
-- exactly like `notifications` and `notification_preferences`. Deliveries hold
-- recipient email addresses, so revoke the PostgREST roles explicitly: if the
-- project ever exposes the API surface, this data must not leak.
REVOKE ALL ON TABLE "public"."notification_email_deliveries"
  FROM anon, authenticated;--> statement-breakpoint

REVOKE ALL ON TABLE "public"."email_templates" FROM anon;--> statement-breakpoint

-- The shared trigger installed in 0011 keeps updated_at honest.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS "email_templates_set_updated_at"
      ON "public"."email_templates";
    CREATE TRIGGER "email_templates_set_updated_at"
      BEFORE UPDATE ON "public"."email_templates"
      FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

    DROP TRIGGER IF EXISTS "notification_email_deliveries_set_updated_at"
      ON "public"."notification_email_deliveries";
    CREATE TRIGGER "notification_email_deliveries_set_updated_at"
      BEFORE UPDATE ON "public"."notification_email_deliveries"
      FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
  END IF;
END $$;
