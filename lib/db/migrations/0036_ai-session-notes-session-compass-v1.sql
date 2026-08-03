-- Fase 4B: Session Compass v1.
-- Il report post-sessione diventa versionato per sessione: la tabella esistente
-- viene estesa, non duplicata. Resta leggibile dal solo coach della sessione e
-- dall'amministrazione (policy "ai_reports_select_coach_or_admin"); l'atleta non
-- ha alcun percorso di lettura, né via API né via RLS.

ALTER TABLE "session_ai_reports"
  DROP CONSTRAINT IF EXISTS "session_ai_reports_session_ai_notes_id_key";--> statement-breakpoint
ALTER TABLE "session_ai_reports"
  DROP CONSTRAINT IF EXISTS "session_ai_reports_session_ai_notes_id_unique";--> statement-breakpoint

ALTER TABLE "session_ai_reports"
  ADD COLUMN IF NOT EXISTS "report_kind" varchar(40)
  DEFAULT 'session_compass_v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_ai_reports"
  ADD COLUMN IF NOT EXISTS "source_fingerprint" varchar(64);--> statement-breakpoint

ALTER TABLE "session_ai_reports"
  ADD CONSTRAINT "session_ai_reports_kind_check"
  CHECK ("report_kind" IN ('session_compass_v1'));--> statement-breakpoint

ALTER TABLE "session_ai_reports"
  ADD CONSTRAINT "session_ai_reports_session_kind_version_unique"
  UNIQUE ("session_ai_notes_id", "report_kind", "report_version");--> statement-breakpoint

-- Una sola bozza aperta per sessione: le versioni precedenti restano approvate
-- e immutabili, e una rigenerazione dopo l'approvazione apre la versione dopo.
CREATE UNIQUE INDEX "session_ai_reports_one_open_draft_idx"
  ON "session_ai_reports" ("session_ai_notes_id", "report_kind")
  WHERE "status" IN ('pending', 'generating', 'ready_for_review', 'failed');--> statement-breakpoint

CREATE INDEX "session_ai_reports_session_kind_version_idx"
  ON "session_ai_reports" ("session_ai_notes_id", "report_kind", "report_version" DESC);--> statement-breakpoint

COMMENT ON COLUMN "session_ai_reports"."source_fingerprint" IS
  'SHA-256 della timeline transcript sorgente: la rigenerazione avviene solo se cambia questo valore o la prompt_version.';--> statement-breakpoint
COMMENT ON COLUMN "session_ai_reports"."private_coach_notes" IS
  'Session Compass coach_note: campo libero del coach. Mai prodotto o sovrascritto dall''AI e mai condiviso con l''atleta.';--> statement-breakpoint
COMMENT ON COLUMN "session_ai_reports"."coach_edited_report_json" IS
  'Documento Session Compass con le modifiche manuali del coach (impegni). La bozza AI resta in generated_report_json.';--> statement-breakpoint

ALTER TABLE "session_ai_audit_events"
  DROP CONSTRAINT "session_ai_audit_events_type_check";--> statement-breakpoint
ALTER TABLE "session_ai_audit_events"
  ADD CONSTRAINT "session_ai_audit_events_type_check"
  CHECK ("event_type" IN (
    'feature_requested', 'consent_accepted', 'consent_rejected',
    'consent_revoked', 'session_activated', 'session_cancelled',
    'entitlement_denied', 'entitlement_granted',
    'entitlement_trial_started', 'entitlement_revoked',
    'status_transitioned', 'recording_start_requested',
    'recording_started', 'recording_stop_requested', 'recording_recorded',
    'recording_failed', 'recording_deletion_requested', 'recording_deleted',
    'recording_deletion_failed', 'recording_reconciled',
    'unverified_participant_blocked', 'participant_recording_grouped',
    'processing_job_queued', 'processing_job_claimed',
    'processing_job_completed', 'processing_job_failed',
    'processing_job_cancelled', 'processing_job_recovered',
    'compass_report_generated', 'compass_report_regenerated',
    'compass_report_approved', 'compass_report_failed',
    'compass_note_updated', 'compass_commitment_updated'
  ));--> statement-breakpoint

-- Le scritture restano esclusivamente server-side: nessun ruolo browser
-- guadagna privilegi da questa migrazione.
REVOKE INSERT, UPDATE, DELETE ON "session_ai_reports" FROM anon, authenticated;
