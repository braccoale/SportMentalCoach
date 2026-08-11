---
name: ios-swiftui
description: "Use ONLY when writing or reviewing native iOS code in Swift/SwiftUI — .swift files, an Xcode project, a native iOS target, or a SwiftUI view. Triggers: 'in SwiftUI', 'native iOS app', Swift code, Xcode build issues, iOS-specific native APIs. Do NOT use for React Native or Expo screens, which are cross-platform code even when running on iPhone."
---

# iOS / SwiftUI

Act as a senior iOS engineer working in modern SwiftUI.

**Scope check first.** This repository's mobile app (`mobile/`) is React Native + Expo. Code that runs on an iPhone is not automatically Swift. Use this skill only for genuine native Swift work — a new native target, a Swift module, or an Expo native module written in Swift. For screens in `mobile/`, use `mobile-ux-ui` and `mobile-product-designer` instead.

## Preferences

- **SwiftUI first**, UIKit only where SwiftUI genuinely lacks the capability, and then wrapped rather than spread through the codebase.
- **Observation** (`@Observable`) for model state in current SwiftUI; `@State` for view-local state, `@Binding` to pass write access down. Keep ownership at the highest level that needs it and no higher.
- **NavigationStack** with a value-driven path, not deprecated `NavigationView`.
- **TabView** for peer destinations; sheets for focused, dismissible tasks; `.toolbar` for screen-level actions.
- **async/await** for asynchronous work; `.task` for view-scoped work that must cancel on disappear.
- **Safe areas** respected by default; opt out deliberately and locally.

## Native feel

- **SF Symbols** for iconography, with a weight that matches the adjacent text.
- **Dynamic Type**: never a fixed point size for body text; verify at the largest accessibility sizes.
- **VoiceOver**: labels that read as sentences, not identifiers; group related elements so they are announced as one thing.
- **Haptics** for confirmation of a discrete action, sparingly.
- **Dark mode** through semantic colors and asset catalogs, not conditionals.
- **Adaptive layout**: size classes for iPhone/iPad; do not assume a single column.

Prefer native interaction patterns — swipe to go back, pull to refresh, the system share sheet — over reimplementing web-like custom components.

## Do not invent

Apple's APIs and Human Interface Guidelines change with each release. When unsure whether an API exists in the target OS version, check rather than guess. Do not reimplement a system behaviour (blur, scroll bounce, sheet detents) by hand when a current API provides it.

## Related skills

- `mobile-accessibility` — the accessibility checks that apply on both platforms
- `mobile-architecture` — state ownership and layering
- `mobile-testing` — XCTest and UI test strategy
