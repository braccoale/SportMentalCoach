-- Frase breve e "consigliato" sui piani dei coach, per la scheda dell'atleta.
--
-- Entrambi li sceglie il coach: sono la sua voce («Ideale per iniziare»), non
-- una nostra etichetta. Al massimo un piano consigliato per coach, e lo impone
-- un indice parziale: due «consigliato» sullo stesso coach sono rifiutati da
-- Postgres anche se il codice se ne dimentica. Solo ADD COLUMN con valore
-- predefinito: nessun piano esistente cambia.

ALTER TABLE "coach_session_plans" ADD COLUMN "description" varchar(120);--> statement-breakpoint
ALTER TABLE "coach_session_plans" ADD COLUMN "is_recommended" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_session_plans_one_recommended_idx" ON "coach_session_plans" USING btree ("coach_user_id") WHERE "coach_session_plans"."is_recommended";