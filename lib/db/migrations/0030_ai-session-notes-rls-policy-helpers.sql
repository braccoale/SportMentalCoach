-- Keep AI Session Notes policies independent from RLS rules on bookings and
-- provider_profiles. These helpers expose booleans only, never row content.

CREATE OR REPLACE FUNCTION "public"."current_app_user_participates_in_booking"(
  "target_booking_id" integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    JOIN public.provider_profiles pp ON pp.id = b.provider_id
    WHERE b.id = target_booking_id
      AND public.current_app_user_id() IN (b.client_id, pp.user_id)
  )
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "public"."current_app_user_coaches_ai_session"(
  "target_session_ai_notes_id" integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.session_ai_notes san
    JOIN public.bookings b ON b.id = san.booking_id
    JOIN public.provider_profiles pp ON pp.id = b.provider_id
    WHERE san.id = target_session_ai_notes_id
      AND pp.user_id = public.current_app_user_id()
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION
  "public"."current_app_user_participates_in_booking"(integer)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION
  "public"."current_app_user_coaches_ai_session"(integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  "public"."current_app_user_participates_in_booking"(integer)
  TO authenticated;
GRANT EXECUTE ON FUNCTION
  "public"."current_app_user_coaches_ai_session"(integer)
  TO authenticated;--> statement-breakpoint

ALTER POLICY "ai_notes_select_participant_or_admin"
  ON "public"."session_ai_notes"
  USING (
    public.current_app_user_is_admin()
    OR public.current_app_user_participates_in_booking("booking_id")
  );--> statement-breakpoint

ALTER POLICY "ai_reports_select_coach_or_admin"
  ON "public"."session_ai_reports"
  USING (
    public.current_app_user_is_admin()
    OR public.current_app_user_coaches_ai_session("session_ai_notes_id")
  );
