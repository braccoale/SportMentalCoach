-- Nuovo parametro di sistema: quanti giorni in avanti si può prenotare
-- (vedi lib/core/availability/index.ts, getBookableDays, opts.daysAhead).
-- Prima di questa modifica il valore era fisso a 21 giorni nel codice, uguale
-- per web e app: oggi arrivava solo ai primi giorni del mese successivo, mai
-- a un mese intero più in là. Valore iniziale 90 (~3 mesi): si alza o abbassa
-- dal pannello admin senza deploy. Additiva: solo INSERT, nessuna modifica di
-- schema.
INSERT INTO "public"."system_config" ("key", "value", "value_type", "category", "label", "description") VALUES
  ('AVAILABILITY_BOOKING_DAYS_AHEAD', '90'::jsonb, 'number', 'prenotazioni', 'Prenotabile fino a (giorni da oggi)', 'Quanti giorni in avanti un atleta o un coach possono fissare una sessione. Vale sia per il web sia per l''app.');
