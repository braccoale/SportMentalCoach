CREATE TABLE "reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"booking_id" integer,
	"author_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"body" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "video_url" text;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "years_experience" integer;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "languages" text[];--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "certifications" text[];--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "athlete_levels" text[];--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_provider_id_provider_profiles_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."provider_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reviews_provider_id_created_at_idx" ON "reviews" USING btree ("provider_id","created_at");