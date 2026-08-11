---
name: react-native-expo
description: "PRIMARY skill for all ordinary mobile implementation in this repository: React Native, Expo and TypeScript. Use for screens, navigation, components, mobile state, permissions, app lifecycle, native capabilities, real-time audio/video calls, and any mobile-specific behaviour in mobile/. Pair with mobile-product-designer and mobile-ux-ui for significant UI work, with mobile-accessibility whenever UI is implemented, and with mobile-performance when speed or battery is in question. Do NOT invoke ios-swiftui or android-compose for ordinary React Native work — only when actual Swift or Kotlin native code is being written."
---

# React Native + Expo

The implementation skill for `mobile/`. Design decisions come from `mobile-product-designer` and `mobile-ux-ui`; this skill turns them into code that behaves correctly on a real device.

## What is actually installed

Verified in this repository — do not assume beyond it:

- **Expo SDK 52.0.49**, **React Native 0.76.9**, **React 18.3.1**
- **No navigation library.** No `expo-router`, no `react-navigation`. Navigation is a discriminated union of route states in `App.tsx`, rendered by a single switch. This is deliberate for a handful of screens.
- Present: `expo-secure-store`, `expo-local-authentication`, `expo-notifications`, `expo-updates`, `expo-constants`, `expo-asset`, `expo-status-bar`, `@livekit/react-native`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`
- Not present: `expo-keep-awake`, `react-native-reanimated`, `react-native-gesture-handler`

Two consequences that are easy to get wrong:

- **React is 18, not 19.** `use`, `useActionState`, and the React Compiler are not available. Memoization is manual.
- **Adopting Expo Router is a migration**, not a default. Propose it when the screen count and stack depth justify it; do not write code that assumes file-based routing exists.

**Never assume an Expo API exists at this SDK version.** Check `node_modules` or the SDK 52 documentation before using it. An API that shipped in SDK 53 will typecheck against nothing and fail at runtime.

## React Native practice

**TypeScript strictly.** No `any` to silence a type error; the error usually names a real case.

**State ownership.** One owner per piece of state, at the lowest level that serves every reader. Lift only when a second reader appears. Props flowing five levels deep is a signal to move ownership, not to add a context.

**Component boundaries.** A component that fetches, decides, and renders does three jobs. Extract the decision into a pure function that can be tested without a device — this repository already does that on the web side and the pattern carries over.

**SafeArea.** Use `react-native-safe-area-context`; never hardcode a status-bar height. `paddingTop: 60` works on one device and is wrong on the next.

**Keyboard.** `KeyboardAvoidingView` with `behavior="padding"` on iOS and usually nothing on Android (which resizes the window itself). Between fields use `returnKeyType="next"` with `blurOnSubmit={false}` and a ref — a phone has no Tab key. The last field submits.

**Lists.** `FlatList` with a stable `keyExtractor` and a `renderItem` that does not allocate heavy closures per row. A `ScrollView` over a `map` is acceptable only for a short, bounded list.

**Images.** Size the asset to the display size. Remote images need a loading and a failure state; a broken image with no fallback is a hole in the layout.

**Forms.** Validate on submit, not on every keystroke; a message that appears while typing reads as an accusation. Show the error next to the field it concerns.

**Loading, error, empty.** Every screen that fetches has all three. An empty state says why it is empty and what would fill it.

**Responsive.** Use flex and percentages. Hardcoded widths break on small phones and on the largest font sizes.

**Accessibility.** `accessibilityRole` and `accessibilityLabel` on every control; see `mobile-accessibility` for the full checks.

**Theming.** Colours come from `src/theme.tsx` role tokens via `useTheme()`, and styles are built with `createStyles(theme)` memoized per theme. A literal hex inside a screen is a bug in one of the two themes.

## Expo practice

**Permissions.** Three states, not two: granted, denied, and denied-permanently (`canAskAgain === false`). Ask at the moment the capability is needed and after the person knows why. When permanently denied, the only path is system settings — send them there instead of re-prompting into a wall.

**Notifications.** Requires a real project id and, on Android, FCM credentials configured for the build. A missing credential makes `getExpoPushTokenAsync` throw while everything else looks healthy — surface the reason rather than swallowing it.

**Secure storage.** `expo-secure-store` for tokens and anything that authorises. `AsyncStorage` is not secure and is fine only for preferences.

**Lifecycle.** `AppState` for foreground/background. On backgrounding: stop timers, stop polling, release media. On returning to foreground: refresh what may be stale. A screen that keeps a 5-second interval running in a pocket is a battery bug.

**Deep linking.** The scheme is `kaipai`. A link that opens the app must resolve to a state the app can actually reach, and must degrade to a sensible screen when it cannot.

**Development builds vs Expo Go.** Anything with a native module — LiveKit, secure store, notifications — requires a development or EAS build. Expo Go cannot run it.

**JavaScript change vs native change.** A JS/asset change ships through `eas update` in a minute. Adding a package with native code, or changing `app.json` permissions or plugins, requires a new build. **Say which one a change needs** — it is the difference between a minute and an hour.

## iOS and Android are not the same device

Share code by default, diverge where behaviour genuinely differs — and only there.

- **Back.** Android has a hardware/gesture back that must be handled; iOS has an edge swipe. A screen with unsaved state or an active call must intercept it.
- **Keyboard.** iOS needs `KeyboardAvoidingView`; Android usually adjusts the window itself.
- **Safe areas.** Notches, home indicator, and Android system bars differ; use insets, never constants.
- **Permissions.** iOS asks once and then only settings can change it; Android has a "deny once" that can be asked again.
- **Modals and system bars.** Presentation and status-bar contrast differ; a light theme needs dark status-bar icons on both.
- **Screen share.** Android needs a foreground service declared; iOS needs a broadcast extension. Not the same feature at the platform level.

`Platform.OS` branches are a last resort. Before writing one, ask whether the two behaviours are genuinely different or whether one of them is simply wrong.

## UX/UI implementation

For any significant screen the order is:

`mobile-product-designer` → `mobile-ux-ui` → `react-native-expo`

Preserve the **UX intent**, do not transliterate web components. A web modal is not automatically a mobile modal; a web table is never a mobile table.

Avoid: web-style dashboards on a phone, nested cards, hardcoded dimensions, arbitrary absolute positioning, tiny touch targets, wrapper `View`s that exist only to hold a style, decorative gradients, and custom controls where a native convention already works.

## Performance

The full checklist is in `mobile-performance`. What is specific here:

- **Unstable props.** An inline object, array, or arrow function creates a new identity every render and defeats any memoization downstream.
- **Context.** A provider whose `value` is a fresh object each render re-renders every consumer. Memoize the value — this repository's `ThemeProvider` does.
- **Styles.** Build them once per theme with `useMemo`, not on every render.
- **Lists.** `keyExtractor`, and `getItemLayout` when rows are uniform.
- **Cleanup.** Every `setInterval`, `AppState` listener, room event handler, and subscription is removed in the effect's teardown. A leaked interval survives navigation and is invisible in testing.

**Do not add `memo`, `useMemo`, or `useCallback` mechanically.** With React 18 there is no compiler doing this for you, but that is a reason to apply them where a measured problem exists — not everywhere. Each one is a dependency array that can go stale.

## Real-time audio and video

This repository runs actual calls (LiveKit). Media is the area where sloppiness costs the most, because failures are invisible until someone is mid-session.

Consider explicitly, every time:

- **Permissions**: microphone and camera, including denied and revoked-while-running.
- **Join → reconnect → leave**, each with a user-visible state. "Connecting" and "reconnecting" are different words for a reason.
- **Connection loss.** Say it is happening. A frozen tile with no message reads as a broken app.
- **Cleanup.** Audio session started and stopped in pairs; camera and microphone released on leave; every room listener removed. A media session left open keeps hardware awake after the screen is gone.
- **Foreground/background.** What happens to video when the app is backgrounded, and what resumes on return.
- **Duplicate joins and stale participants.** Re-entering a room must not leave a ghost; a participant list must reflect who is actually there.
- **Race conditions.** Credentials arriving after the screen unmounted; a track published between render and effect. Guard with a cancellation flag.
- **Placeholders are not tracks.** `useTracks` returns entries with no `publication` for participants who have published nothing. Reading through them crashes the whole call screen — filter first.
- **Audio routing.** Speaker, earpiece, headphones, Bluetooth. Android in particular routes wrongly without an explicit audio session.

Media resources, listeners, and subscriptions always have one explicit owner and one explicit teardown.

## Architecture

Do not introduce a second architecture for mobile. Reuse the existing backend contracts: when the app needs data the web already exposes, extend the shared route to accept a Bearer token as well as a cookie rather than writing a mobile-only twin. The server remains the only place that decides permissions.

Reuse business logic where it is genuinely shared; do not force UI reuse when it damages the mobile experience. See `mobile-architecture`.

## Verification — say what you actually did

State the level honestly, every time:

- **verified by TypeScript/tests** — static checks and `node --test` passed
- **verified in simulator/emulator**
- **verified on a physical iOS device**
- **verified on a physical Android device**

Permissions, push notifications, camera, microphone, screen share, audio routing, and background behaviour **cannot** be verified by a typecheck. Never let a clean typecheck imply device behaviour was confirmed. "Typecheck pulito, non provato su dispositivo" is the correct report when that is what happened.

## Related skills

- `mobile-product-designer`, `mobile-ux-ui` — before implementing a screen
- `mobile-accessibility` — while implementing any UI
- `mobile-performance`, `mobile-testing`, `mobile-architecture` — as the work requires
- `ios-swiftui`, `android-compose` — **only** for actual Swift or Kotlin code
