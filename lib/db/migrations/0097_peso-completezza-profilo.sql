-- Nuovo parametro di sistema: quanto pesa la completezza del profilo di un coach
-- nell'ordine dell'elenco dei coach (vista di default, «per attività»).
--
-- È una percentuale da 0 a 100: l'ordine è `(100 - p)% attività + p% completezza`,
-- dove l'attività sono le ore di coaching fatte, gli atleti seguiti e le
-- valutazioni. A 0 l'ordine torna quello di sempre (minuti, poi atleti).
-- Valore iniziale 20: aiuta chi parte e fa da spareggio, ma un coach nuovo con
-- il profilo perfetto non scavalca uno con molte sedute e buone recensioni. Il
-- codice usa 20 anche se la riga manca o contiene un valore non valido.
--
-- Additiva: solo INSERT, nessuna modifica di schema.
INSERT INTO "public"."system_config" ("key", "value", "value_type", "category", "label", "description") VALUES
  ('DISCOVERY_COMPLETENESS_WEIGHT', '20'::jsonb, 'number', 'ricerca', 'Peso della completezza del profilo nell''elenco dei coach (%)', 'Quanto conta il profilo completo nell''ordine di default dell''elenco dei coach. Intero da 0 a 100: a 0 conta solo l''attività (ore di coaching, atleti seguiti, valutazioni), a 100 solo la completezza. Valore consigliato: 20.')
ON CONFLICT ("key") DO NOTHING;
