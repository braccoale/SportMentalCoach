-- Nuovo parametro di sistema: preavviso minimo per cancellare una prenotazione,
-- uguale per atleta e coach (vedi lib/core/sessions.ts,
-- isWithinCancellationNotice, e lib/core/bookings/index.ts, cancelBooking).
-- Prima di questa modifica non esisteva alcuna finestra: si poteva cancellare
-- fino a sessione conclusa. Valore iniziale 0 = nessun blocco reale, a parità
-- con il comportamento di prima: si alza dal pannello admin quando si decide
-- la soglia effettiva. Additiva: solo INSERT, nessuna modifica di schema.
INSERT INTO "public"."system_config" ("key", "value", "value_type", "category", "label", "description") VALUES
  ('BOOKING_CANCELLATION_MIN_NOTICE_MINUTES', '0'::jsonb, 'number', 'prenotazioni', 'Preavviso minimo per cancellare (minuti)', 'Sotto questa soglia, a ridosso dell''orario previsto, né l''atleta né il coach possono più cancellare la sessione. A 0 non blocca nulla.');
