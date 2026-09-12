-- La descrizione scritta in 0070 descriveva un blocco ("né l'atleta né il
-- coach possono più cancellare"): quella era la prima versione della regola,
-- poi cambiata prima del rilascio (vedi 0071_late-cancellation-flag.sql) — la
-- cancellazione resta sempre permessa, sotto il preavviso viene solo marcata
-- come tardiva (conta come sessione consumata). Solo testo mostrato nel
-- pannello admin: nessun valore cambia.
UPDATE "public"."system_config"
SET "description" = 'Sotto questa soglia, a ridosso dell''orario previsto, la cancellazione resta permessa ma viene marcata come tardiva: la sessione conta comunque come effettuata (utile per i pacchetti di sessioni). A 0 non marca mai nulla.'
WHERE "key" = 'BOOKING_CANCELLATION_MIN_NOTICE_MINUTES';
