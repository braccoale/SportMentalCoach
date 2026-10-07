-- Nuovo parametro di sistema: per quanti giorni vale una seduta acquistata a
-- parte (seduta singola o extra), contati dal pagamento. Prima era un numero
-- scritto nel codice (60): ora si cambia dal pannello admin, senza rilascio.
-- Vale per le sedute acquistate DA ORA: ognuna ha già la propria scadenza
-- scritta in `session_credits.expires_at`, che una modifica non tocca.
-- Valore iniziale 60, a parità con il comportamento di prima. Il codice usa 60
-- anche se la riga manca o contiene un valore non valido (intero da 1 a 365).
-- Additiva: solo INSERT, nessuna modifica di schema.
INSERT INTO "public"."system_config" ("key", "value", "value_type", "category", "label", "description") VALUES
  ('BILLING_SINGLE_SESSION_VALIDITY_DAYS', '60'::jsonb, 'number', 'pagamenti', 'Validità di una seduta acquistata a parte (giorni)', 'Per quanti giorni, dal pagamento, si può prenotare una sessione singola o una seduta extra. Vale per gli acquisti futuri: le sedute già acquistate mantengono la loro scadenza. Intero da 1 a 365.')
ON CONFLICT ("key") DO NOTHING;
