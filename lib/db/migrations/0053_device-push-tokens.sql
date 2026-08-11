-- I dispositivi con l'app KaiPai installata.
--
-- Perche' non riusare `push_subscriptions`: sono due cose diverse che si
-- somigliano solo di nome. Il Web Push del browser e' una tripletta —
-- indirizzo del servizio piu' due chiavi di cifratura — e viaggia con VAPID.
-- Un'app nativa non puo' riceverlo: Android passa da FCM, iOS da APNs, e
-- l'unica cosa che il dispositivo consegna e' un token singolo. Forzare le
-- due forme nella stessa tabella significherebbe tre colonne obbligatorie di
-- cui una sola usata, e un `provider` a decidere quali leggere: la classica
-- tabella che a distanza di sei mesi non si sa piu' interrogare.
CREATE TABLE "device_push_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  -- Token di consegna. Con Expo e' `ExponentPushToken[...]`, che vale sia per
  -- Android sia per iOS: e' Expo a smistarlo verso FCM o APNs.
  "token" text NOT NULL,
  "provider" varchar(20) NOT NULL DEFAULT 'expo',
  "platform" varchar(20),
  -- Serve a riconoscere lo stesso telefono quando il token cambia: i token
  -- ruotano da soli, e senza un'ancora ogni rotazione lascerebbe dietro una
  -- riga morta a cui continueremmo a spedire.
  "device_id" varchar(120),
  "app_version" varchar(20),
  "last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "device_push_tokens_token_unique" UNIQUE ("token")
);--> statement-breakpoint

ALTER TABLE "device_push_tokens"
  ADD CONSTRAINT "device_push_tokens_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Si legge sempre "tutti i dispositivi di questa persona": e' l'unica query.
CREATE INDEX "device_push_tokens_user_id_idx"
  ON "device_push_tokens" ("user_id");--> statement-breakpoint

-- Lo stesso telefono non deve comparire due volte quando il token ruota.
CREATE UNIQUE INDEX "device_push_tokens_user_device_idx"
  ON "device_push_tokens" ("user_id", "device_id")
  WHERE "device_id" IS NOT NULL;--> statement-breakpoint

-- Contiene indirizzi di consegna verso i dispositivi delle persone: nessun
-- client deve poterla leggere. Ci arriva solo il server.
ALTER TABLE "device_push_tokens" ENABLE ROW LEVEL SECURITY;
