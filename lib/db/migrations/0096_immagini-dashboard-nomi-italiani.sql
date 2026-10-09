-- Le immagini della dashboard dell'atleta si chiamano come lo sport in
-- italiano, non come la sua chiave interna: `calcio-donna.webp`, non
-- `football-donna.webp`. È ciò che chi le prepara scrive spontaneamente, e il
-- collegamento vive in queste due colonne proprio per poter seguire i nomi
-- dei file invece di obbligare i file a seguire le chiavi.
--
-- Solo dati, sulle due colonne create da 0095 pochi minuti fa: nessuna
-- struttura cambia e nessun altro dato viene toccato. Per aggiungere o
-- rinominare un'immagine in futuro basta aggiornare la riga dello sport.
UPDATE "sports" AS s
SET "hero_image_male"   = '/athlete-hero/' || v.slug || '-uomo.webp',
    "hero_image_female" = '/athlete-hero/' || v.slug || '-donna.webp'
FROM (VALUES
  ('football',     'calcio'),
  ('basketball',   'basket'),
  ('volleyball',   'pallavolo'),
  ('tennis',       'tennis'),
  ('swimming',     'nuoto'),
  ('athletics',    'atletica'),
  ('cycling',      'ciclismo'),
  ('martial_arts', 'arti-marziali'),
  ('golf',         'golf'),
  ('skiing',       'sci'),
  ('rugby',        'rugby'),
  ('motorsport',   'motori'),
  ('curling',      'curling'),
  ('crossfit',     'crossfit'),
  ('other',        'altro')
) AS v(key, slug)
WHERE s."key" = v.key;
