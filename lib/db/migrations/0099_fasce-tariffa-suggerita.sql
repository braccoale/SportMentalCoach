-- Le fasce della tariffa oraria suggerita ai coach (lib/core/rate-suggestion)
-- come parametri di sistema: l'admin le cambia da «Configurazione di sistema»
-- senza rilasciare codice.
--
-- Quindici numeri: per ognuno dei quattro livelli (Avvio, Consolidato, Esperto,
-- Senior) il minimo, il massimo e il suggerito, in euro per 60 minuti, e le tre
-- soglie di punteggio per entrare in Consolidato, Esperto e Senior. I valori
-- iniziali sono quelli già in uso nel codice, quindi nulla cambia per i coach.
--
-- Il codice usa comunque i predefiniti se una riga manca o se l'insieme non e'
-- coerente (min <= suggerito <= max, soglie e fasce crescenti): una modifica
-- sbagliata non produce fasce a meta'.
--
-- Additiva: solo INSERT, nessuna modifica di schema; ON CONFLICT DO NOTHING la
-- rende ripetibile.
INSERT INTO "public"."system_config" ("key", "value", "value_type", "category", "label", "description") VALUES
  ('RATE_AVVIO_MIN', '40'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Avvio: minimo (€/ora)', 'Limite basso della fascia oraria del livello Avvio, in euro per 60 minuti.'),
  ('RATE_AVVIO_MAX', '60'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Avvio: massimo (€/ora)', 'Limite alto della fascia oraria del livello Avvio, in euro per 60 minuti.'),
  ('RATE_AVVIO_SUGGESTED', '50'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Avvio: prezzo suggerito (€/ora)', 'Prezzo consigliato al coach del livello Avvio, in euro per 60 minuti. Deve stare fra minimo e massimo.'),
  ('RATE_CONSOLIDATO_MIN', '55'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Consolidato: minimo (€/ora)', 'Limite basso della fascia oraria del livello Consolidato, in euro per 60 minuti.'),
  ('RATE_CONSOLIDATO_MAX', '80'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Consolidato: massimo (€/ora)', 'Limite alto della fascia oraria del livello Consolidato, in euro per 60 minuti.'),
  ('RATE_CONSOLIDATO_SUGGESTED', '65'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Consolidato: prezzo suggerito (€/ora)', 'Prezzo consigliato al coach del livello Consolidato, in euro per 60 minuti. Deve stare fra minimo e massimo.'),
  ('RATE_CONSOLIDATO_MIN_SCORE', '30'::jsonb, 'number', 'tariffe', 'Tariffa suggerita: punteggio per il livello Consolidato', 'Punteggio minimo (da 1 a 100) per entrare nel livello Consolidato. Le soglie devono crescere da un livello al successivo.'),
  ('RATE_ESPERTO_MIN', '75'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Esperto: minimo (€/ora)', 'Limite basso della fascia oraria del livello Esperto, in euro per 60 minuti.'),
  ('RATE_ESPERTO_MAX', '110'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Esperto: massimo (€/ora)', 'Limite alto della fascia oraria del livello Esperto, in euro per 60 minuti.'),
  ('RATE_ESPERTO_SUGGESTED', '90'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Esperto: prezzo suggerito (€/ora)', 'Prezzo consigliato al coach del livello Esperto, in euro per 60 minuti. Deve stare fra minimo e massimo.'),
  ('RATE_ESPERTO_MIN_SCORE', '55'::jsonb, 'number', 'tariffe', 'Tariffa suggerita: punteggio per il livello Esperto', 'Punteggio minimo (da 1 a 100) per entrare nel livello Esperto. Le soglie devono crescere da un livello al successivo.'),
  ('RATE_SENIOR_MIN', '100'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Senior: minimo (€/ora)', 'Limite basso della fascia oraria del livello Senior, in euro per 60 minuti.'),
  ('RATE_SENIOR_MAX', '150'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Senior: massimo (€/ora)', 'Limite alto della fascia oraria del livello Senior, in euro per 60 minuti.'),
  ('RATE_SENIOR_SUGGESTED', '120'::jsonb, 'number', 'tariffe', 'Tariffa suggerita, livello Senior: prezzo suggerito (€/ora)', 'Prezzo consigliato al coach del livello Senior, in euro per 60 minuti. Deve stare fra minimo e massimo.'),
  ('RATE_SENIOR_MIN_SCORE', '75'::jsonb, 'number', 'tariffe', 'Tariffa suggerita: punteggio per il livello Senior', 'Punteggio minimo (da 1 a 100) per entrare nel livello Senior. Le soglie devono crescere da un livello al successivo.')
ON CONFLICT ("key") DO NOTHING;
