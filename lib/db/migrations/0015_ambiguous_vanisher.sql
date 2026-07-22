-- Web Push subscriptions.
--
-- This table was first created out-of-band (applied straight to the database
-- before the migration existed), so on the live database it already holds
-- rows and carries Postgres' *default* constraint names. Every statement here
-- is therefore written to be idempotent and reconciling: it creates the table
-- on a fresh database, and on the live one it only renames the constraints to
-- the names drizzle generates, so both end up identical.

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.push_subscriptions'::regclass
		  AND conname = 'push_subscriptions_endpoint_key'
	) THEN
		ALTER TABLE "push_subscriptions"
			RENAME CONSTRAINT "push_subscriptions_endpoint_key"
			TO "push_subscriptions_endpoint_unique";
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.push_subscriptions'::regclass
		  AND conname = 'push_subscriptions_user_id_fkey'
	) THEN
		ALTER TABLE "push_subscriptions"
			RENAME CONSTRAINT "push_subscriptions_user_id_fkey"
			TO "push_subscriptions_user_id_users_id_fk";
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");
