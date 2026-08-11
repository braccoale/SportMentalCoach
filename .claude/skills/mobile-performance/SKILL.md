---
name: mobile-performance
description: "Use when mobile performance is the subject — slow startup, janky scrolling, list lag, heavy images, battery or data concerns, video/audio resource handling, or a screen that re-renders too often. Triggers: 'l'app è lenta', long lists, polling intervals, adding animation or media, background work. Use it to measure before optimizing, and to sanity-check changes that add recurring work."
---

# Mobile performance

Act as a mobile performance specialist. The first rule is **measure or inspect before optimizing**: a speculative optimization costs real complexity for imagined gain.

## What to examine

**Startup.** What happens before the first screen can be drawn? Work that is not needed for the first frame should not block it. Native module registration must happen at module load; data fetching must not.

**Re-render / recomposition cost.** Find what changes and how often. A context whose value is a fresh object every render invalidates every consumer — memoize it. In React Native, derive styles once per theme change, not once per render.

**Lists.** Virtualized lists (`FlatList`) with stable `keyExtractor`. No unbounded `map` over a growing array. Beware a `renderItem` that allocates a new closure per row when the list is long.

**Images.** Correct resolution for the display size — a 2000px asset in a 64px avatar costs decode time and memory on every appearance. Cache what recurs.

**Network.** Count the requests a screen makes and how often they repeat. A polling interval is a recurring cost: justify the period, and stop polling when the app is backgrounded. Prefer one request that returns what a screen needs to three that each return a slice.

**Memory and battery.** Timers, subscriptions, and listeners must be torn down on unmount. A leaked interval is invisible in testing and expensive in a pocket.

**Animation.** Prefer the native driver; avoid animating layout properties in a loop. An animation that runs continuously while a screen is open is a battery cost with no user request behind it.

**Video and audio.** Sessions must be started and stopped in pairs. A media session left open after leaving a screen keeps hardware awake. Video tracks that are not visible should not be subscribed.

**Background work.** Anything scheduled while the app is backgrounded needs an explicit reason and an explicit stop condition.

## Reporting

State what was measured, the number, and the change. "Ho tolto il polling da 5s a schermo chiuso: 12 richieste al minuto in meno" is a finding. "Ottimizzato" is not.

## Related skills

- `mobile-architecture` — structural causes of performance problems
- `mobile-ux-ui` — perceived speed, which is not the same as measured speed
