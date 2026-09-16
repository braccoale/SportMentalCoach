-- `compass_report_shared` è un valore valido nel tipo TypeScript
-- (SessionCompassAuditEvent, session-compass.ts) da quando esiste la
-- condivisione con l'atleta, ma non era mai stato aggiunto qui: ogni
-- `recordAudit` per un evento di condivisione falliva il vincolo, sempre,
-- fin dal lancio della funzionalità (verificato: zero righe in produzione
-- con questo event_type, e la richiesta HTTP che le genera torna 500).
-- L'aggiornamento del report ("shared_at", il testo condiviso) avveniva
-- comunque, perché precede questa scrittura nel codice — l'atleta vedeva
-- già il report aprendo la pagina; l'unica cosa che non è mai successa è
-- la notifica (email + in-app), perché il codice che la invia viene dopo
-- questa riga e non veniva mai raggiunto.
ALTER TABLE "session_ai_audit_events" DROP CONSTRAINT "session_ai_audit_events_type_check";--> statement-breakpoint
ALTER TABLE "session_ai_audit_events" ADD CONSTRAINT "session_ai_audit_events_type_check" CHECK (event_type in ('feature_requested', 'consent_accepted', 'consent_rejected', 'consent_revoked', 'session_activated', 'session_cancelled', 'entitlement_denied', 'entitlement_granted', 'entitlement_trial_started', 'entitlement_revoked', 'status_transitioned', 'recording_start_requested', 'recording_started', 'recording_stop_requested', 'recording_recorded', 'recording_failed', 'recording_deletion_requested', 'recording_deleted', 'recording_deletion_failed', 'recording_reconciled', 'unverified_participant_blocked', 'participant_recording_grouped', 'processing_job_queued', 'processing_job_claimed', 'processing_job_completed', 'processing_job_failed', 'processing_job_cancelled', 'processing_job_recovered', 'compass_report_generated', 'compass_report_regenerated', 'compass_report_approved', 'compass_report_shared', 'compass_report_failed', 'compass_note_updated', 'compass_commitment_updated', 'commitment_synced', 'commitment_archived', 'commitment_updated_by_coach', 'commitment_updated_by_athlete', 'commitment_attempt_recorded', 'commitment_attempt_edited', 'commitment_paused_by_athlete', 'commitment_resumed_by_athlete'));