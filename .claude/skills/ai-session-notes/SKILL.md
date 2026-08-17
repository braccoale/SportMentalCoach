---
name: ai-session-notes
description: "Use for ANY work on the AI session notes pipeline — recording consent, LiveKit egress, audio storage, transcription, the report generated for the coach, the worker that advances the queue, or anything under lib/core/ai-session-notes. Triggers: 'appunti AI', 'riepilogo', 'trascrizione', consent panel, sessionAiNotes status, stt-callback, egress webhook, the worker not running, a session stuck in processing, a lost recording, audio bitrate or storage limits, EGRESS_FAILED, 413 EntityTooLarge, Too Many Requests. Read this BEFORE changing a status, a state transition, or a worker step."
---

# Appunti AI: registrazione, trascrizione, riepilogo

The third core of the product, and the most fragile: it is a **multi-step asynchronous pipeline** whose failures are silent and only noticed when a coach opens a session and finds nothing.

## The shape of it

```
consent → recording (LiveKit egress) → stored audio → transcription
        → report (OpenAI) → coach review → shared
```

Every step happens outside the request that started it. Nothing here can be confirmed by a typecheck, and almost nothing fails loudly.

## The state machine is the contract

`lib/core/ai-session-notes/state-machine.ts` holds the only legal transitions:

```
waiting_for_consent → active | consent_rejected | cancelled
active              → processing | cancelled
processing          → ready_for_review | transcription_failed | report_failed
ready_for_review    → approved → shared
report_failed       → processing          (riapertura, mai automatica)
```

**Never write a status directly** — go through the transition, or `INVALID_TRANSITION` stops being a guarantee and the pipeline starts holding states nobody designed.

Terminal states are terminal, with **one deliberate exception**: `report_failed → processing`. That state does not mean "this session could not be summarised", it means "the summary never arrived" — and the transcript is usually still sitting in the table. `transcription_failed` stays closed on purpose: there the material is missing, so reopening would only buy a second round of waiting.

The reopening is never automatic. No worker walks it; it needs `npm run ai-notes:reopen -- <id> --apply`, which refuses anything but `report_failed` with segments present, and records `{ reopened: true, automatic: false }` in the audit trail. Entering any healthy state also clears `error_code` (`RESET_ERROR_ON` in `state-machine.ts`): a delivered report must not carry the reason it once failed.

Errors are a closed set (`AiNotesErrorCode`): `NOT_ENTITLED`, `OUTSIDE_CALL_WINDOW`, `UNVERIFIED_PARTICIPANT_PRESENT`, `REQUIRED_AUDIO_TRACK_MISSING`, `RECORDING_NOT_READY`, and others. Use the existing code; a new one means a genuinely new situation.

## Consent is not a formality

A recorded therapeutic conversation is the most sensitive thing this system holds.

- Recording starts only from `waiting_for_consent`, and only with consent actually given.
- An unverified participant in the room blocks it (`UNVERIFIED_PARTICIPANT_PRESENT`): consent is meaningless if it is unclear who is in the room.
- Refusal is a first-class outcome (`consent_rejected`), not an error.
- The consent UI must never be presented as an obstacle to remove. On mobile it is a small dismissible pill: it was a panel occupying half the screen, and it blocked the call controls beneath it.

If a change would make recording easier to start, check first that it does not make it easier to start **without consent**.

## Where things live

- `recording.ts`, `recording-config.ts`, `recording-policy.ts` — starting and describing an egress
- `recording-retry-policy.ts` — backoff `[30, 120, 300, 900]` seconds, bounded attempts, pure and tested
- `recording-resume.ts` — `findResumeCandidates` (a read-only query, exported separately so it can be inspected safely) and `resumeInterruptedRecordings`
- `livekit-webhook.ts`, `livekit-webhook-security.ts` — the egress callbacks and their signature checks
- `audio-storage.ts` — where the audio goes
- `stt-callback.ts`, `stt-callback-policy.ts`, `transcription-dispatch.ts` — transcription in and out
- `session-report-provider.ts`, `openai-session-report-provider.ts`, `session-report-contract.ts` — the report, behind a provider interface with a contract test
- `queue-runner.ts`, `worker-trigger.ts`, `worker-nudge.ts`, `processing.ts` — advancing the queue
- `pipeline-health.ts`, `pipeline-log.ts`, `stuck-sessions.ts` — noticing when it stops

The AI providers sit behind interfaces with contract tests. Keep them there: the pipeline must be testable without calling OpenAI.

## The worker

`POST /api/internal/ai-notes/process`, authorised by `CRON_SECRET`, driven by `.github/workflows/ai-notes-worker.yml` every 5 minutes. It runs **synchronously** on purpose, so the number of processed jobs lands in the run log — an asynchronous call returns 202 and tells you nothing.

