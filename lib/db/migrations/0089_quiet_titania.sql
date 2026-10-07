CREATE TABLE "billing_customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"beneficiary_user_id" integer NOT NULL,
	"payer_user_id" integer,
	"payer_guardian_id" integer,
	"stripe_customer_id" varchar(255),
	"email_snapshot" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "billing_customers_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "billing_customers_exactly_one_payer_check" CHECK (num_nonnulls("billing_customers"."payer_user_id", "billing_customers"."payer_guardian_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "billing_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"commercial_relationship_id" integer NOT NULL,
	"billing_customer_id" integer NOT NULL,
	"coach_user_id" integer NOT NULL,
	"athlete_user_id" integer NOT NULL,
	"product_type" varchar(24) NOT NULL,
	"billing_mode" varchar(16) NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"coach_rate_cents" integer NOT NULL,
	"session_quantity" integer NOT NULL,
	"gross_amount_cents" integer NOT NULL,
	"platform_commission_bps" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"coach_compensation_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"acquisition_source" varchar(24) NOT NULL,
	"payment_strategy" varchar(24),
	"external_checkout_session_id" varchar(255),
	"idempotency_key" varchar(160) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "billing_orders_external_checkout_session_id_unique" UNIQUE("external_checkout_session_id"),
	CONSTRAINT "billing_orders_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "billing_orders_product_check" CHECK ("billing_orders"."product_type" in ('single', 'essential', 'performance', 'extra')),
	CONSTRAINT "billing_orders_mode_check" CHECK ("billing_orders"."billing_mode" in ('one_off', 'subscription')),
	CONSTRAINT "billing_orders_status_check" CHECK ("billing_orders"."status" in ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'partially_refunded')),
	CONSTRAINT "billing_orders_amounts_positive_check" CHECK ("billing_orders"."coach_rate_cents" > 0 and "billing_orders"."session_quantity" > 0 and "billing_orders"."gross_amount_cents" > 0),
	CONSTRAINT "billing_orders_snapshot_total_check" CHECK ("billing_orders"."gross_amount_cents" = "billing_orders"."coach_rate_cents" * "billing_orders"."session_quantity"),
	CONSTRAINT "billing_orders_split_total_check" CHECK ("billing_orders"."gross_amount_cents" = "billing_orders"."platform_fee_cents" + "billing_orders"."coach_compensation_cents"),
	CONSTRAINT "billing_orders_split_nonnegative_check" CHECK ("billing_orders"."platform_fee_cents" >= 0 and "billing_orders"."coach_compensation_cents" >= 0),
	CONSTRAINT "billing_orders_commission_check" CHECK (("billing_orders"."acquisition_source" = 'KAIPAI_SOURCED' and "billing_orders"."platform_commission_bps" = 3000) or ("billing_orders"."acquisition_source" = 'COACH_SOURCED' and "billing_orders"."platform_commission_bps" = 1000)),
	CONSTRAINT "billing_orders_product_shape_check" CHECK (("billing_orders"."product_type" in ('single', 'extra') and "billing_orders"."billing_mode" = 'one_off' and "billing_orders"."session_quantity" = 1) or ("billing_orders"."product_type" = 'essential' and "billing_orders"."billing_mode" = 'subscription' and "billing_orders"."session_quantity" = 2) or ("billing_orders"."product_type" = 'performance' and "billing_orders"."billing_mode" = 'subscription' and "billing_orders"."session_quantity" = 4)),
	CONSTRAINT "billing_orders_payment_strategy_check" CHECK ("billing_orders"."payment_strategy" is null or "billing_orders"."payment_strategy" in ('direct', 'destination', 'separate_transfer'))
);
--> statement-breakpoint
CREATE TABLE "billing_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"initial_order_id" integer NOT NULL,
	"commercial_relationship_id" integer NOT NULL,
	"billing_customer_id" integer NOT NULL,
	"coach_user_id" integer NOT NULL,
	"athlete_user_id" integer NOT NULL,
	"plan" varchar(24) NOT NULL,
	"next_plan" varchar(24),
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"stripe_subscription_id" varchar(255),
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "billing_subscriptions_initial_order_id_unique" UNIQUE("initial_order_id"),
	CONSTRAINT "billing_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "billing_subscriptions_plan_check" CHECK ("billing_subscriptions"."plan" in ('essential', 'performance')),
	CONSTRAINT "billing_subscriptions_next_plan_check" CHECK ("billing_subscriptions"."next_plan" is null or "billing_subscriptions"."next_plan" in ('essential', 'performance')),
	CONSTRAINT "billing_subscriptions_status_check" CHECK ("billing_subscriptions"."status" in ('pending', 'active', 'past_due', 'cancelled', 'unpaid')),
	CONSTRAINT "billing_subscriptions_period_check" CHECK ("billing_subscriptions"."current_period_end" is null or "billing_subscriptions"."current_period_start" is null or "billing_subscriptions"."current_period_end" > "billing_subscriptions"."current_period_start")
);
--> statement-breakpoint
CREATE TABLE "billing_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"subscription_id" integer,
	"coach_user_id" integer NOT NULL,
	"athlete_user_id" integer NOT NULL,
	"type" varchar(24) NOT NULL,
	"status" varchar(24) NOT NULL,
	"gross_amount_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"coach_compensation_cents" integer NOT NULL,
	"processor_fee_cents" integer,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"payment_strategy" varchar(24),
	"external_invoice_id" varchar(255),
	"external_payment_intent_id" varchar(255),
	"external_charge_id" varchar(255),
	"idempotency_key" varchar(160) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "billing_transactions_external_invoice_id_unique" UNIQUE("external_invoice_id"),
	CONSTRAINT "billing_transactions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "billing_transactions_type_check" CHECK ("billing_transactions"."type" in ('purchase', 'renewal', 'refund', 'chargeback')),
	CONSTRAINT "billing_transactions_status_check" CHECK ("billing_transactions"."status" in ('pending', 'succeeded', 'failed', 'reversed')),
	CONSTRAINT "billing_transactions_amounts_check" CHECK ("billing_transactions"."gross_amount_cents" >= 0 and "billing_transactions"."platform_fee_cents" >= 0 and "billing_transactions"."coach_compensation_cents" >= 0 and ("billing_transactions"."processor_fee_cents" is null or "billing_transactions"."processor_fee_cents" >= 0)),
	CONSTRAINT "billing_transactions_split_check" CHECK ("billing_transactions"."gross_amount_cents" = "billing_transactions"."platform_fee_cents" + "billing_transactions"."coach_compensation_cents"),
	CONSTRAINT "billing_transactions_strategy_check" CHECK ("billing_transactions"."payment_strategy" is null or "billing_transactions"."payment_strategy" in ('direct', 'destination', 'separate_transfer'))
);
--> statement-breakpoint
CREATE TABLE "business_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_name" varchar(64) NOT NULL,
	"idempotency_key" varchar(180) NOT NULL,
	"actor_user_id" integer,
	"athlete_user_id" integer,
	"coach_user_id" integer,
	"order_id" integer,
	"subscription_id" integer,
	"booking_id" integer,
	"source" varchar(24) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_events_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "business_events_source_check" CHECK ("business_events"."source" in ('server', 'stripe_webhook', 'reconciliation'))
);
--> statement-breakpoint
CREATE TABLE "coach_athlete_commercial_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"coach_user_id" integer NOT NULL,
	"athlete_user_id" integer NOT NULL,
	"source" varchar(24) NOT NULL,
	"commission_bps" integer NOT NULL,
	"evidence_referral_id" integer,
	"attributed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "commercial_relationship_coach_athlete_unique" UNIQUE("coach_user_id","athlete_user_id"),
	CONSTRAINT "commercial_relationship_source_check" CHECK ("coach_athlete_commercial_relationships"."source" in ('KAIPAI_SOURCED', 'COACH_SOURCED')),
	CONSTRAINT "commercial_relationship_commission_check" CHECK (("coach_athlete_commercial_relationships"."source" = 'KAIPAI_SOURCED' and "coach_athlete_commercial_relationships"."commission_bps" = 3000) or ("coach_athlete_commercial_relationships"."source" = 'COACH_SOURCED' and "coach_athlete_commercial_relationships"."commission_bps" = 1000)),
	CONSTRAINT "commercial_relationship_evidence_check" CHECK (("coach_athlete_commercial_relationships"."source" = 'COACH_SOURCED' and "coach_athlete_commercial_relationships"."evidence_referral_id" is not null) or ("coach_athlete_commercial_relationships"."source" = 'KAIPAI_SOURCED' and "coach_athlete_commercial_relationships"."evidence_referral_id" is null)),
	CONSTRAINT "commercial_relationship_distinct_people_check" CHECK ("coach_athlete_commercial_relationships"."coach_user_id" <> "coach_athlete_commercial_relationships"."athlete_user_id")
);
--> statement-breakpoint
CREATE TABLE "coach_billing_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"coach_user_id" integer NOT NULL,
	"stripe_account_id" varchar(255),
	"stripe_account_namespace" varchar(16),
	"onboarding_status" varchar(24) DEFAULT 'not_started' NOT NULL,
	"charges_enabled" boolean DEFAULT false NOT NULL,
	"payouts_enabled" boolean DEFAULT false NOT NULL,
	"requirements_due" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "coach_billing_profiles_coach_user_id_unique" UNIQUE("coach_user_id"),
	CONSTRAINT "coach_billing_profiles_stripe_account_id_unique" UNIQUE("stripe_account_id"),
	CONSTRAINT "coach_billing_profiles_onboarding_status_check" CHECK ("coach_billing_profiles"."onboarding_status" in ('not_started', 'pending', 'active', 'restricted', 'disabled')),
	CONSTRAINT "coach_billing_profiles_account_namespace_check" CHECK ("coach_billing_profiles"."stripe_account_namespace" is null or "coach_billing_profiles"."stripe_account_namespace" in ('v1', 'v2'))
);
--> statement-breakpoint
CREATE TABLE "session_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"transaction_id" integer,
	"subscription_id" integer,
	"athlete_user_id" integer NOT NULL,
	"coach_user_id" integer NOT NULL,
	"product_type" varchar(24) NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"rollover_generation" integer DEFAULT 0 NOT NULL,
	"rolled_from_credit_id" integer,
	"status" varchar(20) DEFAULT 'available' NOT NULL,
	"granted_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"booking_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "session_credits_product_check" CHECK ("session_credits"."product_type" in ('single', 'essential', 'performance', 'extra')),
	CONSTRAINT "session_credits_status_check" CHECK ("session_credits"."status" in ('available', 'reserved', 'consumed', 'expired', 'revoked')),
	CONSTRAINT "session_credits_expiration_check" CHECK ("session_credits"."expires_at" > "session_credits"."granted_at"),
	CONSTRAINT "session_credits_period_check" CHECK ("session_credits"."period_end" is null or "session_credits"."period_start" is null or "session_credits"."period_end" > "session_credits"."period_start"),
	CONSTRAINT "session_credits_rollover_check" CHECK (("session_credits"."rollover_generation" = 0 and "session_credits"."rolled_from_credit_id" is null) or ("session_credits"."rollover_generation" = 1 and "session_credits"."rolled_from_credit_id" is not null)),
	CONSTRAINT "session_credits_consumption_check" CHECK (("session_credits"."status" = 'consumed' and "session_credits"."consumed_at" is not null and "session_credits"."booking_id" is not null) or ("session_credits"."status" <> 'consumed' and "session_credits"."consumed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"stripe_event_id" varchar(255) NOT NULL,
	"event_type" varchar(120) NOT NULL,
	"stripe_account_id" varchar(255),
	"api_version" varchar(40),
	"payload_digest" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" varchar(80),
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stripe_webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id"),
	CONSTRAINT "stripe_webhook_events_status_check" CHECK ("stripe_webhook_events"."status" in ('received', 'processing', 'processed', 'failed', 'ignored')),
	CONSTRAINT "stripe_webhook_events_attempts_check" CHECK ("stripe_webhook_events"."attempts" >= 0),
	CONSTRAINT "stripe_webhook_events_digest_check" CHECK (length("stripe_webhook_events"."payload_digest") = 64)
);
--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_beneficiary_user_id_users_id_fk" FOREIGN KEY ("beneficiary_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_payer_user_id_users_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_payer_guardian_id_athlete_guardians_id_fk" FOREIGN KEY ("payer_guardian_id") REFERENCES "public"."athlete_guardians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_commercial_relationship_id_coach_athlete_commercial_relationships_id_fk" FOREIGN KEY ("commercial_relationship_id") REFERENCES "public"."coach_athlete_commercial_relationships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_billing_customer_id_billing_customers_id_fk" FOREIGN KEY ("billing_customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_initial_order_id_billing_orders_id_fk" FOREIGN KEY ("initial_order_id") REFERENCES "public"."billing_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_commercial_relationship_id_coach_athlete_commercial_relationships_id_fk" FOREIGN KEY ("commercial_relationship_id") REFERENCES "public"."coach_athlete_commercial_relationships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_billing_customer_id_billing_customers_id_fk" FOREIGN KEY ("billing_customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_subscriptions" ADD CONSTRAINT "billing_subscriptions_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_order_id_billing_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."billing_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_order_id_billing_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."billing_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_events" ADD CONSTRAINT "business_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athlete_commercial_relationships" ADD CONSTRAINT "coach_athlete_commercial_relationships_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athlete_commercial_relationships" ADD CONSTRAINT "coach_athlete_commercial_relationships_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_athlete_commercial_relationships" ADD CONSTRAINT "coach_athlete_commercial_relationships_evidence_referral_id_referrals_id_fk" FOREIGN KEY ("evidence_referral_id") REFERENCES "public"."referrals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_billing_profiles" ADD CONSTRAINT "coach_billing_profiles_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_order_id_billing_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."billing_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_transaction_id_billing_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."billing_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_subscription_id_billing_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."billing_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_coach_user_id_users_id_fk" FOREIGN KEY ("coach_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_rolled_from_credit_id_session_credits_id_fk" FOREIGN KEY ("rolled_from_credit_id") REFERENCES "public"."session_credits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_credits" ADD CONSTRAINT "session_credits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_beneficiary_user_unique" ON "billing_customers" USING btree ("beneficiary_user_id","payer_user_id") WHERE "billing_customers"."payer_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_beneficiary_guardian_unique" ON "billing_customers" USING btree ("beneficiary_user_id","payer_guardian_id") WHERE "billing_customers"."payer_guardian_id" is not null;--> statement-breakpoint
CREATE INDEX "billing_customers_payer_user_idx" ON "billing_customers" USING btree ("payer_user_id");--> statement-breakpoint
CREATE INDEX "billing_customers_payer_guardian_idx" ON "billing_customers" USING btree ("payer_guardian_id");--> statement-breakpoint
CREATE INDEX "billing_orders_relationship_idx" ON "billing_orders" USING btree ("commercial_relationship_id");--> statement-breakpoint
CREATE INDEX "billing_orders_athlete_created_idx" ON "billing_orders" USING btree ("athlete_user_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_orders_coach_created_idx" ON "billing_orders" USING btree ("coach_user_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_orders_customer_idx" ON "billing_orders" USING btree ("billing_customer_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_relationship_idx" ON "billing_subscriptions" USING btree ("commercial_relationship_id");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_athlete_status_idx" ON "billing_subscriptions" USING btree ("athlete_user_id","status");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_coach_status_idx" ON "billing_subscriptions" USING btree ("coach_user_id","status");--> statement-breakpoint
CREATE INDEX "billing_subscriptions_customer_idx" ON "billing_subscriptions" USING btree ("billing_customer_id");--> statement-breakpoint
CREATE INDEX "billing_transactions_order_idx" ON "billing_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "billing_transactions_subscription_idx" ON "billing_transactions" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "billing_transactions_athlete_occurred_idx" ON "billing_transactions" USING btree ("athlete_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "billing_transactions_coach_occurred_idx" ON "billing_transactions" USING btree ("coach_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "billing_transactions_payment_intent_idx" ON "billing_transactions" USING btree ("external_payment_intent_id");--> statement-breakpoint
CREATE INDEX "billing_transactions_charge_idx" ON "billing_transactions" USING btree ("external_charge_id");--> statement-breakpoint
CREATE INDEX "business_events_name_occurred_idx" ON "business_events" USING btree ("event_name","occurred_at");--> statement-breakpoint
CREATE INDEX "business_events_athlete_idx" ON "business_events" USING btree ("athlete_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "business_events_coach_idx" ON "business_events" USING btree ("coach_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "business_events_order_idx" ON "business_events" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "business_events_subscription_idx" ON "business_events" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "business_events_booking_idx" ON "business_events" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "commercial_relationship_athlete_idx" ON "coach_athlete_commercial_relationships" USING btree ("athlete_user_id");--> statement-breakpoint
CREATE INDEX "commercial_relationship_referral_idx" ON "coach_athlete_commercial_relationships" USING btree ("evidence_referral_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_credits_booking_unique" ON "session_credits" USING btree ("booking_id") WHERE "session_credits"."booking_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "session_credits_rollover_source_unique" ON "session_credits" USING btree ("rolled_from_credit_id") WHERE "session_credits"."rolled_from_credit_id" is not null;--> statement-breakpoint
CREATE INDEX "session_credits_athlete_available_idx" ON "session_credits" USING btree ("athlete_user_id","coach_user_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "session_credits_order_idx" ON "session_credits" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "session_credits_transaction_idx" ON "session_credits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "session_credits_subscription_period_idx" ON "session_credits" USING btree ("subscription_id","period_start");--> statement-breakpoint
CREATE INDEX "stripe_webhook_events_status_received_idx" ON "stripe_webhook_events" USING btree ("status","received_at");--> statement-breakpoint

-- The source and financial split are snapshots, but they must agree with the
-- server-derived relationship at the first order. That same write locks the
-- attribution so no later update can move revenue between 10% and 30%.
CREATE OR REPLACE FUNCTION app_private.billing_lock_commercial_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  relationship public.coach_athlete_commercial_relationships%ROWTYPE;
  customer public.billing_customers%ROWTYPE;
BEGIN
  SELECT * INTO relationship
  FROM public.coach_athlete_commercial_relationships
  WHERE id = NEW.commercial_relationship_id
  FOR UPDATE;

  IF NOT FOUND
     OR relationship.coach_user_id <> NEW.coach_user_id
     OR relationship.athlete_user_id <> NEW.athlete_user_id
     OR relationship.source <> NEW.acquisition_source
     OR relationship.commission_bps <> NEW.platform_commission_bps THEN
    RAISE EXCEPTION 'billing order does not match commercial relationship';
  END IF;

  SELECT * INTO customer
  FROM public.billing_customers
  WHERE id = NEW.billing_customer_id;
  IF NOT FOUND OR customer.beneficiary_user_id <> NEW.athlete_user_id THEN
    RAISE EXCEPTION 'billing customer does not belong to beneficiary';
  END IF;

  UPDATE public.coach_athlete_commercial_relationships
  SET locked_at = COALESCE(locked_at, CURRENT_TIMESTAMP),
      updated_at = CASE WHEN locked_at IS NULL THEN CURRENT_TIMESTAMP ELSE updated_at END
  WHERE id = NEW.commercial_relationship_id;
  RETURN NEW;
END;
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_private.billing_keep_attribution_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.locked_at IS NOT NULL AND (
    NEW.coach_user_id IS DISTINCT FROM OLD.coach_user_id OR
    NEW.athlete_user_id IS DISTINCT FROM OLD.athlete_user_id OR
    NEW.source IS DISTINCT FROM OLD.source OR
    NEW.commission_bps IS DISTINCT FROM OLD.commission_bps OR
    NEW.evidence_referral_id IS DISTINCT FROM OLD.evidence_referral_id OR
    NEW.attributed_at IS DISTINCT FROM OLD.attributed_at OR
    NEW.locked_at IS DISTINCT FROM OLD.locked_at
  ) THEN
    RAISE EXCEPTION 'commercial attribution is immutable after first order';
  END IF;
  RETURN NEW;
END;
$function$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION app_private.billing_validate_credit_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  parent public.session_credits%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'consumed' AND (
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.booking_id IS DISTINCT FROM OLD.booking_id OR
    NEW.consumed_at IS DISTINCT FROM OLD.consumed_at
  ) THEN
    RAISE EXCEPTION 'a consumed session credit cannot be consumed again or reopened';
  END IF;

  IF NEW.rollover_generation = 1 THEN
    SELECT * INTO parent FROM public.session_credits
    WHERE id = NEW.rolled_from_credit_id;
    IF NOT FOUND
       OR parent.rollover_generation <> 0
       OR parent.athlete_user_id <> NEW.athlete_user_id
       OR parent.coach_user_id <> NEW.coach_user_id
       OR parent.subscription_id IS DISTINCT FROM NEW.subscription_id THEN
      RAISE EXCEPTION 'invalid session credit rollover';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;--> statement-breakpoint

REVOKE ALL ON FUNCTION app_private.billing_lock_commercial_attribution() FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.billing_keep_attribution_immutable() FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint
REVOKE ALL ON FUNCTION app_private.billing_validate_credit_transition() FROM PUBLIC, anon, authenticated, service_role;--> statement-breakpoint

CREATE TRIGGER billing_orders_lock_attribution
BEFORE INSERT ON public.billing_orders
FOR EACH ROW EXECUTE FUNCTION app_private.billing_lock_commercial_attribution();--> statement-breakpoint
CREATE TRIGGER commercial_attribution_immutable
BEFORE UPDATE ON public.coach_athlete_commercial_relationships
FOR EACH ROW EXECUTE FUNCTION app_private.billing_keep_attribution_immutable();--> statement-breakpoint
CREATE TRIGGER session_credit_transition_guard
BEFORE INSERT OR UPDATE ON public.session_credits
FOR EACH ROW EXECUTE FUNCTION app_private.billing_validate_credit_transition();--> statement-breakpoint

ALTER TABLE public.coach_billing_profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.coach_athlete_commercial_relationships ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.billing_orders ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.session_credits ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.business_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "coach_billing_profiles_select_owner_or_admin"
ON public.coach_billing_profiles FOR SELECT TO authenticated
USING (
  coach_user_id = (SELECT app_private.current_app_user_id())
  OR (SELECT app_private.current_app_user_is_admin())
);--> statement-breakpoint

CREATE POLICY "commercial_relationships_select_participants_or_admin"
ON public.coach_athlete_commercial_relationships FOR SELECT TO authenticated
USING (
  coach_user_id = (SELECT app_private.current_app_user_id())
  OR athlete_user_id = (SELECT app_private.current_app_user_id())
  OR (SELECT app_private.current_app_user_is_admin())
);--> statement-breakpoint

CREATE POLICY "billing_customers_select_payer_beneficiary_or_admin"
ON public.billing_customers FOR SELECT TO authenticated
USING (
  beneficiary_user_id = (SELECT app_private.current_app_user_id())
  OR payer_user_id = (SELECT app_private.current_app_user_id())
  OR (SELECT app_private.current_app_user_is_admin())
);--> statement-breakpoint

CREATE POLICY "billing_orders_select_participants_or_admin"
ON public.billing_orders FOR SELECT TO authenticated
USING (
  coach_user_id = (SELECT app_private.current_app_user_id())
  OR athlete_user_id = (SELECT app_private.current_app_user_id())
  OR (SELECT app_private.current_app_user_is_admin())
);--> statement-breakpoint

CREATE POLICY "billing_subscriptions_select_participants_or_admin"
ON public.billing_subscriptions FOR SELECT TO authenticated
USING (
  coach_user_id = (SELECT app_private.current_app_user_id())
  OR athlete_user_id = (SELECT app_private.current_app_user_id())
  OR (SELECT app_private.current_app_user_is_admin())
);--> statement-breakpoint

CREATE POLICY "billing_transactions_select_participants_or_admin"
ON public.billing_transactions FOR SELECT TO authenticated
USING (
  coach_user_id = (SELECT app_private.current_app_user_id())
  OR athlete_user_id = (SELECT app_private.current_app_user_id())
  OR (SELECT app_private.current_app_user_is_admin())
);--> statement-breakpoint

CREATE POLICY "session_credits_select_participants_or_admin"
ON public.session_credits FOR SELECT TO authenticated
USING (
  coach_user_id = (SELECT app_private.current_app_user_id())
  OR athlete_user_id = (SELECT app_private.current_app_user_id())
  OR (SELECT app_private.current_app_user_is_admin())
);--> statement-breakpoint

CREATE POLICY "stripe_webhook_events_select_admin"
ON public.stripe_webhook_events FOR SELECT TO authenticated
USING ((SELECT app_private.current_app_user_is_admin()));--> statement-breakpoint

CREATE POLICY "business_events_select_admin"
ON public.business_events FOR SELECT TO authenticated
USING ((SELECT app_private.current_app_user_is_admin()));--> statement-breakpoint

GRANT SELECT ON public.coach_billing_profiles TO authenticated;--> statement-breakpoint
GRANT SELECT ON public.coach_athlete_commercial_relationships TO authenticated;--> statement-breakpoint
GRANT SELECT ON public.billing_customers TO authenticated;--> statement-breakpoint
GRANT SELECT ON public.billing_orders TO authenticated;--> statement-breakpoint
GRANT SELECT ON public.billing_subscriptions TO authenticated;--> statement-breakpoint
GRANT SELECT ON public.billing_transactions TO authenticated;--> statement-breakpoint
GRANT SELECT ON public.session_credits TO authenticated;--> statement-breakpoint
GRANT SELECT ON public.stripe_webhook_events TO authenticated;--> statement-breakpoint
GRANT SELECT ON public.business_events TO authenticated;--> statement-breakpoint

REVOKE INSERT, UPDATE, DELETE ON public.coach_billing_profiles FROM anon, authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.coach_athlete_commercial_relationships FROM anon, authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.billing_customers FROM anon, authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.billing_orders FROM anon, authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.billing_subscriptions FROM anon, authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.billing_transactions FROM anon, authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.session_credits FROM anon, authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.stripe_webhook_events FROM anon, authenticated;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON public.business_events FROM anon, authenticated;
