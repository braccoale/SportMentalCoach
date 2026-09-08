-- Catalogo feature: una riga nasce solo quando uno sviluppatore collega una
-- funzionalità reale al codice (vedi
-- docs/superpowers/specs/2026-09-07-matrice-funzionalita-piani-design.md).
-- Nessun client la legge direttamente: stessa postura delle altre tabelle
-- di questa area (migrazione precedente, pacchetti/organizzazioni).

CREATE TABLE "features" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(80) NOT NULL,
	"label" varchar(120) NOT NULL,
	"description" text,
	"type" varchar(20) DEFAULT 'boolean' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "features_code_unique" UNIQUE("code"),
	CONSTRAINT "features_type_check" CHECK ("features"."type" in ('boolean', 'numeric'))
);
--> statement-breakpoint

INSERT INTO "features" ("code", "label", "description", "type", "sort_order")
VALUES (
  'AI_SESSION_NOTES',
  'Appunti AI',
  'Registrazione, trascrizione e riepilogo AI delle sedute.',
  'boolean',
  0
);--> statement-breakpoint

ALTER TABLE "package_features" ADD COLUMN "value" integer;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "features" ADD CONSTRAINT "features_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_features" ADD CONSTRAINT "package_features_feature_code_features_code_fk" FOREIGN KEY ("feature_code") REFERENCES "public"."features"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

REVOKE ALL ON "public"."features" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."features_id_seq" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "features" ENABLE ROW LEVEL SECURITY;