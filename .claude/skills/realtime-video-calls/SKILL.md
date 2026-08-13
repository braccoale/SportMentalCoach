---
name: realtime-video-calls
description: "Use for ANY work on the live video session — LiveKit rooms, tokens, joining and leaving, camera/microphone/screen share, audio routing, reconnection, participant handling, call UI on web or mobile, or comparing the app against Google Meet / Zoom / Teams. Triggers: CallScreen, video-room, LiveKitRoom, useTracks, room token, 'la chiamata', 'videochiamata', 'non vedo la cam', screen share, PiP, background blur, audio output. Read this BEFORE proposing any call feature, so capability claims are grounded in the installed SDK."
---

# Videochiamata dal vivo (LiveKit)

The call is the moment the whole product exists for. Failures here are invisible until someone is mid-session with a client, which is the worst possible time to discover them.

## What is actually installed

- Mobile: `@livekit/react-native` **2.12**, `@livekit/react-native-webrtc`, `livekit-client` **2.21**, `@livekit/react-native-expo-plugin`
- Web: `@livekit/components-react` with the same `livekit-client`
- `@livekit/react-native` re-exports the component hooks: `useTracks`, `useParticipants`, `useLocalParticipant`, `useConnectionState`, `useRoomContext`

**Verify an API against `node_modules` before claiming it exists.** Capability questions about calls are exactly where a confident wrong answer costs the most.

## What the mobile SDK can and cannot do

Verified, not remembered:

| Capability | Available on React Native | How |
|---|---|---|
| Camera / mic toggle | yes | `localParticipant.setCameraEnabled` / `setMicrophoneEnabled` |
| Switch front/rear camera | yes | `track.restartTrack({ facingMode })` |
| Screen share | yes | `setScreenShareEnabled`; **Android needs a foreground service, iOS a broadcast extension** |
| Audio output routing | yes | `AudioSession.getAudioOutputs()` → `speaker` / `earpiece` / `headset` / `bluetooth`; `selectAudioOutput`. iOS only exposes `default` / `force_speaker` plus `showAudioRoutePicker()` |
| Chat, reactions, raise hand | yes | `sendText` / `publishData` — UI is ours to build |
| Participant list, pin a participant | yes | ours to lay out |
| **Picture-in-Picture** | **no** | Not an SDK feature. It is an OS feature: Android needs a native module and a second miniature layout; iOS needs Swift to re-render WebRTC frames onto a sample-buffer layer. Parked deliberately. |
| **Background blur / virtual background** | **no** | LiveKit's track processors are browser-only. `react-native-webrtc` exposes **no frame-processing hook**, so there is nothing to intercept. Would require native video processing on both platforms. Do not promise it. |
| Live captions | not directly | Needs a streaming transcription service; see `ai-session-notes` (which is post-session, not live) |

When asked "can we do what Meet does?", answer from this table and check `node_modules` for anything not on it. Say plainly when something is absent — an honest "no" is cheaper than a half-built feature.

## Tokens and authorisation

The client never mints a token. It asks the server, which re-applies every rule: participation in the booking, booking status, safeguarding for minors, and the join window (`canJoinVideoNow`). A client that could decide its own access would be the whole authorisation model bypassed.

`ROOM_ERROR_TEXT` maps refusal codes to sentences people can act on. A refusal deserves an explanation, not a 404.

## Failure modes already paid for

- **Placeholders are not tracks.** `useTracks` returns entries whose `publication` is `undefined` for participants publishing nothing. Reading through them crashed the entire call screen. Filter first.
- **Absolutely-positioned controls need `elevation`/`zIndex` on Android**, or they are drawn and never receive a touch. This was diagnosed only by proving `onPress` never fired.
- **"Connecting" that never ends is worse than an error**: it looks like it is about to succeed. After ~20 seconds say it is not succeeding and offer a way out.
- **Audio session** is started before joining and stopped on leave, in pairs. Without it Android routes audio to the wrong output.
- **Camera on backgrounding**: this app releases it (battery, and Android can revoke it leaving a frozen tile). Meet keeps it publishing — a deliberate difference, revisit it as a product decision rather than treating either as obviously right.
- **A call surviving outside the app** needs an Android foreground service. Without it the system may kill the session at any moment.

## The call UI, and why it looks the way it does

- **Back reduces, it does not close.** Accidentally ending a live session is the worst damage an involuntary gesture can do, and back is the most frequent gesture on Android. Leaving goes through the red button, which is pressed on purpose.
- **Minimising keeps the room mounted.** The same component tree is drawn small; unmounting would mean leaving and rejoining, with its silence and its closed room.
- **Camera flip lives on the self-view**, not in a menu — that is where people look when they notice the framing is wrong.
- **Audio output is one tap from the top bar**, because it is changed mid-session, when opening the phone's settings is impossible.
- **Camera off shows the profile photo**, falling back to the initial. That circle is looked at for the whole session.
- **Pre-join decides how you enter.** Being pushed into a room already broadcasting means discovering you are on air after the fact.

## Verification — never imply what you did not see

A clean typecheck says nothing about a call. Permissions, camera, microphone, screen share, audio routing, reconnection and background behaviour are only verified on a device or emulator, by looking.

State the level every time: `typecheck/test`, `emulator`, `physical Android`, `physical iOS`. "Typecheck pulito, non provato su dispositivo" is the correct report when that is what happened.

**Known and unresolved:** LiveKit has never completed a connection from the Android emulator (`negotiation timed out`). The suspicion is emulator NAT plus software encoding; it is not confirmed. Do not report call features as working on the strength of an emulator run.

## Related skills

- `react-native-expo` — the implementation surface
- `booking-scheduling` — the join window and session lifecycle
- `ai-session-notes` — recording, consent and what happens after the call
- `mobile-ux-ui`, `mobile-accessibility` — the call screen is the hardest one to get right
