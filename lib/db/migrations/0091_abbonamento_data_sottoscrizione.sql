-- La data in cui un abbonamento è stato sottoscritto, per mostrarla all'atleta.
--
-- Non basta `created_at`: la riga nasce quando si apre il pagamento, e un
-- pagamento aperto può essere pagato dopo, o mai. `subscribed_at` lo scrive il
-- webhook la prima volta che Stripe conferma l'abbonamento, e poi non si
-- sposta. Per le righe già esistenti resta vuoto: la pagina ripiega su
-- `created_at`, senza riscrivere dati. Solo ADD COLUMN, nessun UPDATE.

ALTER TABLE "plan_subscriptions" ADD COLUMN "subscribed_at" timestamp with time zone;