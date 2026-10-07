ALTER TABLE "session_credits" DROP CONSTRAINT "session_credits_consumption_check";--> statement-breakpoint
ALTER TABLE "session_credits" ADD COLUMN "reserved_at" timestamp with time zone;--> statement-breakpoint
-- Phase 1 had no writer, but this keeps the migration non-destructive if test
-- or staging data already exists. Consumed/reserved rows retain their booking;
-- rows that were still available release any provisional link.
UPDATE "session_credits"
SET "reserved_at" = LEAST(
  COALESCE("consumed_at", "created_at"),
  "expires_at" - interval '1 microsecond'
)
WHERE "status" IN ('reserved', 'consumed') AND "reserved_at" IS NULL;--> statement-breakpoint
UPDATE "session_credits"
SET "booking_id" = NULL
WHERE "status" IN ('available', 'expired', 'revoked') AND "booking_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_lifecycle_shape_check" CHECK (
      ("session_credits"."status" = 'available' and "session_credits"."booking_id" is null and "session_credits"."reserved_at" is null and "session_credits"."consumed_at" is null)
      or ("session_credits"."status" = 'reserved' and "session_credits"."booking_id" is not null and "session_credits"."reserved_at" is not null and "session_credits"."consumed_at" is null)
      or ("session_credits"."status" = 'consumed' and "session_credits"."booking_id" is not null and "session_credits"."reserved_at" is not null and "session_credits"."consumed_at" is not null)
      or ("session_credits"."status" in ('expired', 'revoked') and "session_credits"."booking_id" is null and "session_credits"."reserved_at" is null and "session_credits"."consumed_at" is null)
    );--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_reservation_before_expiry_check" CHECK ("session_credits"."reserved_at" is null or "session_credits"."reserved_at" < "session_credits"."expires_at");--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_private.billing_validate_credit_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  parent public.session_credits%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'available' AND NEW.status NOT IN ('reserved', 'expired', 'revoked') THEN
      RAISE EXCEPTION 'invalid transition from available session credit';
    ELSIF OLD.status = 'reserved' AND NEW.status NOT IN ('available', 'consumed', 'revoked') THEN
      RAISE EXCEPTION 'invalid transition from reserved session credit';
    ELSIF OLD.status IN ('consumed', 'expired', 'revoked') THEN
      RAISE EXCEPTION 'terminal session credit cannot be reopened';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'consumed' AND (
    NEW.booking_id IS DISTINCT FROM OLD.booking_id OR
    NEW.reserved_at IS DISTINCT FROM OLD.reserved_at OR
    NEW.consumed_at IS DISTINCT FROM OLD.consumed_at
  ) THEN
    RAISE EXCEPTION 'a consumed session credit cannot be consumed again or reopened';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'reserved' AND NEW.status = 'reserved' AND (
    NEW.booking_id IS DISTINCT FROM OLD.booking_id OR
    NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
  ) THEN
    RAISE EXCEPTION 'a reserved session credit cannot move to another booking';
  END IF;

  IF NEW.status = 'reserved' AND NEW.reserved_at >= NEW.expires_at THEN
    RAISE EXCEPTION 'an expired session credit cannot be reserved';
  END IF;

  IF NEW.rollover_generation = 1 THEN
    SELECT * INTO parent FROM public.session_credits
    WHERE id = NEW.rolled_from_credit_id;
    IF NOT FOUND
       OR parent.rollover_generation <> 0
       OR parent.athlete_user_id <> NEW.athlete_user_id
       OR parent.coach_user_id <> NEW.coach_user_id
       OR parent.subscription_id IS DISTINCT FROM NEW.subscription_id THEN
      RAISE EXCEPTION 'invalid session credit rollover';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
