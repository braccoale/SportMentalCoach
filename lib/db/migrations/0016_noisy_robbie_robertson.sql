CREATE TABLE "athlete_guardians" (
	"id" serial PRIMARY KEY NOT NULL,
	"athlete_user_id" integer NOT NULL,
	"guardian_name" varchar(200) NOT NULL,
	"guardian_email" varchar(255) NOT NULL,
	"relationship" varchar(60),
	"confirmed_at" timestamp,
	"confirmed_ip" varchar(64),
	"both_parents_declared" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "athlete_guardians_athlete_user_id_unique" UNIQUE("athlete_user_id")
);
--> statement-breakpoint
ALTER TABLE "athlete_guardians" ADD CONSTRAINT "athlete_guardians_athlete_user_id_users_id_fk" FOREIGN KEY ("athlete_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "athlete_guardians_athlete_user_id_idx" ON "athlete_guardians" USING btree ("athlete_user_id");