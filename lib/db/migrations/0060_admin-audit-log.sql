-- Il registro delle azioni amministrative.
--
-- Perche' una tabella nuova e non `session_ai_audit_events`: quella e'
-- ancorata a una seduta (`session_ai_notes_id`) e il suo CHECK enumera eventi
-- della pipeline. Approvare un coach, cambiare un ruolo, esportare dati non
-- appartengono a nessuna seduta, e infilarli li' significherebbe una colonna
-- nullable in piu' e un elenco di eventi che mescola due domini. Restano due
-- registri distinti, con due domande distinte: «cosa e' successo a questa
-- seduta» e «cosa ha fatto un amministratore».
--
-- Perche' esiste: finora nessuna azione amministrativa lasciava traccia.
-- L'approvazione di un coach scriveva `reviewed_by` sul profilo — l'ultimo
-- che ha deciso, non la storia — e la revoca di Appunti AI non scriveva
-- niente. A distanza di sei mesi non c'era modo di sapere chi avesse tolto
-- una funzione a un utente, ne' quando.
--
-- Append-only, e non solo per convenzione. Il trigger piu' sotto rifiuta
-- UPDATE e DELETE: un registro che si puo' correggere non prova niente, ed e'
-- proprio la riga scomoda quella che si e' tentati di correggere.
--
-- Nessun contenuto, nessun segreto. In `detail` entrano identificativi,
-- conteggi, esiti e codici — la stessa regola non negoziabile di
-- `pipeline-log.ts`. Un registro amministrativo che contiene una frase di
-- seduta e' una fuga di dati sanitari con un nome rassicurante.
--
-- Nota per chi rigenera: questa migrazione e' scritta a mano, ma lo snapshot
-- 0060_snapshot.json e' allegato e allineato — `npm run db:generate` subito
-- dopo risponde "No schema changes". Senza quello snapshot la generazione
-- successiva avrebbe riproposto un CREATE TABLE per una tabella gia'
-- esistente, che e' esattamente la trappola che la 0059 documenta.
-- Leggere comunque sempre l'SQL prima di applicarlo.

CREATE TABLE "admin_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  -- Chi ha agito. Nullable perche' un amministratore cancellato non deve
  -- portarsi via il registro delle sue decisioni: resta la riga, si perde il
  -- riferimento.
  "actor_user_id" integer,
  -- Denormalizzata di proposito: se l'utente sparisce, «chi era» deve
  -- restare leggibile. E' l'unico dato personale qui dentro, ed e' quello di
  -- un amministratore che agisce in veste professionale.
  "actor_email" varchar(255),
  "action" varchar(60) NOT NULL,
  "subject_type" varchar(40) NOT NULL,
  -- L'oggetto dell'azione: id del profilo coach, dell'utente, della seduta.
  "subject_id" integer,
  -- ok | rifiutata | fallita. Un tentativo respinto e' informazione: e' il
  -- caso in cui qualcuno ha provato a fare qualcosa che non poteva fare.
  "outcome" varchar(16) DEFAULT 'ok' NOT NULL,
  -- Solo identificativi, conteggi, codici. Mai contenuti, mai segreti.
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "admin_audit_events"
  ADD CONSTRAINT "admin_audit_events_actor_user_id_users_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Insieme chiuso, come per gli eventi di seduta: un'azione nuova richiede una
-- migrazione, che e' il momento giusto per chiedersi se serva davvero.
ALTER TABLE "admin_audit_events"
  ADD CONSTRAINT "admin_audit_events_action_check"
  CHECK ("action" IN (
    'coach_approved',
    'coach_rejected',
    'coach_verification_changed',
    'user_role_changed',
    'ai_notes_entitlement_granted',
    'ai_notes_entitlement_revoked',
    'ai_notes_session_reopened',
    'ai_notes_worker_run',
    'ai_notes_guidelines_saved',
    'ai_notes_callback_probed',
    'sensitive_content_accessed',
    'data_exported',
    'data_deleted',
    'configuration_changed'
  ));--> statement-breakpoint

ALTER TABLE "admin_audit_events"
  ADD CONSTRAINT "admin_audit_events_subject_type_check"
  CHECK ("subject_type" IN (
    'provider_profile',
    'user',
    'ai_session',
    'feature',
    'configuration',
    'system'
  ));--> statement-breakpoint

ALTER TABLE "admin_audit_events"
  ADD CONSTRAINT "admin_audit_events_outcome_check"
  CHECK ("outcome" IN ('ok', 'rifiutata', 'fallita'));--> statement-breakpoint

-- La lettura predefinita e' «le ultime cose successe»: e' l'unica query che
-- si fa sempre, e senza indice diventa una scansione completa il giorno in
-- cui il registro conta qualcosa.
CREATE INDEX "admin_audit_events_created_idx"
  ON "admin_audit_events" ("createddate" DESC);--> statement-breakpoint

-- «Chi ha toccato questo coach», «cosa ha fatto questo amministratore»: le
-- due domande che si fanno quando qualcosa e' andato storto.
CREATE INDEX "admin_audit_events_subject_idx"
  ON "admin_audit_events" ("subject_type", "subject_id", "createddate" DESC);--> statement-breakpoint

CREATE INDEX "admin_audit_events_actor_idx"
  ON "admin_audit_events" ("actor_user_id", "createddate" DESC);--> statement-breakpoint

CREATE INDEX "admin_audit_events_action_idx"
  ON "admin_audit_events" ("action", "createddate" DESC);--> statement-breakpoint

-- Append-only imposto dal database, non dalla buona volonta' del codice.
--
-- `SET search_path = ''` e SECURITY INVOKER come tutte le funzioni irrobustite
-- dalla migrazione 0058: una funzione con search_path mutabile e' un vettore
-- di dirottamento, e questa gira su ogni scrittura del registro.
CREATE OR REPLACE FUNCTION "app_private"."admin_audit_events_append_only"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_events e'' append-only: % non e'' consentito', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "app_private"."admin_audit_events_append_only"()
FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint

CREATE TRIGGER "admin_audit_events_no_update"
  BEFORE UPDATE OR DELETE ON "admin_audit_events"
  FOR EACH ROW EXECUTE FUNCTION "app_private"."admin_audit_events_append_only"();--> statement-breakpoint

-- Contiene la storia delle decisioni amministrative: nessun client la legge.
-- Ci arriva solo il server, e solo dopo `requireRole('admin')`.
ALTER TABLE "admin_audit_events" ENABLE ROW LEVEL SECURITY;