If nothing is progressing, check in this order: the workflow ran at all; the secret is right (a wrong one gives 404, not 401); the job found candidates; the step that failed in `pipeline-log`.

A session sitting in `processing` is the normal symptom of every one of these.

## The external boundaries, and what they actually answer

Every failure this pipeline has produced in production happened at a seam with an outside service, and all of them share one shape: **we asked for something, never read the answer back, and carried on for weeks believing we had got it.** The numbers below were paid for once; do not re-derive them.

### Storage has a ceiling the code cannot raise

`getAiNotesAudioMaxBytes` asks for **128 MB** and `ensureAudioBucketPrivate` passes it to `updateBucket`. Supabase **accepts the call and keeps its own lower value** when the project's global upload limit is smaller — no error, no warning. The production bucket sat at **50 MB** for months while the code believed it had 128.

- The project-level limit lives in Dashboard → **Storage → Settings** (not Project Settings → Infrastructure, which is the database disk). On the **Free plan it is capped at 50 MB and cannot be raised**.
- `ensureAudioBucketPrivate` now re-reads `file_size_limit` and logs loudly when it is below what was requested. **Never add a config write here without reading the value back.**
- Exceeding it is not a truncation: S3 answers `413 EntityTooLarge` and **the whole object is lost**.

### Audio size is decided at publish time, not at recording time

Track egress records the track **as it arrives, without transcoding**. The file size is therefore set by the publisher's encoder:

- `livekit-client` defaults to `AudioPresets.music` (48 kbps) with `red: true`, and RED roughly doubles the payload → **~91 kbps, ~41 MB per hour, per voice**.
- `KAIPAI_AUDIO_PUBLISH_PRESET` in `lib/core/video/call-settings.ts` pins **32 kbps**, mirrored in `mobile/src/lib/call-audio.ts` (the app cannot import from `lib/`). A test in `call-settings.test.ts` fails if the arithmetic stops fitting under the ceiling.
- Raising the bitrate is a storage decision, not only an audio-quality one.

### LiveKit track egress cannot be segmented

Verified in the installed SDK: `startTrackEgress(roomName, output: DirectFileOutput | string, trackId, webhooks)`. `SegmentedFileOutput` exists **only** for `RoomComposite`, `Web` and `TrackComposite` — all of which mix participants and would destroy the per-speaker separation the transcript depends on.

So "split the recording into chunks" means stop-and-restart, and **restarting an egress is the most fragile operation in the pipeline**: two starts 200 ms apart earned a `Too Many Requests` from LiveKit and cost 48 minutes of a coach's voice. The guard is `busyTracks` plus `isWithinStartCooldown` in `recording.ts`, serialised by a `FOR UPDATE` on the session row. Do not build periodic rotation on top of it.

### Keep the provider's own error

An egress failure message is infrastructure text — no session content, no secrets — and it is the difference between reading the cause and guessing it. It is stored in `session_audio_recordings.error_message_sanitized`. When it is missing, `EgressClient.listEgress({ roomName })` still has it for a while.

## A green queue says nothing about outcomes

`getPipelineHealth` answers *"is the machine turning?"* — queued jobs, oldest wait, stuck sessions. Five minutes after a session was written off as `report_failed`, every one of those numbers was healthy, and correctly so: **a terminal failure and a success are indistinguishable from the queue, because neither leaves work to do.**

The question worth asking is in `session-outcome-report.ts`: *did this session produce a usable report, and if not why.* It classifies `ok` / `parziale` / `fallita` / `rifiutata` — `parziale` exists because a report delivered over a recording that lost an entire voice looks exactly like a success in every status field. `session-outcome-email.ts` mails one report per closed session, keyed for idempotency through `notification_email_deliveries`.

**Never put session content or the athlete's name in that mail.** Identifiers, timings, codes and counts only — the same rule as `pipeline-log.ts`, and stricter, because a mail leaves the system.

## Rules for changing this pipeline

1. **Every step must be resumable.** The process can die between any two steps; assume it will.
2. **Failure must be visible.** A silent `catch` here means a coach waits for a report that will never arrive. Log with reason, or set the failure status.
3. **Isolate steps from each other.** One booking's failure must not stop the queue.
4. **Keep decisions pure and tested.** Retry timing, consent rules, close policy — all `node --test`-able with a fixed `now`, and all already are.
5. **Never verify by inspection.** "The code looks right" has been wrong here before. Check the workflow run, the log, the row.

## Related skills

- `realtime-video-calls` — the call the recording comes from
- `booking-scheduling` — when a session is considered over, which gates processing
