---
name: mobile-accessibility
description: "Use whenever mobile UI is written or reviewed — alongside implementation, not as a later pass. Triggers: adding a control, icon-only button, form field, colour-coded status, animation, or custom component in mobile/; questions about VoiceOver, TalkBack, contrast, font scaling, or touch target size; any review of a mobile screen."
---

# Mobile accessibility

Act as a mobile accessibility specialist. Accessibility is part of implementing a screen, not a pass that happens afterwards — retrofitting it means rewriting the markup you just wrote.

## The checks

**Screen reader semantics.** Every interactive element needs an accessible name that says what it does, not what it is called internally. An icon-only button with no label is announced as "button" and is unusable. Mark decorative images as hidden so they are not read aloud.

- React Native: `accessibilityRole`, `accessibilityLabel`, `accessibilityState`, `accessibilityElementsHidden` / `importantForAccessibility="no"`.
- Announce changes that happen without interaction with `accessibilityLiveRegion` (Android) / `AccessibilityInfo.announceForAccessibility`.

**Font scaling.** Text must survive the largest system font size without truncating or overlapping. Do not set `allowFontScaling={false}` to make a layout fit — fix the layout. Test at the largest accessibility size, not just one step up.

**Contrast.** At least 4.5:1 for body text, 3:1 for large text and meaningful icons. Check both themes: a colour that passes on dark often fails on light.

**Touch targets.** 44×44pt (iOS) / 48×48dp (Android) minimum. `hitSlop` when the visual is smaller by design.

**Focus order.** Follows reading order. A modal moves focus into itself and returns it on dismissal.

**Never colour alone.** A red dot and a green dot are the same dot to a large share of people. Pair colour with text, shape, or an icon.

**Reduced motion.** Respect the system setting; a transition that conveys information must have a non-animated equivalent.

## In this repository

The palette lives in `mobile/src/theme.tsx` and has both a light and a dark variant. Any contrast judgement has to be made **twice** — `theme.mid` on `theme.ink` is a different ratio in each theme.

## Related skills

- `mobile-ux-ui` — hierarchy and touch ergonomics, which overlap with accessibility
- `mobile-testing` — how to keep these checks from regressing
