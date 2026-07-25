UPDATE "services"
SET "duration_min" = 40
WHERE "duration_min" IS NULL;--> statement-breakpoint

ALTER TABLE "services"
  ALTER COLUMN "duration_min" SET DEFAULT 40;--> statement-breakpoint

ALTER TABLE "services"
  ALTER COLUMN "duration_min" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "services"
  ADD CONSTRAINT "services_duration_min_valid"
  CHECK ("duration_min" BETWEEN 1 AND 1440);
