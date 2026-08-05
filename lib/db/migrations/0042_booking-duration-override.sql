-- bookings.duration_min: la durata concordata per LA SINGOLA sessione.
--
-- Finora la durata di un appuntamento era interamente derivata dal servizio
-- (`services.duration_min`). Funziona per le richieste che partono dall'atleta,
-- che sceglie "il servizio da 50 minuti", ma non per il coach: quando è lui a
-- fissare la sessione decide caso per caso quanto durerà, e lo stesso servizio
-- può valere 30 minuti con un atleta e 60 con un altro.
--
-- La colonna è un override, non un rimpiazzo: resta NULL per tutte le
-- prenotazioni esistenti e per quelle create dall'atleta, e in quel caso la
-- durata continua a leggersi dal servizio. Ogni punto che calcola la fine di una
-- sessione (conflitti, fasce occupate, calendario, email) usa quindi
-- `coalesce(bookings.duration_min, services.duration_min, default)`.
--
-- Additiva e retrocompatibile: il codice precedente ignora semplicemente la
-- colonna.

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "duration_min" integer;
