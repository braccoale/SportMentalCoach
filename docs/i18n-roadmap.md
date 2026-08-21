# KaiPai multilingual roadmap

Last updated: 2026-08-18
Current checkpoint: **foundation through phase 4 complete; Italian remains the
only enabled locale.**

This is the durable handoff for future multilingual work. The generated string
census lives in [`docs/i18n-inventory.md`](./i18n-inventory.md); that report is
a heuristic inventory, while this document records product and engineering
state.

## Current channel status

| Channel | Infrastructure | Copy migration | Languages enabled |
| --- | --- | --- | --- |
| Web | Foundation complete | Shared shell only; most product copy remains Italian/hardcoded | `it` |
| Email and notifications | Not localized end to end | Not started beyond shared notification UI | `it` behavior |
| AI | Locale contract only | Prompts and generated-content policy not localized | None separately configured |
| Mobile | Locale contract planned | Localization runtime and catalogues not started | `it` behavior |

Planned locale contract: `it`, `en`, `es`, `fr`.
Enabled locale contract: `it`.

## Decisions that remain in force

- Italian is the default and fallback locale.
- Planned and enabled locales are separate. A planned language must not appear
  in the selector or resolution chain before its release scope is complete.
- URLs currently have no locale prefix. Locale routing and localized SEO URLs
  are deferred product decisions.
- Resolution order is profile -> `kp_locale` cookie -> `Accept-Language` ->
  Italian.
- `next-intl` is the web runtime. Catalogues are loaded by an explicit,
  statically analyzable map.
- Enabled catalogues must have the same non-empty keys as Italian.
- Client Components receive only allowlisted namespaces; Server Components can
  use the full request catalogue.
- UI locale, content locale, and AI response language are separate concepts.
- The inventory is deliberately heuristic and requires human review before a
  candidate is migrated or excluded.

## Completed foundation

### Phase 1 - Locale contract and technical baseline

- [x] Define canonical locale codes: `it`, `en`, `es`, `fr`.
- [x] Define Italian as default and the only initially enabled locale.
- [x] Store native labels, BCP 47 formatting locales, and text direction.
- [x] Install and pin `next-intl` (`4.13.7`).
- [x] Configure `next-intl` without locale-based URL routing.
- [x] Set the HTML language dynamically and opt out of browser auto-translation.
- [x] Add unit tests for locale normalization and rollout configuration.

### Phase 2 - Preference resolution and persistence

- [x] Implement profile -> cookie -> browser header -> default precedence.
- [x] Add the server-managed, HTTP-only `kp_locale` cookie.
- [x] Persist the authenticated user's locale on the common profile.
- [x] Add a language control in settings that exposes enabled locales only.
- [x] Avoid unnecessary authentication/profile reads while only Italian is
  enabled.
- [x] Cover cookie, regional locale, `Accept-Language`, and disabled-locale
  behavior with tests.

### Phase 3 - Runtime integration

- [x] Load the request locale and catalogue in the root layout.
- [x] Provide translated messages to Client Components.
- [x] Keep locale-aware metadata in the server translation path.
- [x] Establish the initial Italian catalogue and namespace convention.
- [x] Keep public behavior unchanged while the other catalogues are absent.

### Phase 4 - Inventory, first migration, and guardrails

- [x] Add an AST-based inventory for `app`, `components`, core/vertical code,
  and mobile source.
- [x] Generate a versioned, area-classified inventory baseline.
- [x] Add `i18n:inventory` and `i18n:inventory:check` commands.
- [x] Migrate shared actions, user menu, dashboard shell, notification UI,
  consent UI, footer, and invite flow into the Italian catalogue.
- [x] Add explicit catalogue loaders and fail-fast enabled-locale coverage.
- [x] Add exact, non-empty catalogue-key parity tests.
- [x] Serialize only required namespaces to Client Components.
- [x] Split the dashboard header into a Client Component while keeping the
  translated footer server-rendered.
- [x] Document the architecture and add source-level shared-copy guardrails.

Inventory baseline after phase 4: **3,517 candidates across 280 files**. See
the generated report for the current per-area breakdown.

## Remaining work

### Phase 5 - Curate the inventory and define migration slices

- [ ] Review false positives and record durable exclusions in the scanner.
- [ ] Separate user-facing UI copy from technical literals, seeded data, logs,
  test fixtures, and developer-only messages.
- [ ] Confirm namespace/key naming conventions for page, feature, shared, and
  validation copy.
- [ ] Freeze a prioritized migration order. Recommended first slice: public
  pages + authentication + onboarding/settings.
- [ ] Decide the exact web release scope required before English can be
  enabled; do not equate partial catalogue parity with product completeness.

### Phase 6 - Migrate the web product

- [ ] Public marketing and marketplace pages, metadata, navigation, and empty
  states.
