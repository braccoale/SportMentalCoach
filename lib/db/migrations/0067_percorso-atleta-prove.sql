CREATE TABLE "coach_athlete_path_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"path_id" integer NOT NULL,
	"event" varchar(16) NOT NULL,
	"actor_role" varchar(8) NOT NULL,
	"actor_id" integer,
	"booking_id" integer,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_athlete_path_events_event_check" CHECK ("coach_athlete_path_events"."event" in ('activated', 'closed', 'reopened')),
	CONSTRAINT "coach_athlete_path_events_actor_check" CHECK ("coach_athlete_path_events"."actor_role" in ('coach', 'athlete', 'system'))
);
--> statement-breakpoint
CREATE TABLE "coach_athlete_paths" (
	"id" serial PRIMARY KEY NOT NULL,
	"coach_user_id" integer NOT NULL,
	"athlete_user_id" integer NOT NULL,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activation_booking_id" integer,
	"closed_at" timestamp with time zone,
	"closed_by_role" varchar(8),
	"closed_by" integer,
	"contributions_revoked_at" timestamp with time zone,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "coach_athlete_paths_pair_unique" UNIQUE("coach_user_id","athlete_user_id"),
	CONSTRAINT "coach_athlete_paths_status_check" CHECK ("coach_athlete_paths"."status" in ('active', 'closed')),
	CONSTRAINT "coach_athlete_paths_closed_complete" CHECK (("coach_athlete_paths"."status" = 'closed') = ("coach_athlete_paths"."closed_at" is not null)),
	CONSTRAINT "coach_athlete_paths_closed_role_check" CHECK ("coach_athlete_paths"."closed_by_role" is null or "coach_athlete_paths"."closed_by_role" in ('coach', 'athlete')),
	CONSTRAINT "coach_athlete_paths_distinct_people" CHECK ("coach_athlete_paths"."coach_user_id" <> "coach_athlete_paths"."athlete_user_id")
);
--> statement-breakpoint
CREATE TABLE "commitment_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"commitment_id" integer NOT NULL,
	"athlete_user_id" integer NOT NULL,
	"path_id" integer NOT NULL,
	"outcome" varchar(16) NOT NULL,
	"note" text,
	"occurred_on" date NOT NULL,
	"client_request_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"edited_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer NOT NULL,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "commitment_attempts_idempotency_unique" UNIQUE("commitment_id","client_request_id"),
	CONSTRAINT "commitment_attempts_outcome_check" CHECK ("commitment_attempts"."outcome" in ('provata', 'non_ancora', 'non_adatta')),
	CONSTRAINT "commitment_attempts_note_len" CHECK ("commitment_attempts"."note" is null or length(btrim("commitment_attempts"."note")) between 1 and 1000),
	CONSTRAINT "commitment_attempts_version_check" CHECK ("commitment_attempts"."version" >= 1),
	CONSTRAINT "commitment_attempts_edited_check" CHECK (("commitment_attempts"."version" > 1) = ("commitment_attempts"."edited_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "session_ai_audit_events" DROP CONSTRAINT "session_ai_audit_events_type_check";--> statement-breakpoint
ALTER TABLE "session_ai_commitments" ADD COLUMN "paused_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_ai_commitments" ADD COLUMN "paused_reason" text;--> statement-breakpoint
ALTER TABLE "session_ai_commitments" ADD COLUMN "paused_by" integer;--> statement-breakpoint
ALTER TABLE "coach_athlete_path_events" ADD CONSTRAINT "coach_athlete_path_events_path_id_coach_athlete_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."coach_athlete_paths"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athlete_path_events" ADD CONSTRAINT "coach_athlete_path_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athlete_path_events" ADD CONSTRAINT "coach_athlete_path_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athlete_paths" ADD CONSTRAINT "coach_athlete_paths_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athlete_paths" ADD CONSTRAINT "coach_athlete_paths_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athlete_paths" ADD CONSTRAINT "coach_athlete_paths_activation_booking_id_bookings_id_fk" FOREIGN KEY ("activation_booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athlete_paths" ADD CONSTRAINT "coach_athlete_paths_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athlete_paths" ADD CONSTRAINT "coach_athlete_paths_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_attempts" ADD CONSTRAINT "commitment_attempts_commitment_id_session_ai_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."session_ai_commitments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_attempts" ADD CONSTRAINT "commitment_attempts_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_attempts" ADD CONSTRAINT "commitment_attempts_path_id_coach_athlete_paths_id_fk" FOREIGN KEY ("path_id") REFERENCES "public"."coach_athlete_paths"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_attempts" ADD CONSTRAINT "commitment_attempts_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_attempts" ADD CONSTRAINT "commitment_attempts_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_athlete_path_events_path_idx" ON "coach_athlete_path_events" USING btree ("path_id","createddate");--> statement-breakpoint
CREATE INDEX "coach_athlete_paths_athlete_idx" ON "coach_athlete_paths" USING btree ("athlete_user_id","status");--> statement-breakpoint
CREATE INDEX "coach_athlete_paths_coach_idx" ON "coach_athlete_paths" USING btree ("coach_user_id","status");--> statement-breakpoint
CREATE INDEX "commitment_attempts_commitment_idx" ON "commitment_attempts" USING btree ("commitment_id","occurred_on");--> statement-breakpoint
CREATE INDEX "commitment_attempts_athlete_idx" ON "commitment_attempts" USING btree ("athlete_user_id","createddate");--> statement-breakpoint
CREATE INDEX "commitment_attempts_path_idx" ON "commitment_attempts" USING btree ("path_id","createddate");--> statement-breakpoint
ALTER TABLE "session_ai_commitments" ADD CONSTRAINT "session_ai_commitments_paused_by_users_id_fk" FOREIGN KEY ("paused_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_ai_audit_events" ADD CONSTRAINT "session_ai_audit_events_type_check" CHECK (event_type in ('feature_requested', 'consent_accepted', 'consent_rejected', 'consent_revoked', 'session_activated', 'session_cancelled', 'entitlement_denied', 'entitlement_granted', 'entitlement_trial_started', 'entitlement_revoked', 'status_transitioned', 'recording_start_requested', 'recording_started', 'recording_stop_requested', 'recording_recorded', 'recording_failed', 'recording_deletion_requested', 'recording_deleted', 'recording_deletion_failed', 'recording_reconciled', 'unverified_participant_blocked', 'participant_recording_grouped', 'processing_job_queued', 'processing_job_claimed', 'processing_job_completed', 'processing_job_failed', 'processing_job_cancelled', 'processing_job_recovered', 'compass_report_generated', 'compass_report_regenerated', 'compass_report_approved', 'compass_report_failed', 'compass_note_updated', 'compass_commitment_updated', 'commitment_synced', 'commitment_archived', 'commitment_updated_by_coach', 'commitment_updated_by_athlete', 'commitment_attempt_recorded', 'commitment_attempt_edited', 'commitment_paused_by_athlete', 'commitment_resumed_by_athlete'));--> statement-breakpoint
ALTER TABLE "session_ai_commitments" ADD CONSTRAINT "session_ai_commitments_paused_check" CHECK (("session_ai_commitments"."paused_at" is not null) or ("session_ai_commitments"."paused_reason" is null and "session_ai_commitments"."paused_by" is null));--> statement-breakpoint
ALTER TABLE "session_ai_commitments" ADD CONSTRAINT "session_ai_commitments_paused_reason_len" CHECK ("session_ai_commitments"."paused_reason" is null or length(btrim("session_ai_commitments"."paused_reason")) between 1 and 500);--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Nota sull'unico DROP di questa migrazione.
--
-- `session_ai_audit_events_type_check` viene sostituito con la stessa lista
-- piu' quattro valori: e' un **allargamento**. Nessuna riga esistente puo'
-- violarlo, e l'applicazione in esecuzione continua a scrivere gli stessi
-- eventi di prima. Tutto il resto qui e' additivo.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Row Level Security sulle tre tabelle nuove.
--
-- **Perche' sta qui e non e' lasciata all'automatismo.** Nel progetto Supabase
-- vive un event trigger, `ensure_rls`, che attiva RLS su ogni tabella creata in
-- `public`. Non e' in nessuna migrazione — e' stato aggiunto a mano — e la 0058
-- lo da' per esistente. L'effetto, se ci si appoggiasse a lui: queste tabelle
-- nascerebbero con RLS attiva e **zero policy**, cioe' invisibili alla Data API,
-- e nessun errore lo direbbe finche' qualcuno non prova a leggerle.
--
-- Attivarla qui, con le sue policy accanto, rende il comportamento identico in
-- produzione e sul database di prova, e lo mette dove si puo' leggere.
--
-- Le regole ricalcano quelle gia' in vigore per `session_ai_commitments`: sola
-- lettura per `authenticated`, scritture solo dal server. Gli helper stanno in
-- `app_private` dalla migrazione 0058.
-- ---------------------------------------------------------------------------

ALTER TABLE "coach_athlete_paths" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "coach_athlete_path_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "commitment_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Un percorso lo vedono le due persone che lo compongono, e l'amministratore.
CREATE POLICY "paths_select_participants_or_admin"
  ON "coach_athlete_paths"
  FOR SELECT TO authenticated
  USING (
    (SELECT app_private.current_app_user_is_admin())
    OR "coach_user_id" = (SELECT app_private.current_app_user_id())
    OR "athlete_user_id" = (SELECT app_private.current_app_user_id())
  );--> statement-breakpoint

-- Le transizioni seguono la visibilita' del percorso a cui appartengono: non
-- aggiungono informazione, raccontano quando quel percorso e' cambiato.
CREATE POLICY "path_events_select_with_path"
  ON "coach_athlete_path_events"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM "public"."coach_athlete_paths" p
      WHERE p."id" = "coach_athlete_path_events"."path_id"
        AND (
          (SELECT app_private.current_app_user_is_admin())
          OR p."coach_user_id" = (SELECT app_private.current_app_user_id())
          OR p."athlete_user_id" = (SELECT app_private.current_app_user_id())
        )
    )
  );--> statement-breakpoint

-- Una prova la vede sempre chi l'ha scritta.
--
-- Il coach la vede a tre condizioni, e sono la traduzione in SQL di tre
-- decisioni di prodotto: il percorso e' suo; l'atleta non ha revocato la
-- condivisione; la prova non e' stata tolta dalla vista. Scritte qui e non solo
-- nel dominio, cosi' un identificativo indovinato non basta a leggerle.
CREATE POLICY "attempts_select_author_coach_or_admin"
  ON "commitment_attempts"
  FOR SELECT TO authenticated
  USING (
    (SELECT app_private.current_app_user_is_admin())
    OR "athlete_user_id" = (SELECT app_private.current_app_user_id())
    OR EXISTS (
      SELECT 1 FROM "public"."coach_athlete_paths" p
      WHERE p."id" = "commitment_attempts"."path_id"
        AND p."coach_user_id" = (SELECT app_private.current_app_user_id())
        AND p."contributions_revoked_at" IS NULL
        AND "commitment_attempts"."hidden_at" IS NULL
    )
  );--> statement-breakpoint

GRANT SELECT ON "coach_athlete_paths" TO authenticated;--> statement-breakpoint
GRANT SELECT ON "coach_athlete_path_events" TO authenticated;--> statement-breakpoint
GRANT SELECT ON "commitment_attempts" TO authenticated;--> statement-breakpoint

-- Nessuna scrittura dal client: attivare un percorso, chiuderlo, registrare o
-- correggere una prova sono decisioni che passano dalle regole in `lib/core/`,
-- e una scrittura diretta le salterebbe tutte.
REVOKE INSERT, UPDATE, DELETE ON "coach_athlete_paths" FROM anon, authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "coach_athlete_path_events" FROM anon, authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "commitment_attempts" FROM anon, authenticated;--> statement-breakpoint

COMMENT ON TABLE "commitment_attempts" IS
  'Scritta solo dall''atleta. Le decisioni del coach vivono su session_ai_commitments.';--> statement-breakpoint
COMMENT ON COLUMN "commitment_attempts"."note" IS
  'Contenuto personale, spesso di minori. Mai in log, audit o prompt.';--> statement-breakpoint
COMMENT ON COLUMN "session_ai_commitments"."paused_at" IS
  'Pausa dichiarata dall''atleta. Ortogonale a status: non e'' completata ne'' abbandonata.';
