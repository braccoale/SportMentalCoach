-- Il genere dichiarato del coach, facoltativo: serve a una cosa sola, scegliere
-- l'immagine in alto nella sua dashboard (coach-uomo / coach-donna), come già
-- per l'atleta (migrazione 0095). Non entra in nessuna regola di accesso, di
-- ordinamento o di abbinamento, e non si mostra sul profilo pubblico.
--
-- Additiva e nullable: nessun dato esistente cambia, e chi non lo dichiara
-- continua a vedere un'immagine scelta a sorte. Tre valori (`male`, `female`,
-- `undisclosed`) tenuti da un CHECK, come per `client_profiles.gender`.
ALTER TABLE "provider_profiles"
  ADD COLUMN "gender" varchar(16),
  ADD CONSTRAINT "provider_profiles_gender_check"
    CHECK ("gender" IS NULL OR "gender" IN ('male', 'female', 'undisclosed'));
