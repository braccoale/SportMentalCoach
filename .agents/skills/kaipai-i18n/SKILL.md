---
name: kaipai-i18n
description: Resume, plan, implement, or audit KaiPai multilingual and localization work across web, mobile, email, notifications, and AI while keeping the durable project checklist current.
---

# KaiPai i18n

Use this skill for every KaiPai request involving languages, translations,
locale preferences, `next-intl`, localized copy, or multilingual rollout.

## Start here

Read `../../../docs/i18n-roadmap.md` completely before taking action. It is the
durable source of truth for completed work, open work, decisions, and the last
verification. Then inspect the relevant implementation: the repository may
have moved ahead of the checklist. Code is evidence; update the roadmap in the
same turn whenever verified reality differs from it.

For a status request, report the current checkpoint and the smallest sensible
next slice. For implementation, complete one coherent unchecked slice unless
the user explicitly chooses a broader scope.

## Invariants

- Keep `PLANNED_LOCALES` separate from `ENABLED_LOCALES`. Never expose a locale
  until its agreed release surface is complete and tested.
- Preserve stable URLs without locale prefixes unless the product explicitly
  revisits locale routing and multilingual SEO.
- Preserve locale precedence: authenticated profile, `kp_locale` cookie,
  `Accept-Language`, then Italian default.
- Add every enabled catalogue to the explicit loader map and keep exact,
  non-empty key parity with the Italian catalogue.
- Server Components may consume the complete request catalogue. Add client
  namespaces to the allowlist only when a Client Component actually needs
  them; do not serialize the whole catalogue to the browser.
- Treat `docs/i18n-inventory.md` as a heuristic list of candidates requiring
  review, not as proof that every match must be translated.
- Keep UI locale, AI input/output language, and content language conceptually
  separate. Do not infer one from another without an explicit product rule.
- Keep web, mobile, email, notifications, legal content, and AI in the same
  locale contract while allowing channel-specific catalogues and release
  timing.

## Working loop

1. Check the roadmap and relevant source before proposing or editing.
2. Regenerate the inventory after copy migration with
   `npm run i18n:inventory`; verify it with `npm run i18n:inventory:check`.
3. Add or update focused tests for catalog parity, locale resolution, and the
   migrated surface. Run TypeScript, relevant tests, and a production build in
   proportion to the change.
4. Update `docs/i18n-roadmap.md`: check off only evidence-backed work, record
   any decision that constrains future work, update the verification block,
   and identify the next coherent slice.

Do not silently enable a language as part of infrastructure or copy migration.
Enabling a locale is a distinct rollout decision.
