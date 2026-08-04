-- email_templates: separare il CONTENUTO dalla PRESENTAZIONE.
--
-- La v1 memorizzava in `html_body` markup già stilizzato (`<p style="...">`).
-- Funzionava, ma metteva la presentazione dentro il database: un restyling del
-- layout avrebbe richiesto di migrare il contenuto di ogni template, e ogni
-- riga poteva introdurre markup arbitrario nel corpo dell'email.
--
-- Con queste colonne il database contiene solo prosa e il codice decide come
-- appare: `lib/core/email/layout.ts` compone eyebrow, titolo, paragrafi, card
-- dei dettagli, CTA e footer.
--
--   eyebrow  sopratitolo breve e maiuscolo, es. "NUOVA RICHIESTA"
--   title    titolo dell'email, es. "Hai ricevuto una richiesta di sessione"
--   outro    chiusura dopo la CTA: cosa fare, avvertenze
--
-- `html_body` continua a esistere e mantiene il significato di "corpo del
-- messaggio". Dalla v2 contiene paragrafi separati da una riga vuota, non
-- markup: il layout li avvolge nei tag stilizzati. I template v1 restano
-- leggibili e validi, perciò la migrazione non tocca alcuna riga esistente.
--
-- Tutte le colonne sono nullable: nessun default da riempire, nessuna riscrittura
-- dei dati. Additiva, idempotente, non distruttiva.

ALTER TABLE "public"."email_templates"
  ADD COLUMN IF NOT EXISTS "eyebrow" text;--> statement-breakpoint

ALTER TABLE "public"."email_templates"
  ADD COLUMN IF NOT EXISTS "title" text;--> statement-breakpoint

ALTER TABLE "public"."email_templates"
  ADD COLUMN IF NOT EXISTS "outro" text;
