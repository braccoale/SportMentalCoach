-- Un pacchetto appartiene a un utente, non più a un'organizzazione (vedi
-- docs/superpowers/specs/2026-09-07-pacchetti-per-utente-design.md).
-- Stessa postura delle altre tabelle di quest'area: nessun client la legge
-- direttamente, solo il server dopo `requireRole('admin')`.
CREATE TABLE "user_packages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"package_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"createddate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdby" integer,
	"updateddate" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedby" integer,
	CONSTRAINT "user_packages_status_check" CHECK ("user_packages"."status" in ('active', 'expired', 'suspended')),
	CONSTRAINT "user_packages_window_check" CHECK ("user_packages"."expires_at" is null or "user_packages"."starts_at" is null or "user_packages"."expires_at" > "user_packages"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "user_packages" ADD CONSTRAINT "user_packages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_packages" ADD CONSTRAINT "user_packages_package_id_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."packages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_packages" ADD CONSTRAINT "user_packages_createdby_users_id_fk" FOREIGN KEY ("createdby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_packages" ADD CONSTRAINT "user_packages_updatedby_users_id_fk" FOREIGN KEY ("updatedby") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_packages_one_active_idx" ON "user_packages" USING btree ("user_id") WHERE "user_packages"."status" = 'active';--> statement-breakpoint
CREATE INDEX "user_packages_user_status_idx" ON "user_packages" USING btree ("user_id","status");--> statement-breakpoint

REVOKE ALL ON "public"."user_packages" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "public"."user_packages_id_seq" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "user_packages" ENABLE ROW LEVEL SECURITY;