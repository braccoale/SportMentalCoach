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
    "email_enabled"
  )
  SELECT
    NEW."id",
    defaults."type",
    true
  FROM (
    VALUES
      ('booking_requested'),
      ('booking_accepted'),
      ('booking_declined'),
      ('booking_cancelled'),
      ('booking_completed'),
      ('new_message'),
      ('provider_review_requested'),
      ('provider_approved'),
      ('provider_rejected'),
      ('review_received')
  ) AS defaults("type")
  ON CONFLICT ("user_id", "type") DO NOTHING;

  RETURN NEW;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS "users_default_notification_preferences"
ON "public"."users";--> statement-breakpoint

CREATE TRIGGER "users_default_notification_preferences"
AFTER INSERT ON "public"."users"
FOR EACH ROW
EXECUTE FUNCTION "public"."create_default_notification_preferences"();--> statement-breakpoint

INSERT INTO "public"."notification_preferences" (
  "user_id",
  "type",
  "email_enabled"
)
SELECT
  "users"."id",
  defaults."type",
  true
FROM "public"."users"
CROSS JOIN (
  VALUES
    ('booking_requested'),
    ('booking_accepted'),
    ('booking_declined'),
    ('booking_cancelled'),
    ('booking_completed'),
    ('new_message'),
    ('provider_review_requested'),
    ('provider_approved'),
    ('provider_rejected'),
    ('review_received')
) AS defaults("type")
ON CONFLICT ("user_id", "type") DO NOTHING;
