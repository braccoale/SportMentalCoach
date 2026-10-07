CREATE TABLE "auth_rate_limit_windows" (
	"id" serial PRIMARY KEY NOT NULL,
	"bucket_key" varchar(200) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "auth_rate_limit_windows_bucket_window_unique" UNIQUE("bucket_key","window_start")
);
--> statement-breakpoint
CREATE INDEX "auth_rate_limit_windows_window_start_idx" ON "auth_rate_limit_windows" USING btree ("window_start");