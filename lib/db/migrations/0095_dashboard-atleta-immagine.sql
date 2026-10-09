-- L'immagine in alto nella dashboard dell'atleta cambia con lo sport e con il
-- genere. Servono tre cose, tutte additive e nullable: nessun dato esistente
-- cambia.
--
--  1. `client_profiles.gender`: il genere dichiarato, facoltativo. Tre valori
--     (`male`, `female`, `undisclosed`) tenuti da un CHECK, così un valore
--     inventato da un modulo manomesso viene respinto dal database oltre che
--     dal codice. Serve solo a scegliere l'immagine: non entra in nessuna
--     regola di accesso, di prezzo o di abbinamento.
--  2. `sports.hero_image_male` / `hero_image_female`: il collegamento a due
--     immagini per sport (percorsi interni in `/athlete-hero/`).
--  3. Un riempimento iniziale con il nome convenzionale
--     `/athlete-hero/<sport>-uomo.webp` e `-donna.webp`. Se il file non
--     esiste ancora, la pagina passa all'immagine di riserva: non si rompe
--     niente, e basta mettere il file nella cartella perché compaia.
ALTER TABLE "client_profiles"
  ADD COLUMN "gender" varchar(16),
  ADD CONSTRAINT "client_profiles_gender_check"
    CHECK ("gender" IS NULL OR "gender" IN ('male', 'female', 'undisclosed'));

ALTER TABLE "sports"
  ADD COLUMN "hero_image_male" text,
  ADD COLUMN "hero_image_female" text;

UPDATE "sports"
SET "hero_image_male"   = '/athlete-hero/' || "key" || '-uomo.webp',
    "hero_image_female" = '/athlete-hero/' || "key" || '-donna.webp'
WHERE "hero_image_male" IS NULL AND "hero_image_female" IS NULL;
