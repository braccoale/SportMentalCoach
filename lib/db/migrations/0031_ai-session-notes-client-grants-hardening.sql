-- Supabase default privileges can include TRUNCATE, REFERENCES and TRIGGER.
-- RLS does not protect TRUNCATE, so browser roles must receive only the
-- explicitly designed read grants.

REVOKE ALL ON "public"."user_feature_entitlements" FROM anon, authenticated;
REVOKE ALL ON "public"."session_ai_notes" FROM anon, authenticated;
REVOKE ALL ON "public"."session_ai_consents" FROM anon, authenticated;
REVOKE ALL ON "public"."session_transcript_segments" FROM anon, authenticated;
REVOKE ALL ON "public"."session_ai_reports" FROM anon, authenticated;
REVOKE ALL ON "public"."session_ai_audit_events" FROM anon, authenticated;

REVOKE ALL ON SEQUENCE "public"."user_feature_entitlements_id_seq"
  FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "public"."session_ai_notes_id_seq"
  FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "public"."session_ai_consents_id_seq"
  FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "public"."session_transcript_segments_id_seq"
  FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "public"."session_ai_reports_id_seq"
  FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "public"."session_ai_audit_events_id_seq"
  FROM anon, authenticated;

GRANT SELECT ON "public"."user_feature_entitlements" TO authenticated;
GRANT SELECT ON "public"."session_ai_notes" TO authenticated;
GRANT SELECT ON "public"."session_ai_consents" TO authenticated;
GRANT SELECT ON "public"."session_ai_reports" TO authenticated;
