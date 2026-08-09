-- Le linee guida KaiPai per il riepilogo sessione.
--
-- Sono il metodo della casa: come si guarda una seduta, che cosa conta, con
-- che tono si scrive. Vivono nel prodotto e non nel codice perché l'academy
-- le farà evolvere, e ogni modifica non deve passare da un deploy.
--
-- Ogni salvataggio crea una riga nuova invece di sovrascrivere. Non è
-- prudenza generica: il riepilogo di una seduta è stato scritto con una certa
-- versione delle linee guida, e fra sei mesi deve restare possibile sapere
-- quale. Senza storico, un report approvato diventa irripetibile.
CREATE TABLE "ai_prompt_guidelines" (
  "id" serial PRIMARY KEY NOT NULL,
  "version" integer NOT NULL,
  "body" text NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  CONSTRAINT "ai_prompt_guidelines_version_unique" UNIQUE ("version"),
  CONSTRAINT "ai_prompt_guidelines_version_check" CHECK ("version" > 0)
);--> statement-breakpoint

ALTER TABLE "ai_prompt_guidelines"
  ADD CONSTRAINT "ai_prompt_guidelines_createdby_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Si legge sempre l'ultima: l'indice serve a quella lettura e a nient'altro.
CREATE INDEX "ai_prompt_guidelines_version_idx"
  ON "ai_prompt_guidelines" ("version" DESC);
