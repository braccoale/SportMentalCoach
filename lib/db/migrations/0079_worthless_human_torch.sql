-- Descrizione opzionale di una sessione Academy (es. agenda, note per i
-- partecipanti) — puramente informativa, non usata da nessuna regola.

ALTER TABLE "academy_sessions" ADD COLUMN "description" text;