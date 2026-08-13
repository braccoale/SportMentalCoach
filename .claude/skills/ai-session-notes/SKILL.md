---
name: ai-session-notes
description: "Use for ANY work on the AI session notes pipeline — recording consent, LiveKit egress, audio storage, transcription, the report generated for the coach, the worker that advances the queue, or anything under lib/core/ai-session-notes. Triggers: 'appunti AI', 'riepilogo', 'trascrizione', consent panel, sessionAiNotes status, stt-callback, egress webhook, the worker not running, a session stuck in processing. Read this BEFORE changing a status, a state transition, or a worker step."
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
```

Terminal states are terminal. **Never write a status directly** — go through the transition, or `INVALID_TRANSITION` stops being a guarantee and the pipeline starts holding states nobody designed.

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

## Rules for changing this pipeline

1. **Every step must be resumable.** The process can die between any two steps; assume it will.
2. **Failure must be visible.** A silent `catch` here means a coach waits for a report that will never arrive. Log with reason, or set the failure status.
3. **Isolate steps from each other.** One booking's failure must not stop the queue.
4. **Keep decisions pure and tested.** Retry timing, consent rules, close policy — all `node --test`-able with a fixed `now`, and all already are.
5. **Never verify by inspection.** "The code looks right" has been wrong here before. Check the workflow run, the log, the row.

## Related skills

- `realtime-video-calls` — the call the recording comes from
- `booking-scheduling` — when a session is considered over, which gates processing
