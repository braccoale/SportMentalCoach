-- Gli obiettivi del percorso, scritti dal coach.
--
-- Perche' una tabella nuova e non `client_profiles.goals`: quello e' un solo
-- campo di testo libero, scritto dall'atleta in fase di registrazione, e dice
-- "cosa vorrei". Questo dice altro — su che cosa io coach sto lavorando con
-- questa persona, in che stato e' ciascun filone, e quando l'ho aggiornato.
-- Sono piu' obiettivi, hanno uno stato che cambia nel tempo, e appartengono
-- alla relazione fra un coach e un atleta, non al profilo dell'atleta.
--
-- Perche' lo stato lo mette il coach e non l'AI: la Mental Journey e' una
-- proiezione che dichiara di non attribuire miglioramenti ne' cause. Far
-- decidere a un modello che un atleta e' "in miglioramento" sarebbe
-- esattamente quello. Qui il giudizio ha un autore, ed e' una persona.
CREATE TABLE "athlete_journey_goals" (
  "id" serial PRIMARY KEY NOT NULL,
  "athlete_user_id" integer NOT NULL,
  "coach_user_id" integer NOT NULL,
  "title" varchar(160) NOT NULL,
  -- L'obiettivo principale del percorso. Ne esiste al piu' uno per coppia
  -- coach/atleta, garantito dall'indice parziale piu' sotto.
  "is_primary" boolean DEFAULT false NOT NULL,
  -- in_corso | in_miglioramento | da_riprendere | raggiunto
  "status" varchar(24) DEFAULT 'in_corso' NOT NULL,
  -- Il tema del Session Compass a cui l'obiettivo e' agganciato, quando c'e'.
  -- Serve a disegnare in quali sedute l'obiettivo e' stato toccato davvero,
  -- invece di chiederlo al coach seduta per seduta. Nullo e' legittimo: un
  -- obiettivo puo' esistere prima che l'AI ne veda traccia.
  "theme_key" varchar(120),
  "position" integer DEFAULT 0 NOT NULL,
  -- Archiviato invece che cancellato: un obiettivo chiuso fa parte della
  -- storia del percorso.
  "archived_at" timestamp with time zone,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer,
  "updateddate" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedby" integer
);--> statement-breakpoint

ALTER TABLE "athlete_journey_goals"
  ADD CONSTRAINT "athlete_journey_goals_athlete_user_id_users_id_fk"
  FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "athlete_journey_goals"
  ADD CONSTRAINT "athlete_journey_goals_coach_user_id_users_id_fk"
  FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "athlete_journey_goals"
  ADD CONSTRAINT "athlete_journey_goals_createdby_users_id_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "athlete_journey_goals"
  ADD CONSTRAINT "athlete_journey_goals_updatedby_users_id_fk"
  FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- La lettura e' sempre "gli obiettivi di questo atleta con questo coach".
CREATE INDEX "athlete_journey_goals_pair_idx"
  ON "athlete_journey_goals" ("coach_user_id","athlete_user_id");--> statement-breakpoint

-- Un solo obiettivo principale per percorso, e solo fra quelli attivi.
CREATE UNIQUE INDEX "athlete_journey_goals_one_primary_idx"
  ON "athlete_journey_goals" ("coach_user_id","athlete_user_id")
  WHERE "is_primary" AND "archived_at" IS NULL;--> statement-breakpoint

ALTER TABLE "athlete_journey_goals" ENABLE ROW LEVEL SECURITY;
