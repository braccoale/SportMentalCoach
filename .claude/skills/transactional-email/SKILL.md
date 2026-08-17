---
name: transactional-email
description: "Use for ANY work on outbound email or in-app notifications — adding an event, changing copy, touching preferences, debugging a mail that did or did not arrive, or building a new alert. Triggers: notify(), NOTIFICATION_EVENTS, email_templates, notification_email_deliveries, notificationPreferences, Resend, sendNotificationEmail, idempotency key, reminders, 'non è arrivata la mail', 'mail doppia', unsubscribe, opt-out."
---

# Email transazionali e notifiche

Two failure modes matter here, and they are opposites: **the mail that never arrives**, and **the mail that arrives twice**. Everything in this area is arranged around not doing either.

The design in one line: **the catalogue is code, the words are data.**

## The catalogue is code, and it is the boundary

`lib/core/notifications/catalog.ts` is the single source of truth for *what* the platform notifies about:

- which events exist and their stable keys;
- which channels each uses, and the per-channel defaults;
- `mandatoryEmail` — whether a user may opt out at all (plus `mandatoryReason`, shown beside the locked toggle);
- `variables` — the whitelist of template variables the copy may read.

The `email_templates` table may only change **subject and body**. It can never introduce an event, change a recipient, widen the variable whitelist, or make a mandatory email optional. If a change needs any of those, it is a code change and a review — not a row edit.

No `server-only` import: it is pure data plus pure functions, so the preferences page and the tests read it directly.

## Sending

`notify(type, recipientUserId, ctx)` in `lib/core/notifications/index.ts` is the entry point. It resolves the event, builds the content, adds the personal greeting when there is an in-app twin, and fans out to the channels the event and the user's preferences allow.

Underneath, `lib/core/email/index.ts` talks to **Resend over plain `fetch`** — the `resend` package is not installed. Two properties to preserve:

- `sendEmail` **never throws.** It returns a `SendResult` (`{ok:true, messageId}` / `{ok:false, skipped:true, reason}` / `{ok:false, skipped:false, error}`) so the caller can record what happened. A notification failing must never break the action that triggered it.
- With no `RESEND_API_KEY` or sender configured, it logs and returns `skipped` — local development sends nothing and fails nothing.

For a mail that is not product copy (internal reports, the contact form), build the HTML in code with `wrapEmailHtml` / `wrapEmailText` and skip the template table entirely. `sendContactMessageEmail` and `sendSessionOutcomeEmail` are the two precedents.

## Idempotency: key the event, never a time window

`lib/core/notifications/idempotency.ts`:

```
v1:{eventKey}:{channel}:{recipientUserId}:{scope}
```

`scope` identifies the concrete thing that happened, in order of preference:

1. `n{notificationId}` — the in-app notification the mail mirrors; every domain event creates its own row, so distinct events always differ;
2. an explicit scope for events with no in-app twin or that fire on a schedule: `b{bookingId}`, `inv{invitationId}`, `rep{reportId}`.

**Never key on a time window.** "One email of this type per day" silently swallows the second chat message and the second appointment — both real, distinct events that deserve their own mail.

A retry rebuilds the same key, the insert into `notification_email_deliveries` conflicts on the unique index, and no second mail goes out.

## The delivery ledger answers "why didn't I get it?"

`lib/core/email/deliveries.ts` — claim first, send, then record the outcome:

| function | when |
|---|---|
| `claimDelivery` | before sending; returns `null` if the key already exists — that is the duplicate guard |
| `markDeliverySent` | with the provider message id |
| `markDeliveryFailed` | with the error, truncated to 1000 chars |
| `markDeliverySkipped` | deliberately not sent: preference off, no address, email disabled |
| `hasBeenSent` | read-only check |

**A skip is recorded, not dropped.** Otherwise "why didn't I get it?" has no answer, and the key stays claimed so nothing retries later.

This ledger is reusable for any new alert. It is what the AI-notes outcome report uses, and it means a new alert needs no new table.

## Copy lives in the database

Templates are rows in `email_templates`, resolved by `resolveTemplate` with `DEFAULT_LOCALE`. `default-templates.ts` holds the fallbacks and `validateDefaultTemplates()` checks them against the catalogue's variable whitelist.

Consequence to remember: **a new template must be seeded in the production database** — `npm run email:seed-templates`. Shipping code that references a template nobody seeded produces a mail with a missing body, not an error.

Useful while working: `email:preview` renders them, `email:shoot` captures them, `email:build-logo` regenerates the inlined logo.

## Rules

1. **Never let a notification failure break the caller.** Catch, record, continue.
2. **Escape everything user-supplied** with `escapeHtml` before it reaches the HTML body.
3. **Always send both `html` and `text`.** `wrapEmailText` exists for the second half.
4. **Respect `mandatoryEmail`.** Making a security or legal mail optional is a product decision, not a refactor.
5. **Never put session content in an operational mail** — see `ai-session-notes` for what that rule costs when broken.

## Red flags

- A new event added straight into the template table instead of the catalogue.
- An idempotency key built from a date or a timestamp.
- `sendEmail` called without claiming a delivery first, for anything that can be retried.
- A template variable read in the copy but absent from `variables`.
- A `catch {}` around `notify()` that records nothing.

## Related skills

- `ai-session-notes` — the outcome report is built on this ledger, and defines what must never appear in a mail
- `guardians-legal` — invitation and revocation mails, where the recipient may not be a user yet
