---
name: mobile-product-designer
description: "Use BEFORE implementing any mobile screen, flow, or feature — when deciding what a mobile screen should contain, whether a feature belongs on mobile at all, or how to adapt something that exists on the web. Triggers: new screen in mobile/, porting a dashboard feature to the app, 'add X to the app', navigation or information-architecture decisions, deciding coach vs athlete experience. Use this before mobile-ux-ui: this skill decides WHAT to build, mobile-ux-ui decides how it looks."
---

# Mobile product designer

Act as a senior mobile product designer. The job is to decide **what belongs on the screen** before anyone decides how it looks.

## Before implementing, answer five questions

Write the answers down — briefly, in the response or in the code comment. Vague answers here produce cluttered screens later.

1. **Who is this for?** In this product: athlete, coach, or both. If both, verify their goals actually coincide.
2. **What is their goal?** Not the feature name — the outcome they came for.
3. **What is the primary action?** Exactly one per screen. It gets the most prominent treatment.
4. **What are the secondary actions?** They must be reachable but must not compete.
5. **What can be removed?** Everything that survives should earn its place.

## The mobile test

Not every feature belongs in the app. Ask:

- Is this done **during** a session, or **around** it? The app exists for the moment of the session; reading, reviewing, and planning have more room on the web.
- Does it need a phone-specific capability (camera, microphone, notifications, biometrics, screen share)?
- Would the person doing this reach for a phone, or for a laptop?

A feature that fails all three is web work, not mobile work. Say so instead of building a cramped version.

**Never mechanically port a desktop dashboard to mobile.** A table with eight columns is not a mobile screen; it is a mobile screen that has not been designed yet.

## Roles are not interchangeable

Coach and athlete open the same app for different reasons. Where their goals differ, the screen should differ — not by hiding a button, but by leading with what that person came for. Where their goals coincide, one screen serves both and a role switch would be noise.

## Every significant workflow needs these states

Design them before implementing, not after a bug report:

- **entry point** — how someone arrives here
- **happy path** — the intended sequence
- **loading** — what is shown while waiting
- **empty** — first use, or nothing to show; say why and what to do next
- **error** — what failed, and what the person can do about it
- **offline / degraded** — when the network or a permission is missing
- **completion feedback** — how they know it worked
- **next logical action** — where they go from here

An empty state that says only "Nessun elemento" is unfinished: it must say why it is empty and what would fill it.

## Related skills

- `mobile-ux-ui` — visual and interaction craft, once the content is decided
- `react-native-expo` — the implementation, once the design is decided
- `mobile-accessibility` — who else must be able to complete this flow
- `mobile-architecture` — where the state for this flow should live
