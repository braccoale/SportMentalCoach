-- Notify administrators when a coach creates an account, before the distinct
-- moment in which the coach submits the profile for review.

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
      ('provider_registered'),
      ('provider_review_requested'),
      ('provider_approved'),
      ('provider_rejected'),
      ('review_received')
  ) AS defaults("type");
$$;--> statement-breakpoint

INSERT INTO "public"."notification_preferences" (
  "user_id",
  "type",
  "email_enabled",
  "in_app_enabled"
)
SELECT "users"."id", 'provider_registered', true, true
FROM "public"."users"
WHERE "users"."deleted_at" IS NULL
ON CONFLICT ("user_id", "type") DO NOTHING;
