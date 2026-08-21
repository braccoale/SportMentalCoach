-- In quali sedute un obiettivo del percorso e' stato toccato.
--
-- Perche' una tabella e non la chiave del tema sull'obiettivo, come prima.
--
-- I temi il dominio li indicizza normalizzando la **frase intera** scritta nel
-- riepilogo, e quella frase la scrive un modello: cambia formulazione di
-- seduta in seduta. Un aggancio che dipende da due frasi identiche e' un
-- aggancio che si scollega da solo, e quando si scollega non lo dice: la
-- traccia dell'obiettivo diventa una fila di pallini vuoti, che si legge come
-- "non ci abbiamo piu' lavorato" invece che come "il collegamento si e' rotto".
--
-- Qui il legame e' un fatto scritto una volta: la seduta X ha toccato
-- l'obiettivo Y. Una riformulazione successiva non cancella la storia.
CREATE TABLE "athlete_journey_goal_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "goal_id" integer NOT NULL,
  "session_ai_notes_id" integer NOT NULL,
  -- 'theme' quando l'aggancio nasce dal tema ricorrente del Compass,
  -- 'coach' quando lo segna una persona. Serve a sapere di chi fidarsi
  -- quando i due non concordano.
  "source" varchar(16) DEFAULT 'theme' NOT NULL,
  "createddate" timestamp with time zone DEFAULT now() NOT NULL,
  "createdby" integer
);--> statement-breakpoint

ALTER TABLE "athlete_journey_goal_sessions"
  ADD CONSTRAINT "athlete_journey_goal_sessions_goal_id_fk"
  FOREIGN KEY ("goal_id") REFERENCES "public"."athlete_journey_goals"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "athlete_journey_goal_sessions"
  ADD CONSTRAINT "athlete_journey_goal_sessions_session_fk"
  FOREIGN KEY ("session_ai_notes_id") REFERENCES "public"."session_ai_notes"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "athlete_journey_goal_sessions"
  ADD CONSTRAINT "athlete_journey_goal_sessions_createdby_users_id_fk"
  FOREIGN KEY ("createdby") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- Una seduta tocca un obiettivo una volta sola: il riaggancio automatico gira
-- a ogni approvazione e non deve moltiplicare le righe.
CREATE UNIQUE INDEX "athlete_journey_goal_sessions_unique"
  ON "athlete_journey_goal_sessions" ("goal_id","session_ai_notes_id");--> statement-breakpoint

CREATE INDEX "athlete_journey_goal_sessions_goal_idx"
  ON "athlete_journey_goal_sessions" ("goal_id");--> statement-breakpoint

ALTER TABLE "athlete_journey_goal_sessions" ENABLE ROW LEVEL SECURITY;
