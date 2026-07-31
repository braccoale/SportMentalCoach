CREATE TABLE "video_session_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "booking_id" integer NOT NULL,
  "webhook_id" varchar(80),
  "source" varchar(20) NOT NULL,
  "event_type" varchar(64) NOT NULL,
  "room_name" varchar(160) NOT NULL,
  "room_sid" varchar(80),
  "participant_ref" varchar(64),
  "participant_kind" varchar(24),
  "participant_sid" varchar(80),
  "track_kind" varchar(24),
  "track_source" varchar(40),
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_by" integer,
  "updated_by" integer,
  CONSTRAINT "video_session_events_webhook_id_unique" UNIQUE("webhook_id")
);--> statement-breakpoint

ALTER TABLE "video_session_events"
ADD CONSTRAINT "video_session_events_booking_id_bookings_id_fk"
FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE INDEX "video_session_events_booking_occurred_idx"
ON "video_session_events" USING btree ("booking_id", "occurred_at");--> statement-breakpoint

CREATE INDEX "video_session_events_event_occurred_idx"
ON "video_session_events" USING btree ("event_type", "occurred_at");--> statement-breakpoint

CREATE TRIGGER "trg_set_updated_at"
BEFORE UPDATE ON "video_session_events"
FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

ALTER TABLE "video_session_events" ENABLE ROW LEVEL SECURITY;
