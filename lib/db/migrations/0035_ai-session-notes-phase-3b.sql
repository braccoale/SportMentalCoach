CREATE TABLE "session_transcript_timeline_segments" (
  "id" serial PRIMARY KEY NOT NULL, "session_ai_notes_id" integer NOT NULL,
  "participant_recording_id" integer NOT NULL, "participant_user_id" integer,
  "participant_role" varchar(24) NOT NULL, "source_transcript_segment_id" integer NOT NULL,
  "global_sequence" integer NOT NULL, "participant_sequence" integer NOT NULL,
  "start_ms" integer NOT NULL, "end_ms" integer NOT NULL, "normalized_text" text NOT NULL,
  "normalization_flags" jsonb DEFAULT '{}'::jsonb NOT NULL, "source_provider" varchar(80), "source_model" varchar(80),
  "createddate" timestamptz DEFAULT now() NOT NULL, "createdby" integer, "updateddate" timestamptz DEFAULT now() NOT NULL, "updatedby" integer,
  CONSTRAINT "session_transcript_timeline_session_sequence_unique" UNIQUE("session_ai_notes_id", "global_sequence"),
  CONSTRAINT "session_transcript_timeline_source_unique" UNIQUE("source_transcript_segment_id"),
  CONSTRAINT "session_transcript_timeline_role_check" CHECK ("participant_role" IN ('coach','athlete')),
  CONSTRAINT "session_transcript_timeline_timing_check" CHECK ("global_sequence" >= 0 AND "participant_sequence" >= 0 AND "start_ms" >= 0 AND "end_ms" >= "start_ms")
);--> statement-breakpoint
ALTER TABLE "session_transcript_timeline_segments" ADD CONSTRAINT "session_transcript_timeline_session_fk" FOREIGN KEY ("session_ai_notes_id") REFERENCES "session_ai_notes"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "session_transcript_timeline_segments" ADD CONSTRAINT "session_transcript_timeline_participant_fk" FOREIGN KEY ("participant_recording_id") REFERENCES "session_participant_recordings"("id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "session_transcript_timeline_segments" ADD CONSTRAINT "session_transcript_timeline_source_fk" FOREIGN KEY ("source_transcript_segment_id") REFERENCES "session_transcript_segments"("id") ON DELETE cascade;--> statement-breakpoint
CREATE INDEX "session_transcript_timeline_session_chronological_idx" ON "session_transcript_timeline_segments" ("session_ai_notes_id", "start_ms", "end_ms");--> statement-breakpoint
CREATE INDEX "session_transcript_timeline_participant_idx" ON "session_transcript_timeline_segments" ("participant_recording_id", "participant_sequence");--> statement-breakpoint
CREATE TRIGGER "trg_set_updateddate" BEFORE UPDATE ON "session_transcript_timeline_segments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updateddate"();--> statement-breakpoint
ALTER TABLE "session_transcript_timeline_segments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "session_transcript_timeline_segments" FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON SEQUENCE "session_transcript_timeline_segments_id_seq" FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT ALL ON "session_transcript_timeline_segments" TO service_role;--> statement-breakpoint
GRANT USAGE, SELECT ON SEQUENCE "session_transcript_timeline_segments_id_seq" TO service_role;
