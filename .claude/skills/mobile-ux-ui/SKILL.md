---
name: mobile-ux-ui
description: "Use when writing, styling, or reviewing mobile UI — layout, spacing, typography, hierarchy, navigation, touch targets, animation, loading/empty/error presentation. Triggers: building or restyling a screen or component in mobile/, 'this screen looks wrong/cluttered/ugly', reviewing a mobile screenshot, choosing between layouts. Use AFTER mobile-product-designer has settled what the screen contains; use mobile-accessibility alongside it."
---

# Mobile UX/UI

Act as an exceptional senior mobile UX/UI designer. This skill is about craft: the content is already decided (see `mobile-product-designer`).

## The question to keep asking

> Could this screen be simpler without losing capability?

Most mobile screens improve by removing something. If the answer is yes and you do not act on it, say why.

## What to optimize

**Hierarchy first.** One thing should be obviously most important. Achieve it with size, weight, and space — not with a border and a background.

**Typography.** Two or three sizes per screen. Line height around 1.4–1.5 for body text. Never rely on a size below 12pt to carry meaning.

**Spacing.** Pick a scale (4/8/12/16/24) and stay on it. Inconsistent spacing reads as carelessness even when nobody can name what is wrong.

**Touch ergonomics.** Minimum 44×44pt for anything tappable; use `hitSlop` when the visual element is genuinely smaller. Primary actions belong in the lower half of the screen, within thumb reach. Destructive actions do not sit next to frequent ones.

**Navigation clarity.** At any moment: where am I, how do I go back, what happens next. Back must never be a trap.

**Progressive disclosure.** Show the common case; put the rest one deliberate tap away.

**Motion with restraint.** Animate to explain a change of state or position. Duration 150–250ms. Nothing decorative that repeats — it ages into an irritation by the tenth time.

**Polish the unhappy states.** Loading, empty, and error states are most of the perceived quality of an app and are usually the least designed. A spinner with no context, or an error that says "Errore", is unfinished work.

## What to avoid

- generic SaaS dashboard aesthetics on a phone
- cards inside cards; borders around things that are already separated by space
- excessive cards where a plain list would read better
- desktop tables squeezed onto a narrow screen
- tiny touch targets
- walls of text where two lines would do
- several CTAs competing for the same attention
- arbitrary gradients and overdone glass effects
- decoration with no function

## When reviewing UI

Give **concrete** changes: which element, what to change, what improves. "Rendilo più pulito" is not a review. "Il titolo e il sottotitolo hanno lo stesso peso: porta il sottotitolo a 13pt in `theme.mid` così il nome resta la prima cosa che si legge" is.

## In this repository

The mobile app uses React Native with a role-based palette (`src/theme.tsx`: `ink`, `surface`, `line`, `hi`, `mid`, `low`, `red`). Style through those tokens and both light and dark themes keep working. A literal hex in a screen is a bug in one of the two themes.

## Related skills

- `mobile-product-designer` — what the screen should contain
- `react-native-expo` — how to build it in this codebase
- `mobile-accessibility` — contrast, font scaling, screen readers
- `mobile-performance` — before adding animation or heavy imagery
