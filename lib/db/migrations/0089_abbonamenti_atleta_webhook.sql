-- Abbonamenti degli atleti ai piani dei coach, e registro degli eventi Stripe.
--
-- `plan_subscriptions` copia nome, sedute e prezzo del piano al momento
-- dell'acquisto: se il coach cambia o archivia il piano, ciò che l'atleta ha
-- comprato non cambia. Lo stato lo scrive solo il webhook. Un solo
-- abbonamento active/past_due per coppia atleta-coach è imposto da un indice
-- parziale: un doppio acquisto (due schede, due clic) viene rifiutato da
-- Postgres anche se il codice se ne dimentica. `incomplete` può ripetersi: sono
-- i Checkout aperti e mai pagati.
--
-- `stripe_webhook_events` rende innocua la doppia consegna: Stripe può
-- inviare lo stesso evento più volte e fuori ordine.
--
-- Nessuna delle due tabelle è letta da un client, solo dal server: RLS attiva
-- senza policy e privilegi tolti ad anon/authenticated, come le tabelle della
-- 0088. Solo CREATE: nessun dato esistente viene toccato.

CREATE TABLE "plan_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"athlete_user_id" integer NOT NULL,
	"coach_user_id" integer NOT NULL,
	"plan_id" integer NOT NULL,
	"plan_name" varchar(80) NOT NULL,
	"sessions_per_month" integer NOT NULL,
	"monthly_price_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"status" varchar(16) DEFAULT 'incomplete' NOT NULL,
	"stripe_account_id" varchar(255) NOT NULL,
	"stripe_checkout_session_id" varchar(255),
	"stripe_subscription_id" varchar(255),
	"stripe_customer_id" varchar(255),
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "plan_subscriptions_stripe_checkout_session_id_unique" UNIQUE("stripe_checkout_session_id"),
	CONSTRAINT "plan_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "plan_subscriptions_status_check" CHECK ("plan_subscriptions"."status" in ('incomplete', 'active', 'past_due', 'canceled')),
	CONSTRAINT "plan_subscriptions_sessions_check" CHECK ("plan_subscriptions"."sessions_per_month" > 0),
	CONSTRAINT "plan_subscriptions_price_check" CHECK ("plan_subscriptions"."monthly_price_cents" > 0),
	CONSTRAINT "plan_subscriptions_currency_check" CHECK ("plan_subscriptions"."currency" = 'EUR'),
	CONSTRAINT "plan_subscriptions_distinct_people_check" CHECK ("plan_subscriptions"."athlete_user_id" <> "plan_subscriptions"."coach_user_id"),
	CONSTRAINT "plan_subscriptions_period_check" CHECK ("plan_subscriptions"."current_period_end" is null or "plan_subscriptions"."current_period_start" is null or "plan_subscriptions"."current_period_end" > "plan_subscriptions"."current_period_start")
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"stripe_account_id" varchar(255),
	"status" varchar(16) DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" varchar(80),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id"),
	CONSTRAINT "stripe_webhook_events_status_check" CHECK ("stripe_webhook_events"."status" in ('received', 'processed', 'failed', 'ignored')),
	CONSTRAINT "stripe_webhook_events_attempts_check" CHECK ("stripe_webhook_events"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ADD CONSTRAINT "plan_subscriptions_plan_id_coach_session_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."coach_session_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_subscriptions_one_live_per_pair_idx" ON "plan_subscriptions" USING btree ("athlete_user_id","coach_user_id") WHERE "plan_subscriptions"."status" in ('active', 'past_due');--> statement-breakpoint
CREATE INDEX "plan_subscriptions_athlete_status_idx" ON "plan_subscriptions" USING btree ("athlete_user_id","status");--> statement-breakpoint
CREATE INDEX "plan_subscriptions_coach_status_idx" ON "plan_subscriptions" USING btree ("coach_user_id","status");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_status_received_idx" ON "stripe_webhook_events" USING btree ("status","received_at");
--> statement-breakpoint

REVOKE ALL ON "public"."plan_subscriptions" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON "public"."stripe_webhook_events" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."plan_subscriptions_id_seq" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."stripe_webhook_events_id_seq" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "plan_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Il trigger condiviso (0011) tiene onesto updated_at.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS "plan_subscriptions_set_updated_at"
      ON "public"."plan_subscriptions";
    CREATE TRIGGER "plan_subscriptions_set_updated_at"
      BEFORE UPDATE ON "public"."plan_subscriptions"
      FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();

    DROP TRIGGER IF EXISTS "stripe_webhook_events_set_updated_at"
      ON "public"."stripe_webhook_events";
    CREATE TRIGGER "stripe_webhook_events_set_updated_at"
      BEFORE UPDATE ON "public"."stripe_webhook_events"
      FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
  END IF;
END $$;
