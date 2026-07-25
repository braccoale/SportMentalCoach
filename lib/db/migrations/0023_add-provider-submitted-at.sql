ALTER TABLE "provider_profiles"
ADD COLUMN "submitted_at" timestamp;--> statement-breakpoint

UPDATE "provider_profiles"
SET "submitted_at" = "updated_at"
WHERE "status" <> 'draft'
  AND "submitted_at" IS NULL;
