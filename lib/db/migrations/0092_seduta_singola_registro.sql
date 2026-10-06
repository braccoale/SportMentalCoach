-- Seduta singola e seduta extra: il prezzo lo decide il coach, il registro delle
-- sedute acquistate a parte lo tiene la piattaforma.
--
-- `coach_billing_profiles.single_session_price_cents`: il prezzo di UNA seduta,
-- in centesimi. Vuoto = il coach non la vende. Vale anche come «seduta extra»
-- per chi ha già un abbonamento.
--
-- `session_credits`: una riga per seduta acquistata, con la sua scadenza (60
-- giorni). Le sedute di un abbonamento NON stanno qui: si calcolano contando le
-- prenotazioni del periodo; qui c'è solo ciò che non si può calcolare. Lo stato
-- scritto è `pending` / `granted` / `revoked`; lo stato di UTILIZZO
-- (disponibile, riservata, consumata) non si scrive: si deriva dalla
-- prenotazione collegata, così nessun punto che cambia lo stato di una
-- prenotazione deve ricordarsi di aggiornare anche il registro. Una prenotazione
-- tiene al massimo una seduta (indice parziale unico su booking_id).
--
-- Nessuno dei due è letto da un client, solo dal server: RLS attiva senza
-- policy e privilegi tolti ad anon/authenticated, come le altre tabelle dei
-- pagamenti. Solo ADD COLUMN e CREATE TABLE: nessun dato esistente cambia.

CREATE TABLE "session_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"athlete_user_id" integer NOT NULL,
	"coach_user_id" integer NOT NULL,
	"kind" varchar(12) NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"stripe_account_id" varchar(255) NOT NULL,
	"stripe_checkout_session_id" varchar(255),
	"stripe_payment_intent_id" varchar(255),
	"granted_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"booking_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "session_credits_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "session_credits_kind_check" CHECK ("session_credits"."kind" in ('single', 'extra')),
	CONSTRAINT "session_credits_status_check" CHECK ("session_credits"."status" in ('pending', 'granted', 'revoked')),
	CONSTRAINT "session_credits_price_check" CHECK ("session_credits"."price_cents" > 0),
	CONSTRAINT "session_credits_currency_check" CHECK ("session_credits"."currency" = 'EUR'),
	CONSTRAINT "session_credits_distinct_people_check" CHECK ("session_credits"."athlete_user_id" <> "session_credits"."coach_user_id"),
	CONSTRAINT "session_credits_granted_shape_check" CHECK (("session_credits"."status" = 'pending' and "session_credits"."granted_at" is null and "session_credits"."expires_at" is null and "session_credits"."booking_id" is null) or ("session_credits"."status" <> 'pending' and "session_credits"."granted_at" is not null and "session_credits"."expires_at" is not null and "session_credits"."expires_at" > "session_credits"."granted_at"))
);
--> statement-breakpoint
ALTER TABLE "coach_billing_profiles" ADD COLUMN "single_session_price_cents" integer;--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_credits_one_per_booking_idx" ON "session_credits" USING btree ("booking_id") WHERE "session_credits"."booking_id" is not null;--> statement-breakpoint
CREATE INDEX "session_credits_pair_idx" ON "session_credits" USING btree ("athlete_user_id","coach_user_id","status");--> statement-breakpoint
ALTER TABLE "coach_billing_profiles" ADD CONSTRAINT "coach_billing_profiles_single_price_check" CHECK ("coach_billing_profiles"."single_session_price_cents" is null or "coach_billing_profiles"."single_session_price_cents" > 0);
--> statement-breakpoint

REVOKE ALL ON "public"."session_credits" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."session_credits_id_seq" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "session_credits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Il trigger condiviso (0011) tiene onesto updated_at.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS "session_credits_set_updated_at"
      ON "public"."session_credits";
    CREATE TRIGGER "session_credits_set_updated_at"
      BEFORE UPDATE ON "public"."session_credits"
      FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
  END IF;
END $$;
