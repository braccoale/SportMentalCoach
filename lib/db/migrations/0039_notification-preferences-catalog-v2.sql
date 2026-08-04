-- Email notifications, phase 1b: bring the default-preferences trigger back in
-- line with the event catalogue.
--
-- Migration 0024 installed a trigger seeding one preference row per event for
-- every new user. Two events shipped afterwards were never added to it, so any
-- user created since then has no row for them:
--   * booking_created_by_coach (0027)
--   * booking_rescheduled      (0027)
-- Three more arrive with this feature: booking_reminder_24h, booking_reminder_1h
-- and ai_report_ready.
--
-- Mandatory events (coach_invitation, security_alert) are deliberately NOT
-- seeded: they cannot be switched off, so a preference row would be misleading.
--
-- The resolver in lib/core/notifications does not depend on these rows — a
-- missing preference falls back to the catalogue default. The trigger exists
-- only so the existing behaviour (and the preferences UI) stays unchanged.

CREATE OR REPLACE FUNCTION "public"."notification_preference_default_types"()
RETURNS TABLE ("type" text)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT * FROM (
    VALUES
      ('booking_requested'),
      ('booking_created_by_coach'),
      ('booking_accepted'),
      ('booking_declined'),
      ('booking_cancelled'),
      ('booking_rescheduled'),
      ('booking_completed'),
      ('booking_reminder_24h'),
      ('booking_reminder_1h'),
      ('new_message'),
      ('ai_report_ready'),
      ('provider_review_requested'),
      ('provider_approved'),
      ('provider_rejected'),
      ('review_received')
  ) AS defaults("type");
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."create_default_notification_preferences"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO "public"."notification_preferences" (
    "user_id",
    "type",
    "email_enabled",
    "in_app_enabled"
  )
  SELECT NEW."id", defaults."type", true, true
  FROM "public"."notification_preference_default_types"() AS defaults("type")
  ON CONFLICT ("user_id", "type") DO NOTHING;

  RETURN NEW;
END;
$$;--> statement-breakpoint

-- Re-attach (idempotent): the trigger itself is unchanged since 0024.
DROP TRIGGER IF EXISTS "users_default_notification_preferences"
  ON "public"."users";--> statement-breakpoint

CREATE TRIGGER "users_default_notification_preferences"
AFTER INSERT ON "public"."users"
FOR EACH ROW
EXECUTE FUNCTION "public"."create_default_notification_preferences"();--> statement-breakpoint

-- Backfill the events missing from 0024 for users that already exist. Additive
-- only: ON CONFLICT DO NOTHING never overwrites a choice the user has made.
INSERT INTO "public"."notification_preferences" (
  "user_id",
  "type",
  "email_enabled",
  "in_app_enabled"
)
SELECT "users"."id", defaults."type", true, true
FROM "public"."users"
CROSS JOIN "public"."notification_preference_default_types"() AS defaults("type")
WHERE "users"."deleted_at" IS NULL
ON CONFLICT ("user_id", "type") DO NOTHING;
