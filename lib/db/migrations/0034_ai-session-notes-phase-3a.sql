-- Phase 3A: provider-neutral transcript model metadata and per-participant order.
ALTER TABLE "session_transcript_segments"
  ADD COLUMN "provider_model" varchar(80);--> statement-breakpoint
ALTER TABLE "session_transcript_segments"
  DROP CONSTRAINT "session_transcript_segments_session_sequence_unique";--> statement-breakpoint
ALTER TABLE "session_transcript_segments"
  ADD CONSTRAINT "session_transcript_segments_participant_sequence_unique"
  UNIQUE("participant_recording_id", "sequence_number");--> statement-breakpoint
CREATE INDEX "session_transcript_segments_physical_provider_idx"
  ON "session_transcript_segments" ("physical_recording_id", "provider", "provider_segment_id");
