CREATE TABLE "coach_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coach_availability_provider_weekday_start_unique" UNIQUE("provider_id","weekday","start_minute")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "scheduled_for" timestamp;--> statement-breakpoint
ALTER TABLE "coach_availability" ADD CONSTRAINT "coach_availability_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE no action ON UPDATE no action;