---
name: booking-scheduling
description: "Use for ANY work touching appointments, availability, time slots, session timing or timezones — creating or rescheduling a booking, deciding which start times to offer, marking a slot busy or too short, judging whether a session is upcoming/joinable/expired, or showing a date on web or mobile. Triggers: new-appointment UI, calendar, bookableDays, slot picker, durationMin, scheduledFor, 'orari', 'occupato', 'disponibilità', an appointment showing the wrong time, or web and app disagreeing about a session. Read this BEFORE writing any date arithmetic."
---

# Prenotazioni, disponibilità e tempo

The booking rules are the core of the product and the place where web and mobile have already diverged once. This skill exists so the same rule is never written twice.

## The one rule that prevents the recurring bug

**A scheduling decision is a rule, not a datum. It lives in `lib/core/`, and every client asks the server for the answer.**

The real incident: the mobile app carried its own list of hours — `[8, 9, 10, 11, 12, 14, ...]` — hardcoded in a component. It ignored the coach's weekly availability, the appointments already taken, and the session duration. The web offered `10:10`, the first genuinely free slot; the app offered `11:00`. The two-hour gap was the visible symptom. The real defect was that the phone could propose a time the coach does not work, and the refusal only arrived on submit — which reads as a broken app, not a wrong choice.

Before writing any slot, duration or date logic, ask: **does `lib/core` already decide this?** It almost always does.

## Where the rules actually live

**`lib/core/availability/index.ts`**
- `getBookableDays(slots, opts)` — the selectable days and start times, derived from the coach's weekly availability, in Rome time. `opts.busyIntervals` removes what is taken; `opts.excludeBookingId` stops a booking being blocked by itself when rescheduling.
- `getCoachBusyIntervalsByProviderIds(ids)` — future `requested`/`accepted` sessions per coach.
- `parseRomeLocalDateTime('2026-08-14T10:10')` — reads a Rome wall-clock string into an instant, resolving the DST side correctly.

**`lib/core/availability/validation.ts`**
- `busyIntervalsAt(intervals, now)` — what still occupies the calendar, filtered on each session's **end**, because that is what the insert-time overlap check compares against.
- `slotPresentation(maxDurationMin, time, durationMin, canAdjustDuration)` — the single judgement of a start time: free, **too short** (`· Solo 30 min`, still choosable at a shorter duration), or **occupied** (inside a session, not choosable). Also `slotAvailability` and `slotLabelSuffix`.
- `dropPastStarts(days, now)` — removes starts that have gone by since the options were computed.

**`lib/core/sessions.ts`**
- `sessionEndsAt`, `isSessionJoinable`, `canJoinVideoNow` (opens `VIDEO_JOIN_LEAD_MINUTES` = 5 before the start, closes at the end), `nextVideoJoinAvailabilityChange`.
- `isSessionUpcoming({ scheduledFor, durationMin, status, lastHeartbeatAt }, now)` and `isRequestExpired`.

**`lib/core/bookings/duration.ts`**
- `SESSION_DURATION_OPTIONS`, `DEFAULT_SESSION_DURATION_MIN`, `largestFittingDuration`. Duration belongs to the **session**, not to the service: the same service runs 30 minutes with one athlete and 60 with another, and it is the session's length that decides which slots still fit.

## Timezone: everything is Rome, nothing is the device

Appointments are wall-clock times in `Europe/Rome`. The client sends `YYYY-MM-DDTHH:mm` and the **server** turns it into an instant with `parseRomeLocalDateTime`.

Never build the instant on the client. `new Date(...)` and `setHours` read the *device's* timezone: a coach travelling abroad would see appointments move by hours with nobody having touched them. This has already happened once — 8:00 became 10:00.

For display, always `Intl.DateTimeFormat` with `timeZone: 'Europe/Rome'`.

## `sessionEndedAt` is a heartbeat, not a closure

It is the time of the **last ping from a connected participant**, rewritten every 15 seconds during the call (`recordSessionHeartbeat`). It exists to measure the real duration even when someone closes the window abruptly.

Treating a non-null value as "the session is over" declares a session finished the instant somebody enters it. That shipped: leaving a call for a moment moved it out of the upcoming list and into history. What distinguishes "just stepped out" from "ended an hour ago" is **how long the heartbeat has been silent** — `HEARTBEAT_STALE_MINUTES`.

The heartbeat is sent by both clients. The route accepts a Bearer token as well as a cookie.

## Booking statuses — the real ones

`requested`, `accepted`, `declined`, `cancelled`, `completed`, `expired`.

There is no `pending`. Filtering on that invented value meant **no athlete request ever reached the app**, and nothing reported a problem, because a query that finds no rows is not an error. When filtering on status, take the values from the schema, not from memory.

## Checklist before touching booking code

1. Does `lib/core` already implement this decision? Reuse it; do not re-derive.
2. Does the change affect **both** web and mobile? If the app needs the answer, return the answer from the server rather than copying the rule into the app.
3. Is any date built from device time? It must not be.
4. Have the statuses been read from the schema?
5. Is the rule covered by a `node --test` test with a fixed `now`? Time-dependent rules are exactly the ones that cannot be verified by hand.
6. Would this offer something the server would then refuse? Offering and denying in the same gesture reads as a fault.

## Related skills

- `web-mobile-parity` — how a rule reaches both clients without being duplicated
- `realtime-video-calls` — the join window in practice
- `mobile-product-designer`, `mobile-ux-ui` — presenting slots on a phone
