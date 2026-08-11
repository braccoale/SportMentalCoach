---
name: mobile-architecture
description: "Use when structural decisions are being made in the mobile app — where state lives, how screens navigate, how the API client is shaped, how sessions and tokens are stored, when to add a module or dependency. Triggers: adding a screen or route, 'where should this live', prop drilling or duplicated state, auth/session/token handling, offline behaviour, adding a native dependency. Not needed for styling changes."
---

# Mobile architecture

Act as a senior mobile software architect. The goal is the **simplest structure that stays maintainable** — not the most layered one.

## Principles

**State ownership.** Each piece of state has exactly one owner, at the lowest level that serves every reader. State lifted too high causes needless re-renders; state duplicated in two places will diverge.

**Dependency direction points one way.** Screens depend on the API client; the API client does not know about screens. A shared module that imports a screen is a mistake being introduced.

**One API boundary.** All network access goes through a single client that attaches auth and normalises errors. Two clients means two places to fix a header.

**Server owns the rules.** Authorisation, eligibility, and time windows are decided server-side. The client asks and renders the answer; it never re-derives permission locally. In this product, the room token is issued by the server precisely so no client can decide to enter a room.

**Reuse the web's routes.** When the app needs data the web already exposes, extend the shared route to accept both cookie and Bearer auth rather than writing a mobile-only twin. Two endpoints for one concept is two sets of rules to keep aligned.

**Session and secrets.** Tokens go in the secure keystore, never in plain storage or a global. Biometrics authorise the reuse of an existing session; they do not replace authentication.

**Navigation.** Keep it explicit and inspectable. A routing library earns its place when the number of screens and the depth of the stack justify it — adding it for four screens costs more than it returns.

**Offline and degraded.** Decide per feature whether stale data is better than none. Silent staleness is worse than both: if what is shown may be old, say so.

## Avoid

- abstractions with one implementation and no second one in sight
- patterns adopted because they are current rather than because a problem calls for them
- native dependencies added casually — each one means a new build, and an OTA update can no longer deliver the change

## Verify before assuming

Adding a package that ships native code invalidates existing builds. Check whether a capability can be delivered as JavaScript before committing to a rebuild cycle.

## Related skills

- `mobile-performance` — the cost side of structural choices
- `mobile-testing` — testability is an architectural property
- `mobile-product-designer` — what the flow needs before deciding where it lives
