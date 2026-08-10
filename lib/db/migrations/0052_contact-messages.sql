-- I messaggi che arrivano dal form "Contatti" della landing.
--
-- Perche' una tabella e non solo una mail: se Resend e' giu', se la chiave
-- scade o se l'indirizzo di destinazione cambia, una richiesta di contatto
-- non deve sparire. La riga viene scritta prima dell'invio; la mail e' una
-- notifica, non il registro.
--
-- E poi c'e' la spunta privacy. Chiedere il consenso e non conservarne traccia
-- non serve a niente: qui restano il consenso, il momento esatto e la versione
-- dei testi legali in vigore quando e' stato dato.
CREATE TABLE "contact_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(120) NOT NULL,
  "email" varchar(255) NOT NULL,
  "subject" varchar(160) NOT NULL,
  "message" text NOT NULL,
  -- Il consenso non e' un booleano libero: senza spunta la riga non esiste.
  "privacy_accepted" boolean NOT NULL DEFAULT true,
  "privacy_accepted_at" timestamp with time zone NOT NULL DEFAULT now(),
  -- Hash del testo legale vigente (lib/core/legal/content-hash.generated.ts):
  -- dice a quale versione dell'informativa si riferisce il consenso.
  "privacy_version" varchar(80),
  -- Esito dell'invio della notifica interna: 'sent', 'skipped', 'failed'.
  -- Serve a sapere quali messaggi sono rimasti senza avviso.
  "email_status" varchar(20),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "contact_messages_privacy_accepted_check" CHECK ("privacy_accepted" = true)
);--> statement-breakpoint

-- Si legge sempre dal piu' recente: l'indice serve a quella lettura.
CREATE INDEX "contact_messages_created_at_idx"
  ON "contact_messages" ("created_at" DESC);--> statement-breakpoint

-- Contiene dati personali di chi non ha nemmeno un account: nessun client
-- anonimo o autenticato deve poterla leggere. Ci arriva solo il server, che
-- usa la connessione diretta e non passa dalle policy.
ALTER TABLE "contact_messages" ENABLE ROW LEVEL SECURITY;
