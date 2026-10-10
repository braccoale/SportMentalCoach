-- Utilizzo, tempi ed errori: sei tabelle NUOVE, nessuna esistente viene toccata.
--
-- Perché tabelle separate e non una sola: sono dati con vite diverse. Gli eventi
-- d'uso (chi ha fatto cosa) si tengono 13 mesi; le misure dei tempi e gli errori
-- visti dall'utente 90 giorni e non hanno nessun utente dentro; le visite alle
-- pagine pubbliche sono solo contatori per giorno; le impronte dei visitatori
-- vivono due giorni. Mescolarle obbligherebbe a una sola scadenza per tutte.
--
-- Nessuna tabella contiene l'indirizzo IP di chi usa il sito. L'unica che ne ha
-- uno è l'elenco di quelli da NON tracciare (l'amministratore che prova il sito).
--
-- Tutte con RLS attiva e nessuna policy: scrive e legge soltanto il server (che
-- si collega come proprietario e la RLS non la vede); dall'API pubblica di
-- Supabase non si legge e non si scrive niente.

CREATE TABLE IF NOT EXISTS "usage_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" integer,
	"role" varchar(20),
	"is_demo" boolean DEFAULT false NOT NULL,
	"event" varchar(60) NOT NULL,
	"entity_type" varchar(30),
	"entity_id" integer,
	"outcome" varchar(10) DEFAULT 'ok' NOT NULL,
	"props" jsonb,
	"source" varchar(10) DEFAULT 'server' NOT NULL,
	"device_class" varchar(10),
	"release" varchar(12),
	CONSTRAINT "usage_events_outcome_check" CHECK ("usage_events"."outcome" in ('ok', 'denied', 'error')),
	CONSTRAINT "usage_events_source_check" CHECK ("usage_events"."source" in ('web', 'app', 'server'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "perf_samples" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"route" varchar(120) NOT NULL,
	"metric" varchar(24) NOT NULL,
	"value" double precision NOT NULL,
	"device_class" varchar(10),
	"connection" varchar(10),
	"release" varchar(12)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ui_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"route" varchar(120) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"code" varchar(60),
	"digest" varchar(40),
	"device_class" varchar(10),
	"release" varchar(12)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_views_daily" (
	"day" date NOT NULL,
	"route" varchar(120) NOT NULL,
	"referrer_kind" varchar(12) NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"uniques" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_views_daily_day_route_referrer_kind_pk" PRIMARY KEY("day","route","referrer_kind")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visitor_days" (
	"day" date NOT NULL,
	"fingerprint" varchar(32) NOT NULL,
	CONSTRAINT "visitor_days_day_fingerprint_pk" PRIMARY KEY("day","fingerprint")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_excluded_ips" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip" varchar(45) NOT NULL,
	"label" varchar(80),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_excluded_ips_ip_unique" UNIQUE("ip")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "usage_excluded_ips" ADD CONSTRAINT "usage_excluded_ips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_occurred_idx" ON "usage_events" USING btree ("occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_event_idx" ON "usage_events" USING btree ("event","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "usage_events_user_idx" ON "usage_events" USING btree ("user_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "perf_samples_route_idx" ON "perf_samples" USING btree ("route","metric","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "perf_samples_occurred_idx" ON "perf_samples" USING btree ("occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ui_errors_occurred_idx" ON "ui_errors" USING btree ("occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ui_errors_kind_idx" ON "ui_errors" USING btree ("kind","code","occurred_at");
--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "perf_samples" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ui_errors" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "page_views_daily" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "visitor_days" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "usage_excluded_ips" ENABLE ROW LEVEL SECURITY;
