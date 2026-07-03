ALTER TABLE "provider_profiles" ADD COLUMN "identity_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_profiles" ADD COLUMN "certifications_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "reply_at" timestamp;