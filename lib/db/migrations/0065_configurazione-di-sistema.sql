-- Costanti di business configurabili dall'admin senza deploy (vedi
-- docs/superpowers/specs/2026-09-08-configurazione-di-sistema-design.md).
-- Nessun client la legge direttamente: solo il server, tramite
-- lib/core/config/ per la lettura e requireRole('admin') per la scrittura.
CREATE TABLE "system_config" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"value_type" varchar(20) NOT NULL,
	"category" varchar(60) NOT NULL,
	"label" varchar(200) NOT NULL,
	"description" text,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "system_config_value_type_check" CHECK ("system_config"."value_type" in ('number', 'string', 'boolean')),
	CONSTRAINT "system_config_value_matches_type_check" CHECK (jsonb_typeof("system_config"."value") = "system_config"."value_type")
);
--> statement-breakpoint
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

REVOKE ALL ON "public"."system_config" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "system_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

INSERT INTO "public"."system_config" ("key", "value", "value_type", "category", "label", "description") VALUES
  ('CONTACT_MAX_MESSAGES_PER_EMAIL_PER_HOUR', '3'::jsonb, 'number', 'contatti', 'Limite messaggi per ora', 'Quanti messaggi accettiamo dallo stesso indirizzo email in un''ora, nel form contatti.'),
  ('AI_NOTES_AUDIO_RETENTION_DAYS', '7'::jsonb, 'number', 'ai_notes', 'Ritenzione audio (giorni)', 'Giorni di conservazione della registrazione audio grezza mostrati nella privacy policy. Non applica davvero la cancellazione: quella resta su una variabile d''ambiente separata.'),
  ('CANCELLATION_NOTICE_HOURS', '24'::jsonb, 'number', 'prenotazioni', 'Preavviso di cancellazione (ore)', 'Ore di preavviso indicate nei Termini per annullare una sessione senza che conti come mancata presentazione. Solo testo: nessun controllo lo applica oggi.'),
  ('AI_NOTES_ADMIN_TRIAL_DAYS', '30'::jsonb, 'number', 'ai_notes', 'Durata trial concesso da un admin (giorni)', 'Giorni di trial per gli Appunti AI quando un admin lo concede manualmente a un utente.');