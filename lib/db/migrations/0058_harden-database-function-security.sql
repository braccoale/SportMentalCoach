-- Gli helper RLS privilegiati non sono API applicative: esistono soltanto per
-- permettere alle policy di verificare identita, ruolo e partecipazione senza
-- dipendere dalle RLS delle tabelle consultate. Tenerli in `public` li rendeva
-- tuttavia RPC scopribili dalla Data API e i default Supabase concedevano
-- EXECUTE anche ad `anon`.
--
-- Li duplichiamo quindi in uno schema non esposto, spostiamo atomicamente le
-- policy sul nuovo namespace e chiudiamo le vecchie entrypoint pubbliche. Le
-- funzioni di trigger restano in `public` per non ricreare tutti i trigger, ma
-- non sono piu' invocabili dai ruoli API. Nessun dato viene riscritto.

CREATE SCHEMA IF NOT EXISTS "app_private";--> statement-breakpoint

REVOKE ALL PRIVILEGES ON SCHEMA "app_private"
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint

GRANT USAGE ON SCHEMA "app_private" TO authenticated;--> statement-breakpoint

-- Le future funzioni sono private per default. Un RPC intenzionale dovra'
-- dichiarare esplicitamente i ruoli autorizzati nella propria migrazione.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;--> statement-breakpoint

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app_private
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app_private"."current_app_user_id"()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
  FROM public.users AS u
  WHERE u.auth_id = (SELECT auth.uid())
    AND u.deleted_at IS NULL
  LIMIT 1
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app_private"."current_app_user_is_admin"()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = (SELECT app_private.current_app_user_id())
      AND ur.role_key = 'admin'
  )
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app_private"."current_app_user_participates_in_booking"(
  "target_booking_id" integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings AS b
    JOIN public.provider_profiles AS pp ON pp.id = b.provider_id
    WHERE b.id = target_booking_id
      AND (SELECT app_private.current_app_user_id()) IN (b.client_id, pp.user_id)
  )
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "app_private"."current_app_user_coaches_ai_session"(
  "target_session_ai_notes_id" integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.session_ai_notes AS san
    JOIN public.bookings AS b ON b.id = san.booking_id
    JOIN public.provider_profiles AS pp ON pp.id = b.provider_id
    WHERE san.id = target_session_ai_notes_id
      AND pp.user_id = (SELECT app_private.current_app_user_id())
  )
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "app_private"."current_app_user_id"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app_private"."current_app_user_is_admin"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app_private"."current_app_user_participates_in_booking"(integer)
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "app_private"."current_app_user_coaches_ai_session"(integer)
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint

GRANT EXECUTE ON FUNCTION "app_private"."current_app_user_id"()
TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app_private"."current_app_user_is_admin"()
TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app_private"."current_app_user_participates_in_booking"(integer)
TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app_private"."current_app_user_coaches_ai_session"(integer)
TO authenticated;--> statement-breakpoint

ALTER POLICY "entitlements_select_own_or_admin"
  ON "public"."user_feature_entitlements"
  USING (
    "user_id" = (SELECT app_private.current_app_user_id())
    OR (SELECT app_private.current_app_user_is_admin())
  );--> statement-breakpoint

ALTER POLICY "ai_notes_select_participant_or_admin"
  ON "public"."session_ai_notes"
  USING (
    (SELECT app_private.current_app_user_is_admin())
    OR (SELECT app_private.current_app_user_participates_in_booking("booking_id"))
  );--> statement-breakpoint

ALTER POLICY "ai_consents_select_own_or_admin"
  ON "public"."session_ai_consents"
  USING (
    (SELECT app_private.current_app_user_is_admin())
    OR "user_id" = (SELECT app_private.current_app_user_id())
  );--> statement-breakpoint

ALTER POLICY "ai_reports_select_coach_or_admin"
  ON "public"."session_ai_reports"
  USING (
    (SELECT app_private.current_app_user_is_admin())
    OR (SELECT app_private.current_app_user_coaches_ai_session("session_ai_notes_id"))
  );--> statement-breakpoint

ALTER POLICY "ai_commitments_select_coach_admin_or_owning_athlete"
  ON "public"."session_ai_commitments"
  USING (
    (SELECT app_private.current_app_user_is_admin())
    OR (SELECT app_private.current_app_user_coaches_ai_session("session_ai_notes_id"))
    OR (
      "owner" = 'athlete'
      AND "athlete_user_id" = (SELECT app_private.current_app_user_id())
    )
  );--> statement-breakpoint

-- I vecchi helper restano temporaneamente presenti per una rollback semplice,
-- ma non sono piu' usati dalle policy ne' eseguibili dai ruoli Data API.
ALTER FUNCTION "public"."current_app_user_id"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "public"."current_app_user_is_admin"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "public"."current_app_user_participates_in_booking"(integer) SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "public"."current_app_user_coaches_ai_session"(integer) SET search_path = '';--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."current_app_user_id"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."current_app_user_is_admin"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."current_app_user_participates_in_booking"(integer)
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."current_app_user_coaches_ai_session"(integer)
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint

COMMENT ON FUNCTION "public"."current_app_user_id"() IS
  'Deprecated: le policy usano app_private.current_app_user_id().';--> statement-breakpoint
COMMENT ON FUNCTION "public"."current_app_user_is_admin"() IS
  'Deprecated: le policy usano app_private.current_app_user_is_admin().';--> statement-breakpoint
COMMENT ON FUNCTION "public"."current_app_user_participates_in_booking"(integer) IS
  'Deprecated: le policy usano app_private.current_app_user_participates_in_booking(integer).';--> statement-breakpoint
COMMENT ON FUNCTION "public"."current_app_user_coaches_ai_session"(integer) IS
  'Deprecated: le policy usano app_private.current_app_user_coaches_ai_session(integer).';--> statement-breakpoint

-- Queste funzioni vengono eseguite soltanto da trigger gia' installati. I
-- privilegi del chiamante non sono necessari e non devono creare RPC.
ALTER FUNCTION "public"."set_updated_at"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "public"."set_updateddate"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "public"."notification_preference_default_types"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "public"."attach_audio_segment_to_participant_recording"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "public"."create_default_notification_preferences"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "public"."refresh_participant_recording_aggregate"() SET search_path = '';--> statement-breakpoint
ALTER FUNCTION "public"."rls_auto_enable"() SET search_path = '';--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."set_updated_at"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."set_updateddate"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."notification_preference_default_types"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."attach_audio_segment_to_participant_recording"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."create_default_notification_preferences"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."refresh_participant_recording_aggregate"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION "public"."rls_auto_enable"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