- [ ] Authentication, password recovery, invitations, onboarding, and settings.
- [ ] Athlete dashboard surfaces.
- [ ] Coach dashboard surfaces.
- [ ] Admin and club surfaces.
- [ ] Forms, validation, toasts, API errors shown to users, and accessibility
  labels.
- [ ] Dates, times, numbers, currencies, plurals, and relative-time formatting
  through locale-aware formatters.
- [ ] Reduce the unreviewed inventory after every migrated slice.

### Phase 7 - English web rollout

- [ ] Create `messages/en.json` with exact Italian catalogue parity.
- [ ] Translate terminology with a KaiPai glossary, not isolated literal
  translation.
- [ ] Review layout expansion, plurals, validation, accessibility, and critical
  user journeys.
- [ ] Validate profile/cookie/browser resolution with both `it` and `en`
  enabled.
- [ ] Decide localized metadata/SEO behavior before indexing English pages.
- [ ] Enable `en` only after the agreed release scope and QA gate pass.
- [ ] Add production observability for selected locale and missing-message
  failures without storing sensitive content.

### Phase 8 - Spanish and French

- [ ] Reuse the English rollout checklist for `es`.
- [ ] Reuse the English rollout checklist for `fr`.
- [ ] Perform native-language review for coaching and sport-psychology terms.
- [ ] Enable each locale independently after its own QA gate.

### Phase 9 - Email, notifications, legal, and support content

- [ ] Define recipient-locale resolution for transactional email and push.
- [ ] Localize templates, subjects, notification bodies, and preference pages.
- [ ] Version templates by locale and define fallback behavior.
- [ ] Translate legal documents only with appropriate legal review and keep
  consent/version tracking locale-aware.
- [ ] Localize customer-support and operational copy that reaches users.

### Phase 10 - AI language architecture

- [ ] Define separate fields/rules for UI locale, source language, requested
  response language, and stored content language.
- [ ] Localize system prompts and user-facing AI controls without translating
  internal identifiers or structured contracts.
- [ ] Define fallback and mixed-language behavior for transcripts and reports.
- [ ] Add multilingual quality, safety, terminology, and regression evaluations.
- [ ] Decide whether historical AI output is preserved, translated on demand,
  or regenerated.

### Phase 11 - Mobile

- [ ] Re-evaluate the current Expo/React Native localization libraries when the
  work starts; do not select from stale assumptions.
- [ ] Reuse canonical locale codes and preference semantics from web.
- [ ] Decide whether mobile catalogues are shared, generated, or channel-owned.
- [ ] Implement device/profile synchronization and offline fallback.
- [ ] Localize native permissions, push content, deep links, store listing, and
  accessibility labels.
- [ ] Add device-level QA for truncation, system locale changes, and app updates.

### Phase 12 - Cross-channel QA and operations

- [ ] Add pseudo-localization or another automated layout-stress mechanism.
- [ ] Add end-to-end locale-switching tests for anonymous and authenticated
  users.
- [ ] Test fallback behavior for missing and malformed messages.
- [ ] Define translation ownership, glossary maintenance, review status, and
  catalogue update workflow.
- [ ] Add CI gates for inventory freshness, catalogue parity, TypeScript, tests,
  and production build.
- [ ] Track rollout and errors per locale without fragmenting user identity or
  leaking sensitive content.

## Definition of done for enabling a locale

- [ ] The agreed channel/release scope is explicit.
- [ ] The catalogue loader exists and exact non-empty key parity passes.
- [ ] No unreviewed high-priority hardcoded copy remains in that scope.
- [ ] Locale selection, persistence, fallback, and logout/login behavior pass.
- [ ] Critical journeys pass functional, layout, accessibility, and native
  language review.
- [ ] Metadata, notifications, legal implications, analytics, and support
  behavior have an explicit decision, even when intentionally deferred.
- [ ] The locale is added to `ENABLED_LOCALES` only in the final rollout change.
- [ ] Production monitoring and rollback behavior are defined.

## Last verified baseline

Verified on 2026-08-18:

- `npm run i18n:inventory` -> 3,517 candidates across 280 files.
- `npm run i18n:inventory:check` -> current.
- i18n/inventory pretest -> 26 passing.
- complete application test suite -> 646 passing.
- TypeScript -> passing.
- production build -> passing; 69 pages prerendered/collected.

Known non-blocking build warnings: Next.js reports the legacy `middleware` file
convention as deprecated, and `baseline-browser-mapping` data as stale. Neither
warning is caused by the multilingual foundation.

## Resume procedure

1. Read this file and inspect `git status`; preserve unrelated work.
2. Run `npm run i18n:inventory:check` and the focused i18n tests.
3. Compare checked items with the actual code and correct stale status.
4. Choose one coherent unchecked slice, starting with phase 5 unless the user
   explicitly selects another channel.
5. Implement and verify the slice.
6. Update this checklist and its verification block before handing off.
