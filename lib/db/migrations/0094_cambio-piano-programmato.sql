-- Cambio piano dal prossimo rinnovo, senza calcolo proporzionale.
--
-- Il cambio non tocca subito l'abbonamento: su Stripe si programma una seconda
-- fase che parte al rinnovo, e qui si ricorda *quale* piano arriverà e *quale*
-- programmazione lo porta, così la scheda dell'atleta può dire «dal 7 dicembre
-- passi a …» e annullare il cambio rilasciando quella programmazione.
--
-- Solo colonne nuove e nullable: nessun dato esistente cambia. Il piano in
-- arrivo si cancella da solo se il coach elimina il piano (SET NULL); la
-- programmazione su Stripe resta e il webhook la riconosce come estranea.
ALTER TABLE "plan_subscriptions"
  ADD COLUMN "pending_plan_id" integer REFERENCES "coach_session_plans"("id") ON DELETE SET NULL,
  ADD COLUMN "pending_schedule_id" varchar(255);
