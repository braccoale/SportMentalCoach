CREATE TABLE "specialties" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"label" varchar(120) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "sports" (
	"key" varchar(60) PRIMARY KEY NOT NULL,
	"label" varchar(120) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "coach_availability" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "coach_availability" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "favorites" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "roles" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "team_members" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "user_roles" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_roles" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "user_roles" ADD COLUMN "updated_by" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "created_by" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_by" integer;
--> statement-breakpoint
-- Audit: bump updated_at automatically on every UPDATE, on all tables.
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema = 'public' AND col.table_name = c.relname
     AND col.column_name = 'updated_at'
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t
    );
  END LOOP;
END $$;
--> statement-breakpoint
-- Seed taxonomy master data from the previous static lists (all active).
INSERT INTO "sports" ("key", "label", "sort_order") VALUES
  ('football', 'Calcio', 1), ('basketball', 'Basket', 2), ('volleyball', 'Pallavolo', 3),
  ('tennis', 'Tennis', 4), ('swimming', 'Nuoto', 5), ('athletics', 'Atletica', 6),
  ('cycling', 'Ciclismo', 7), ('martial_arts', 'Arti marziali', 8), ('golf', 'Golf', 9),
  ('skiing', 'Sci', 10), ('rugby', 'Rugby', 11), ('motorsport', 'Motori', 12), ('other', 'Altro', 13)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "specialties" ("key", "label", "sort_order") VALUES
  ('performance_anxiety', 'Ansia da prestazione', 1),
  ('focus_concentration', 'Focus e concentrazione', 2),
  ('motivation', 'Motivazione', 3),
  ('confidence', 'Autostima e fiducia', 4),
  ('goal_setting', 'Definizione degli obiettivi', 5),
  ('injury_recovery', 'Recupero da infortunio', 6),
  ('team_dynamics', 'Dinamiche di squadra', 7),
  ('pre_competition_routine', 'Routine pre-gara', 8),
  ('resilience', 'Resilienza', 9)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
-- Lock down the new tables like the rest of the schema (RLS on, no policies:
-- the app connects as the table owner, external API access is denied).
ALTER TABLE "sports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "specialties" ENABLE ROW LEVEL SECURITY;
