---
name: web-mobile-parity
description: "Use whenever a behaviour exists on the web and must also work in the app, or the two disagree. Triggers: 'come sull'app web', 'devono essere speculari', app and web showing different times/labels/options, adding a mobile route for something the web already does, copying a rule into mobile/, or deciding whether the app or the server should compute something. Read this BEFORE writing logic in mobile/ that the web already performs."
---

# Web e app: una regola sola, in un posto solo

The app is a companion to the web product, not a second implementation of it. Every rule written twice is a rule that will diverge — and it has, in production.

## The question to ask first

**Is this a datum or a decision?**

- A **datum** (a name, a time, a status) travels.
- A **decision** ("is this slot bookable?", "may this person join now?", "is this session over?") is a rule. It belongs to `lib/core/`, runs on the server, and the client receives the outcome.

When a client needs a decision, do not port the rule into the client. Return the answer. The mobile new-appointment route does exactly this: the server runs `slotPresentation` and responds with `{ time, suffix, selectable, tone, fitsDurationMin }`, because copying that judgement into the app is what produced the divergence in the first place.

## What divergence has already cost

- The app carried its own list of bookable hours. The web offered `10:10`, the app `11:00`, and the phone could propose times the coach did not work.
- The app built appointment instants from device time. 8:00 became 10:00.
- The app filtered on an invented booking status. No athlete request ever reached it, and nothing reported an error.
- The heartbeat route accepted only a browser cookie, so a session held from the phone left no trace of its real duration.

Each was small in code and large in consequence, and none produced an error message.

## How to extend the backend for the app

**Extend the shared route; do not write a mobile twin.** `getApiUser(request)` accepts the app's Bearer token *and* the browser cookie, so one route serves both clients and there is not a second set of permission rules to keep aligned. When adding a capability to the app, check whether the web route can simply accept a Bearer token.

`app/api/mobile/*` exists only for genuinely mobile-shaped payloads — a smaller, flatter response for a phone — never for a different rule.

## Where the two may legitimately differ

Parity of **rules**, not of **screens**. The app is deliberately narrower: it exists for the moment of the session, while reading, reviewing and planning stay on the web. Not reproducing a web feature on mobile is a valid decision — say so explicitly rather than shipping a cramped version.

So:

- The same booking rules, the same statuses, the same times, the same labels for the same thing (`Apri videochiamata` is green in both).
- Different layout, different density, different navigation, sometimes fewer options.

When you deliberately leave something out, **state it as a decision**, so it is not later discovered as a bug.

## Checklist

1. Is this a decision? Then the server answers it.
2. Does `lib/core` already contain the rule? Reuse; never re-derive.
3. Can the existing web route accept a Bearer token instead of a new mobile route?
4. Do the two clients use the same wording and the same colours for the same action?
5. If the behaviour is intentionally different, is that written down?

## Related skills

- `booking-scheduling` — the rules that must not be duplicated
- `mobile-architecture` — where mobile state and contracts live
- `mobile-product-designer` — deciding what belongs on a phone at all
