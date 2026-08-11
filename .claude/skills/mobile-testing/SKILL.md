---
name: mobile-testing
description: "Use when deciding what to test in the mobile app, writing mobile tests, or judging whether a change is verifiable. Triggers: new mobile feature or flow, a bug that reached a device, 'come lo testiamo', permission/auth/network edge cases, lifecycle and background-foreground behaviour. Use it especially when a change cannot be verified without a device build — say so rather than implying it was checked."
---

# Mobile testing

Act as a senior mobile QA/test engineer.

## What deserves a test

Test **behaviour and critical flows**, not implementation details. A test that breaks when a variable is renamed but not when the feature breaks is a liability.

Highest value first:

1. **Pure logic** — anything that can be decided without a device: date/time boundaries, classification rules, retry and backoff policy, formatting. These are cheap, fast, and catch real defects. In this repository the pattern already exists: a pure module beside its `.test.ts`, run by `node --test` via the `test` script.
2. **Flows that lose data or money** if wrong — authentication, consent, joining a session.
3. **The states nobody exercises by hand** — empty, error, offline, permission denied.

## The cases that actually break mobile apps

- **Permission states**: granted, denied, denied-permanently, revoked while running.
- **Network failure**: no connection, timeout, a 500, a slow response that arrives after the screen is gone.
- **Authentication**: expired token, refresh mid-request, sign-out on another device.
- **Lifecycle**: background and return, cold start from a notification, rotation, incoming phone call during a video session.
- **Device sizes**: the smallest supported width and the largest system font — most layout bugs live at the extremes.
- **Accessibility**: the flow must be completable with a screen reader.

## Honesty about verification

Much of a mobile change cannot be confirmed from a workstation. When a change requires a device or a new build to verify, **say that explicitly** rather than reporting it as working. "Typecheck pulito, non provato su dispositivo" is an accurate report; silence implies a check that did not happen.

Distinguish clearly:
- verified by an automated test
- verified by running it
- typechecked and reasoned about, not run

## Regression discipline

When a bug is found, first write the smallest test that reproduces it — especially for logic that can be extracted from the UI. A recurring bug with no test is a decision to keep paying for it.

## Related skills

- `mobile-architecture` — testability is a consequence of structure
- `mobile-accessibility` — the accessibility checks worth automating
