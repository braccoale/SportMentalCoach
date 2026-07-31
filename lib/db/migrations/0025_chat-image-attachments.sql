ALTER TABLE "messages"
ADD COLUMN "attachment_key" text;--> statement-breakpoint

ALTER TABLE "messages"
ADD COLUMN "attachment_name" varchar(255);--> statement-breakpoint

ALTER TABLE "messages"
ADD COLUMN "attachment_mime_type" varchar(80);--> statement-breakpoint

ALTER TABLE "messages"
ADD COLUMN "attachment_size" integer;
