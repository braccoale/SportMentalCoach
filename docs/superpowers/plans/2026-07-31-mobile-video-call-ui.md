# Interfaccia mobile della videochiamata — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Su dispositivi compatti l'utente entra in videochiamata senza mai scorrere, e atterra in una stanza a schermo intero; su desktop non cambia nulla.

**Architecture:** Le decisioni "cosa mostrare" vivono in funzioni pure in `lib/core/video/capabilities.ts`, testabili con `node:test` senza DOM. Un lettore sottile (`capabilities-client.ts`) e un hook `useIsCompact()` basato su `matchMedia` forniscono gli input a quelle funzioni. `KaiPaiPreJoin` viene scomposto in `components/prejoin/` con logica (hook) separata dai due layout (desktop invariato, compatto nuovo).

**Tech Stack:** Next.js (App Router), TypeScript strict, Tailwind CSS, LiveKit (`@livekit/components-react`, `livekit-client`), test runner `node:test` via `tsx --test`.

**Spec di riferimento:** `docs/superpowers/specs/2026-07-31-mobile-video-call-ui-design.md`

## Global Constraints

- Tutti i testi rivolti all'utente sono in **italiano**, con apostrofo tipografico `’` come nel codice esistente (es. `'Consenti l’accesso a microfono e camera'`).
- TypeScript strict: nessun `any`, nessun `@ts-ignore`.
- Nessuna nuova dipendenza npm. Nessuna introduzione di jsdom, Vitest o Playwright.
- I file di test seguono il pattern esistente: `import test from 'node:test'` + `import assert from 'node:assert/strict'`, collocati accanto al modulo (`X.ts` → `X.test.ts`), e **vanno aggiunti allo script `test` in `package.json`** per essere eseguiti.
- Nessuno sniffing dello user-agent per decidere il **layout**. È ammesso solo per rilevare **iOS Safari** come capability.
- I componenti client iniziano con `'use client';`.
- Il breakpoint compatto è esattamente: `(max-width: 767px), (pointer: coarse)`.
- Comando di test del progetto: `npm test`. Comando di build: `npm run build`.
- Non modificare il comportamento desktop: al termine, l'insieme e l'ordine dei controlli su desktop devono essere identici a oggi.

---

### Task 1: Funzioni pure di capability

**Files:**
- Create: `lib/core/video/capabilities.ts`
- Create: `lib/core/video/capabilities.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: niente (primo task).
- Produces:
  - `type CallCapabilities = { audioOutputSelection: boolean; pictureInPicture: boolean; backgroundProcessors: boolean; fullscreen: boolean; isIosSafari: boolean }`
  - `type RoomControl = 'fullscreen' | 'picture-in-picture' | 'connection-quality' | 'share' | 'exit'`
  - `type AdvancedSection = 'microphone' | 'camera' | 'speaker-select' | 'speaker-test' | 'backgrounds' | 'network'`
  - `const COMPACT_MEDIA_QUERY: string`
  - `function visibleRoomControls(caps: CallCapabilities, compact: boolean): RoomControl[]`
  - `function visibleAdvancedSections(caps: CallCapabilities): AdvancedSection[]`

- [ ] **Step 1: Write the failing test**

Create `lib/core/video/capabilities.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPACT_MEDIA_QUERY,
  visibleAdvancedSections,
  visibleRoomControls,
  type CallCapabilities,
} from './capabilities';

const FULL: CallCapabilities = {
  audioOutputSelection: true,
  pictureInPicture: true,
  backgroundProcessors: true,
  fullscreen: true,
  isIosSafari: false,
};

const IOS_SAFARI: CallCapabilities = {
  audioOutputSelection: false,
  pictureInPicture: false,
  backgroundProcessors: false,
  fullscreen: false,
  isIosSafari: true,
};

test('compact means narrow screen or coarse pointer', () => {
  assert.equal(COMPACT_MEDIA_QUERY, '(max-width: 767px), (pointer: coarse)');
});

test('desktop keeps exactly the controls it has today', () => {
  assert.deepEqual(visibleRoomControls(FULL, false), [
    'fullscreen',
    'picture-in-picture',
    'connection-quality',
    'share',
  ]);
});

test('compact never offers fullscreen and always offers an exit', () => {
  const controls = visibleRoomControls(FULL, true);
  assert.equal(controls.includes('fullscreen'), false);
  assert.equal(controls.includes('exit'), true);
});

test('picture-in-picture disappears on iOS Safari', () => {
  assert.equal(
    visibleRoomControls(IOS_SAFARI, true).includes('picture-in-picture'),
    false
  );
});

test('connection quality and sharing survive on compact', () => {
  const controls = visibleRoomControls(IOS_SAFARI, true);
  assert.deepEqual(controls, ['exit', 'connection-quality', 'share']);
});

test('speaker selection hides where unsupported but the test stays', () => {
  const sections = visibleAdvancedSections(IOS_SAFARI);
  assert.equal(sections.includes('speaker-select'), false);
  assert.equal(sections.includes('speaker-test'), true);
});

test('a browser without background processors loses only that section', () => {
  assert.deepEqual(visibleAdvancedSections(IOS_SAFARI), [
    'microphone',
    'camera',
    'speaker-test',
    'network',
  ]);
});

test('a fully capable browser lists every section', () => {
  assert.deepEqual(visibleAdvancedSections(FULL), [
    'microphone',
    'camera',
    'speaker-select',
    'speaker-test',
    'backgrounds',
    'network',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test lib/core/video/capabilities.test.ts`
Expected: FAIL — `Cannot find module './capabilities'`

- [ ] **Step 3: Write minimal implementation**

Create `lib/core/video/capabilities.ts`:

```ts
/**
 * Decisioni pure su quali comandi mostrare durante una videochiamata.
 *
 * Qui dentro non si accede al DOM: queste funzioni ricevono le capability già
 * rilevate (vedi `capabilities-client.ts`) e il fatto che il layout sia
 * compatto, e rispondono con l'elenco ordinato di ciò che va reso visibile.
 * Tenerle pure è ciò che le rende verificabili senza un browser.
 */

/** Layout compatto: schermo stretto oppure puntatore touch. */
export const COMPACT_MEDIA_QUERY = '(max-width: 767px), (pointer: coarse)';

export type CallCapabilities = {
  /** Il browser sa dirigere l'audio su un'uscita scelta (`setSinkId`). */
  audioOutputSelection: boolean;
  /** Picture-in-Picture disponibile. */
  pictureInPicture: boolean;
  /** Sfocatura e sfondi virtuali eseguibili. */
  backgroundProcessors: boolean;
  /** L'elemento può essere portato a schermo intero. */
  fullscreen: boolean;
  /** Safari su iOS/iPadOS: vincoli propri su audio e PiP. */
  isIosSafari: boolean;
};

export type RoomControl =
  | 'exit'
  | 'fullscreen'
  | 'picture-in-picture'
  | 'connection-quality'
  | 'share';

export type AdvancedSection =
  | 'microphone'
  | 'camera'
  | 'speaker-select'
  | 'speaker-test'
  | 'backgrounds'
  | 'network';

/**
 * Comandi della barra superiore della stanza, in ordine di visualizzazione.
 *
 * Su compatto lo schermo intero è già attivo (la stanza occupa tutto il
 * viewport), quindi il pulsante sparisce e al suo posto compare un'uscita
 * esplicita: il link "Torna alla dashboard" non è più raggiungibile.
 */
export function visibleRoomControls(
  caps: CallCapabilities,
  compact: boolean
): RoomControl[] {
  const controls: RoomControl[] = [];
  if (compact) controls.push('exit');
  if (!compact && caps.fullscreen) controls.push('fullscreen');
  if (caps.pictureInPicture) controls.push('picture-in-picture');
  controls.push('connection-quality');
  controls.push('share');
  return controls;
}

/**
 * Sezioni del pannello impostazioni avanzate, in ordine di visualizzazione.
 *
 * La prova altoparlante resta anche dove la *scelta* dell'uscita non è
 * supportata: sentire il suono di prova è utile comunque, ed è spesso l'unico
 * modo che l'utente ha per accorgersi che il telefono è in silenzioso.
 */
export function visibleAdvancedSections(
  caps: CallCapabilities
): AdvancedSection[] {
  const sections: AdvancedSection[] = ['microphone', 'camera'];
  if (caps.audioOutputSelection) sections.push('speaker-select');
  sections.push('speaker-test');
  if (caps.backgroundProcessors) sections.push('backgrounds');
  sections.push('network');
  return sections;
}
```

Nota: `visibleAdvancedSections` non riceve `compact` di proposito. Oggi le differenze fra mobile e desktop nel pannello avanzate derivano **tutte** dalle capability reali del browser, non dalla dimensione dello schermo: un parametro che nessun ramo legge sarebbe codice morto. Si aggiungerà il giorno in cui servirà davvero.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test lib/core/video/capabilities.test.ts`
Expected: PASS — 8 test superati

- [ ] **Step 5: Aggiungi il test allo script del progetto**

In `package.json`, nello script `test`, inserisci `lib/core/video/capabilities.test.ts` subito dopo `lib/core/video/call-settings.test.ts`.

Run: `npm test`
Expected: l'intera suite passa, incluso il nuovo file.

- [ ] **Step 6: Commit**

```bash
git add lib/core/video/capabilities.ts lib/core/video/capabilities.test.ts package.json
git commit -m "Video: funzioni pure per i comandi visibili in chiamata"
```

---

### Task 2: Rilevazione lato browser

**Files:**
- Create: `lib/core/video/capabilities-client.ts`
- Create: `lib/hooks/use-is-compact.ts`

**Interfaces:**
- Consumes: `CallCapabilities`, `COMPACT_MEDIA_QUERY` da `lib/core/video/capabilities.ts`.
- Produces:
  - `function readCallCapabilities(): CallCapabilities`
  - `function useIsCompact(): boolean | null` — `null` finché la media query non è stata valutata (primo render, lato server)
  - `function useCallCapabilities(): CallCapabilities` — capability lette dopo il mount, con default conservativi prima

Questi due moduli sono l'unico punto che tocca il DOM. Sono deliberatamente sottili: nessun ramo decisionale vive qui, solo lettura. Non hanno test automatici — si verificano nella verifica manuale del Task 7.

- [ ] **Step 1: Scrivi il lettore di capability**

Create `lib/core/video/capabilities-client.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { supportsBackgroundProcessors } from '@livekit/track-processors';
import type { CallCapabilities } from './capabilities';

/**
 * Default conservativi usati prima che il browser sia interrogabile (SSR e
 * primo render). Nascondere un comando per un istante è innocuo; mostrarne uno
 * che poi sparisce no.
 */
const UNKNOWN: CallCapabilities = {
  audioOutputSelection: false,
  pictureInPicture: false,
  backgroundProcessors: false,
  fullscreen: false,
  isIosSafari: false,
};

/**
 * Safari su iOS e iPadOS. È l'unico punto in cui lo user-agent è ammesso: non
 * esiste una feature detection per i vincoli di autoplay audio e per il
 * comportamento del PiP di quel motore. iPadOS si dichiara "Macintosh", perciò
 * si controlla anche la presenza del touch.
 */
function detectIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isWebkit = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return isWebkit && isIos;
}

export function readCallCapabilities(): CallCapabilities {
  if (typeof window === 'undefined') return UNKNOWN;

  let backgroundProcessors = false;
  try {
    backgroundProcessors = supportsBackgroundProcessors();
  } catch {
    backgroundProcessors = false;
  }

  return {
    audioOutputSelection:
      typeof HTMLMediaElement !== 'undefined' &&
      'setSinkId' in HTMLMediaElement.prototype,
    pictureInPicture:
      'pictureInPictureEnabled' in document &&
      Boolean(document.pictureInPictureEnabled),
    backgroundProcessors,
    fullscreen:
      typeof HTMLElement.prototype.requestFullscreen === 'function' ||
      typeof (
        HTMLElement.prototype as HTMLElement & {
          webkitRequestFullscreen?: () => void;
        }
      ).webkitRequestFullscreen === 'function',
    isIosSafari: detectIosSafari(),
  };
}

/** Capability del browser corrente; `UNKNOWN` fino al primo effetto. */
export function useCallCapabilities(): CallCapabilities {
  const [caps, setCaps] = useState<CallCapabilities>(UNKNOWN);
  useEffect(() => {
    setCaps(readCallCapabilities());
  }, []);
  return caps;
}
```

- [ ] **Step 2: Scrivi l'hook del layout compatto**

Create `lib/hooks/use-is-compact.ts`:

```ts
'use client';

import { useSyncExternalStore } from 'react';
import { COMPACT_MEDIA_QUERY } from '@/lib/core/video/capabilities';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(COMPACT_MEDIA_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(COMPACT_MEDIA_QUERY).matches;
}

/**
 * `true` su schermo stretto o puntatore touch, `false` altrimenti, `null`
 * finché non lo sappiamo (render lato server e primo render client).
 *
 * Il `null` non è pigrizia: consente a chi lo usa di mostrare uno scheletro
 * neutro invece del layout desktop, evitando il salto visivo di un frame che
 * su mobile si nota eccome. Basato su `matchMedia`, quindi reagisce da solo
 * alla rotazione del dispositivo a metà pre-join.
 */
export function useIsCompact(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => null as boolean | null
  );
}
```

- [ ] **Step 3: Verifica che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 4: Commit**

```bash
git add lib/core/video/capabilities-client.ts lib/hooks/use-is-compact.ts
git commit -m "Video: rilevazione layout compatto e capability del browser"
```

---

### Task 3: Estrai la logica del pre-join (nessun cambiamento visibile)

Questo task **non deve cambiare nulla di ciò che l'utente vede**. Sposta soltanto codice, per rendere possibili i due task successivi. Se al termine il pre-join desktop appare diverso, il task è sbagliato.

**Files:**
- Create: `components/prejoin/use-prejoin-state.ts`
- Create: `components/prejoin/prejoin-desktop.tsx`
- Modify: `components/livekit-call-controls.tsx:224-690` (rimpiazza il corpo di `KaiPaiPreJoin`)

**Interfaces:**
- Consumes: `KaiPaiCallChoices` da `components/livekit-call-controls.tsx`.
- Produces:
  - `type PreJoinState` con: `userChoices`, `saveAudioInputEnabled(v: boolean)`, `saveVideoInputEnabled(v: boolean)`, `saveAudioInputDeviceId(id: string)`, `saveVideoInputDeviceId(id: string)`, `audioTrack?: LocalAudioTrack`, `videoTrack?: LocalVideoTrack`, `previewError: string | null`, `audioOutputDeviceId: string`, `audioOutputs: MediaDeviceInfo[]`, `chooseAudioOutput(id: string)`, `speakerTestState: 'idle' | 'playing' | 'success' | 'error'`, `testSpeaker(): Promise<void>`, `networkState: 'idle' | 'checking' | 'complete'`, `networkResult: NetworkDiagnosticResult | null`, `runNetworkDiagnostic(): Promise<void>`, `join(): void`
  - `function usePreJoinState(options: PreJoinStateOptions): PreJoinState`
  - `function PreJoinDesktop({ state, minHeight }: { state: PreJoinState; minHeight: string }): JSX.Element`

- [ ] **Step 1: Sposta la logica nell'hook**

Create `components/prejoin/use-prejoin-state.ts`. Il corpo è **esattamente** la logica oggi alle righe 239–424 di `components/livekit-call-controls.tsx`, senza modifiche di comportamento: `usePersistentUserChoices`, gli stati `previewError` / `speakerTestState` / `audioOutputDeviceId` / `audioOutputs` / `networkState` / `networkResult`, `runNetworkDiagnostic` con il suo `useEffect` guardato da `diagnosticStarted`, il ripristino di `AUDIO_OUTPUT_STORAGE_KEY` da `localStorage`, `usePreviewTracks` con `previewOptions`, l'effetto di `enumerateDevices` con listener `devicechange`, `chooseAudioOutput` e `testSpeaker`.

Sposta in questo file anche gli helper oggi privati e usati solo dal pre-join: `supportsAudioOutputSelection`, `diagnosticStatus`, `createSpeakerTestUrl`, `playSpeakerTest`, e i tipi `AudioElementWithSink`, `BrowserNetworkInformation`, `NetworkNavigator`, `NetworkDiagnosticResult`. Esporta `NetworkDiagnosticResult` (serve ai due layout).

Aggiungi in coda all'hook, come unica novità, la funzione `join`, che oggi è inline nel bottone (righe 672–684):

```ts
const join = useCallback(() => {
  onJoin({
    ...userChoices,
    username: participantName,
    audioOutputDeviceId,
  });
}, [audioOutputDeviceId, onJoin, participantName, userChoices]);
```

Firma delle opzioni:

```ts
export type PreJoinStateOptions = {
  participantName: string;
  serverUrl: string;
  preflightToken: string;
  onDiagnostic?: (details: TechnicalEventDetails) => void;
  onJoin: (choices: KaiPaiCallChoices) => void;
};
```

- [ ] **Step 2: Sposta il layout desktop**

Create `components/prejoin/prejoin-desktop.tsx` con il JSX **identico** alle righe 426–689 attuali, che ora legge tutto da `state` invece che da variabili locali, e usa `state.join` al posto della callback inline nel bottone. `CameraPreview` e `DeviceMenuButton` (righe 162–222) si spostano qui: sono usati solo dal layout desktop.

- [ ] **Step 3: Riduci `KaiPaiPreJoin` a un involucro**

In `components/livekit-call-controls.tsx`, sostituisci l'intero corpo di `KaiPaiPreJoin` con:

```tsx
export function KaiPaiPreJoin({
  participantName,
  serverUrl,
  preflightToken,
  onDiagnostic,
  onJoin,
  minHeight = '70vh',
}: {
  participantName: string;
  serverUrl: string;
  preflightToken: string;
  onDiagnostic?: (details: TechnicalEventDetails) => void;
  onJoin: (choices: KaiPaiCallChoices) => void;
  minHeight?: string;
}) {
  const state = usePreJoinState({
    participantName,
    serverUrl,
    preflightToken,
    onDiagnostic,
    onJoin,
  });

  return <PreJoinDesktop state={state} minHeight={minHeight} />;
}
```

Rimuovi da questo file gli import diventati inutilizzati (`BarVisualizer`, `MediaDeviceMenu`, `usePersistentUserChoices`, `usePreviewTracks`, `ConnectionCheck`, `CheckStatus`, `PreviewBackgroundControls`, `summarizeNetworkDiagnostic`, e le icone usate solo dal pre-join). Lascia intatte le altre esportazioni del file: `ConnectionQualityNotice`, `ApplyInitialAudioOutput`, `CallDeviceSettings`, `KaiPaiCallChoices`.

- [ ] **Step 4: Verifica che nulla sia cambiato**

Run: `npx tsc --noEmit && npm run build`
Expected: nessun errore, build completata.

Verifica manuale — apri una videochiamata su desktop e conferma che il pre-join sia **visivamente identico** a prima: anteprima, sfondi, prova microfono, i tre riquadri a destra, la diagnostica rete che parte da sola, il bottone rosso.

- [ ] **Step 5: Commit**

```bash
git add components/prejoin components/livekit-call-controls.tsx
git commit -m "Pre-join: separa la logica dal layout, senza cambiamenti visibili"
```

---

### Task 4: Foglio impostazioni avanzate

**Files:**
- Create: `components/prejoin/advanced-settings-sheet.tsx`

**Interfaces:**
- Consumes: `PreJoinState` (Task 3), `visibleAdvancedSections` + `CallCapabilities` (Task 1), `useCallCapabilities` (Task 2).
- Produces: `function AdvancedSettingsSheet({ state, open, onClose }: { state: PreJoinState; open: boolean; onClose: () => void }): JSX.Element | null`

- [ ] **Step 1: Scrivi il componente**

Create `components/prejoin/advanced-settings-sheet.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { visibleAdvancedSections } from '@/lib/core/video/capabilities';
import { useCallCapabilities } from '@/lib/core/video/capabilities-client';
import { PreviewBackgroundControls } from '@/components/livekit-background-controls';
import type { PreJoinState } from './use-prejoin-state';

/**
 * Pannello che sale dal basso con tutto ciò che serve raramente: scelta
 * dispositivi, prova altoparlante, sfondi, dettaglio rete. Le sezioni presenti
 * dipendono dalle capability reali del browser, non dalla dimensione dello
 * schermo — su un telefono la scelta dell'uscita audio sparisce da sola perché
 * `setSinkId` non esiste, non perché l'abbiamo nascosta.
 */
export function AdvancedSettingsSheet({
  state,
  open,
  onClose,
}: {
  state: PreJoinState;
  open: boolean;
  onClose: () => void;
}) {
  const caps = useCallCapabilities();
  const sections = visibleAdvancedSections(caps);

  // Esc chiude il pannello: su tablet con tastiera è il gesto atteso.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Chiudi impostazioni"
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Impostazioni avanzate"
        className="relative max-h-[80%] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-neutral-950 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 text-white"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Impostazioni avanzate</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-full bg-white/10 p-2 hover:bg-white/20"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4">
          {sections.includes('microphone') && (
            <section className="rounded-2xl border border-white/10 p-3">
              <p className="text-sm font-medium">Microfono</p>
              <select
                value={state.userChoices.audioDeviceId}
                onChange={(event) =>
                  state.saveAudioInputDeviceId(event.target.value)
                }
                aria-label="Scegli microfono"
                className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-neutral-900 px-3 text-sm"
              >
                {state.audioInputs.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microfono ${index + 1}`}
                  </option>
                ))}
              </select>
            </section>
          )}

          {sections.includes('camera') && (
            <section className="rounded-2xl border border-white/10 p-3">
              <p className="text-sm font-medium">Camera</p>
              <select
                value={state.userChoices.videoDeviceId}
                onChange={(event) =>
                  state.saveVideoInputDeviceId(event.target.value)
                }
                aria-label="Scegli camera"
                className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-neutral-900 px-3 text-sm"
              >
                {state.videoInputs.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${index + 1}`}
                  </option>
                ))}
              </select>
            </section>
          )}

          {sections.includes('speaker-select') && (
            <section className="rounded-2xl border border-white/10 p-3">
              <p className="text-sm font-medium">Altoparlante</p>
              <select
                value={state.audioOutputDeviceId}
                onChange={(event) =>
                  state.chooseAudioOutput(event.target.value)
                }
                aria-label="Scegli altoparlante"
                className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-neutral-900 px-3 text-sm"
              >
                {state.audioOutputs.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Altoparlante ${index + 1}`}
                  </option>
                ))}
              </select>
            </section>
          )}

          {sections.includes('speaker-test') && (
            <section className="rounded-2xl border border-white/10 p-3">
              <button
                type="button"
                onClick={() => void state.testSpeaker()}
                disabled={state.speakerTestState === 'playing'}
                className="h-11 w-full rounded-xl bg-sky-500/15 text-sm font-semibold text-sky-200 disabled:opacity-50"
              >
                {state.speakerTestState === 'playing'
                  ? 'Riproduzione…'
                  : 'Prova altoparlante'}
              </button>
              {state.speakerTestState === 'success' && (
                <p className="mt-2 text-xs text-emerald-300">
                  Suono di prova riprodotto.
                </p>
              )}
              {state.speakerTestState === 'error' && (
                <p className="mt-2 text-xs text-amber-300">
                  Il browser ha bloccato il suono. Controlla il volume.
                </p>
              )}
            </section>
          )}

          {sections.includes('backgrounds') && (
            <section className="rounded-2xl border border-white/10 p-3">
              <p className="text-sm font-medium">Sfondo video</p>
              <p className="mt-0.5 text-xs text-amber-300/90">
                Può ridurre la fluidità video sui telefoni.
              </p>
              <div className="mt-3">
                <PreviewBackgroundControls
                  track={
                    state.userChoices.videoEnabled
                      ? state.videoTrack
                      : undefined
                  }
                  enabled={Boolean(
                    state.userChoices.videoEnabled && state.videoTrack
                  )}
                />
              </div>
            </section>
          )}

          {sections.includes('network') && (
            <section className="rounded-2xl border border-white/10 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {state.networkState === 'checking'
                      ? 'Diagnostica rete in corso…'
                      : state.networkResult?.label ?? 'Diagnostica rete'}
                  </p>
                  <p className="mt-1 text-xs text-white/60">
                    {state.networkState === 'checking'
                      ? 'Verifica WebSocket, WebRTC e percorso TURN.'
                      : state.networkResult?.detail}
                  </p>
                </div>
                {state.networkState === 'complete' && (
                  <button
                    type="button"
                    onClick={() => void state.runNetworkDiagnostic()}
                    className="shrink-0 rounded-full border border-white/20 px-3 py-1.5 text-xs font-semibold"
                  >
                    Ripeti
                  </button>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Aggiungi gli elenchi dispositivi all'hook**

Il foglio usa `state.audioInputs` e `state.videoInputs`, che l'hook del Task 3 non espone ancora (oggi il desktop usa `MediaDeviceMenu` di LiveKit, che li enumera per conto suo). In `components/prejoin/use-prejoin-state.ts`, estendi l'effetto esistente di `enumerateDevices` perché popoli tre stati invece di uno:

```ts
const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);

useEffect(() => {
  if (!audioTrack || !navigator.mediaDevices) return;
  let active = true;
  const refresh = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    if (!active) return;
    setAudioInputs(devices.filter((d) => d.kind === 'audioinput'));
    setVideoInputs(devices.filter((d) => d.kind === 'videoinput'));
    setAudioOutputs(devices.filter((d) => d.kind === 'audiooutput'));
  };
  void refresh();
  navigator.mediaDevices.addEventListener?.('devicechange', refresh);
  return () => {
    active = false;
    navigator.mediaDevices.removeEventListener?.('devicechange', refresh);
  };
}, [audioTrack]);
```

Aggiungi `audioInputs` e `videoInputs` al tipo `PreJoinState` e all'oggetto restituito. Il layout desktop non li usa e resta invariato.

- [ ] **Step 3: Verifica che compili**

Run: `npx tsc --noEmit`
Expected: nessun errore

- [ ] **Step 4: Commit**

```bash
git add components/prejoin
git commit -m "Pre-join: foglio impostazioni avanzate guidato dalle capability"
```

---

### Task 5: Layout compatto del pre-join

**Files:**
- Create: `components/prejoin/prejoin-compact.tsx`
- Modify: `components/livekit-call-controls.tsx` (`KaiPaiPreJoin` sceglie il layout)

**Interfaces:**
- Consumes: `PreJoinState` (Task 3/4), `AdvancedSettingsSheet` (Task 4), `useIsCompact` (Task 2).
- Produces: `function PreJoinCompact({ state, counterpartName }: { state: PreJoinState; counterpartName?: string }): JSX.Element`
- Aggiunge la prop opzionale `counterpartName?: string` a `KaiPaiPreJoin` e `VideoRoom`.

- [ ] **Step 1: Scrivi il layout compatto**

Create `components/prejoin/prejoin-compact.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Settings2,
  SwitchCamera,
} from 'lucide-react';
import type { NetworkDiagnosticSummary } from '@/lib/core/video/call-settings';
import { AdvancedSettingsSheet } from './advanced-settings-sheet';
import type { PreJoinState } from './use-prejoin-state';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

// I gradi sono esattamente quelli di `summarizeNetworkDiagnostic`.
const NETWORK_DOT: Record<NetworkDiagnosticSummary['grade'], string> = {
  good: 'bg-emerald-400',
  warning: 'bg-amber-400',
  poor: 'bg-red-500',
};

/**
 * Pre-join per telefoni: l'anteprima riempie lo schermo e i comandi ci
 * galleggiano sopra, come in WhatsApp o FaceTime. Nulla scorre mai — il
 * bottone di ingresso è sempre a portata di pollice, che è l'intero punto di
 * questo layout.
 */
export function PreJoinCompact({
  state,
  counterpartName,
}: {
  state: PreJoinState;
  /** Nome di chi si sta per incontrare. Assente nel flusso ospite. */
  counterpartName?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const track = state.userChoices.videoEnabled ? state.videoTrack : undefined;

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !track) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  const dot =
    state.networkState === 'checking'
      ? 'bg-white/50'
      : NETWORK_DOT[state.networkResult?.grade ?? ''] ?? 'bg-white/50';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-neutral-950 text-white">
      {track ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl font-semibold">
            {initials(state.userChoices.username)}
          </span>
        </div>
      )}

      {/* Fasce scure: senza, il testo bianco sparisce su un'inquadratura chiara. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/85 to-transparent" />

      <div className="absolute inset-x-0 top-0 px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <p className="text-base font-semibold">
          {counterpartName
            ? `Sessione con ${counterpartName}`
            : 'Preparati alla videochiamata'}
        </p>
        <p className="mt-1 flex items-center gap-2 text-xs text-white/70">
          <span
            className={`h-2 w-2 rounded-full ${dot}`}
            aria-hidden="true"
          />
          {state.networkState === 'checking'
            ? 'Controllo connessione…'
            : state.networkResult?.label ?? 'Connessione'}
        </p>
      </div>

      {track && (
        <button
          type="button"
          onClick={state.flipCamera}
          aria-label="Inverti fotocamera"
          className="absolute right-4 top-[calc(4.5rem+env(safe-area-inset-top))] rounded-full bg-black/50 p-3 backdrop-blur"
        >
          <SwitchCamera className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {state.previewError && (
        <p
          role="alert"
          className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-2xl bg-amber-500/20 p-3 text-center text-sm text-amber-100 backdrop-blur"
        >
          {state.previewError}
        </p>
      )}

      <div className="absolute inset-x-0 bottom-0 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mb-4 flex justify-center gap-4">
          <button
            type="button"
            onClick={() =>
              state.saveAudioInputEnabled(!state.userChoices.audioEnabled)
            }
            aria-pressed={state.userChoices.audioEnabled}
            aria-label={
              state.userChoices.audioEnabled
                ? 'Disattiva microfono'
                : 'Attiva microfono'
            }
            className={`flex h-14 w-14 items-center justify-center rounded-full backdrop-blur ${
              state.userChoices.audioEnabled
                ? 'bg-white/15'
                : 'bg-red-600'
            }`}
          >
            {state.userChoices.audioEnabled ? (
              <Mic className="h-6 w-6" aria-hidden="true" />
            ) : (
              <MicOff className="h-6 w-6" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              state.saveVideoInputEnabled(!state.userChoices.videoEnabled)
            }
            aria-pressed={state.userChoices.videoEnabled}
            aria-label={
              state.userChoices.videoEnabled
                ? 'Disattiva camera'
                : 'Attiva camera'
            }
            className={`flex h-14 w-14 items-center justify-center rounded-full backdrop-blur ${
              state.userChoices.videoEnabled
                ? 'bg-white/15'
                : 'bg-red-600'
            }`}
          >
            {state.userChoices.videoEnabled ? (
              <Camera className="h-6 w-6" aria-hidden="true" />
            ) : (
              <CameraOff className="h-6 w-6" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setAdvancedOpen(true)}
            aria-label="Impostazioni avanzate"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur"
          >
            <Settings2 className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={state.join}
          className="h-14 w-full rounded-full bg-red-600 text-base font-semibold text-white shadow-lg shadow-red-950/40 active:bg-red-700"
        >
          Entra nella videochiamata
        </button>
      </div>

      <AdvancedSettingsSheet
        state={state}
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Aggiungi l'inversione fotocamera all'hook**

In `components/prejoin/use-prejoin-state.ts`, aggiungi lo stato del verso e la funzione. Passa da un dispositivo video all'altro nell'elenco enumerato: è il modo che funziona sia dove i `facingMode` sono esposti come dispositivi distinti sia dove non lo sono.

```ts
const flipCamera = useCallback(() => {
  if (videoInputs.length < 2) return;
  const current = videoInputs.findIndex(
    (device) => device.deviceId === userChoices.videoDeviceId
  );
  const next = videoInputs[(current + 1) % videoInputs.length];
  if (next) saveVideoInputDeviceId(next.deviceId);
}, [saveVideoInputDeviceId, userChoices.videoDeviceId, videoInputs]);
```

Aggiungi `flipCamera: () => void` al tipo `PreJoinState` e all'oggetto restituito.

- [ ] **Step 3: Collega la scelta del layout**

In `components/livekit-call-controls.tsx`, dentro `KaiPaiPreJoin`, sostituisci il `return` del Task 3 con:

```tsx
  const isCompact = useIsCompact();

  // `null` = non sappiamo ancora se siamo su mobile. Uno sfondo neutro per un
  // frame è preferibile al layout desktop che poi salta a quello compatto.
  if (isCompact === null) {
    return (
      <div
        className="rounded-2xl bg-neutral-950"
        style={{ minHeight }}
        aria-busy="true"
      />
    );
  }

  return isCompact ? (
    <PreJoinCompact state={state} counterpartName={counterpartName} />
  ) : (
    <PreJoinDesktop state={state} minHeight={minHeight} />
  );
```

Attenzione: `usePreJoinState` va chiamato **prima** di questo ramo, come già fatto nel Task 3 — un `return` anticipato prima di un hook viola le regole degli hook di React.

- [ ] **Step 4: Porta il nome della controparte fino al pre-join**

L'intestazione compatta mostra chi si sta per incontrare, ma quel nome oggi si ferma in `page.tsx`. Va passato attraverso tre livelli, tutti con prop **opzionale** così il flusso ospite resta valido senza modifiche:

1. `components/livekit-call-controls.tsx` — aggiungi `counterpartName?: string` alle props di `KaiPaiPreJoin`.
2. `app/(dashboard)/dashboard/video/[bookingId]/video-room.tsx` — aggiungi `counterpartName?: string` alle props di `VideoRoom`, e passalo a `KaiPaiPreJoin`.
3. `app/(dashboard)/dashboard/video/[bookingId]/page.tsx:71` — passa `counterpartName={otherName}` a `<VideoRoom …>`. `otherName` è già estratto alla riga 41.

`components/guest-video-room.tsx` non passa nulla: l'ospite non conosce necessariamente il nome del coach, e in quel caso l'intestazione mostra "Preparati alla videochiamata".

- [ ] **Step 5: Verifica**

Run: `npx tsc --noEmit && npm run build`
Expected: nessun errore

Verifica manuale in DevTools, emulazione **iPhone SE** (il caso peggiore): apri una videochiamata e conferma che il bottone "Entra nella videochiamata" sia visibile **senza scorrere**, che i tre pulsanti rotondi siano sopra di esso, e che l'ingranaggio apra il foglio delle avanzate.

- [ ] **Step 6: Commit**

```bash
git add components/prejoin components/livekit-call-controls.tsx app/\(dashboard\)/dashboard/video
git commit -m "Pre-join: layout compatto a schermo intero per mobile"
```

---

### Task 6: Stanza a schermo intero su mobile

**Files:**
- Modify: `app/(dashboard)/dashboard/video/[bookingId]/video-room.tsx:321-433`
- Modify: `components/guest-video-room.tsx:78-122`

**Interfaces:**
- Consumes: `useIsCompact` (Task 2), `visibleRoomControls` + `useCallCapabilities` (Task 1/2).
- Produces: nessuna nuova esportazione.

- [ ] **Step 1: Rendi la stanza a tutto schermo su compatto**

In `video-room.tsx`, dentro `ConnectedVideoRoom`, aggiungi in cima al componente:

```tsx
const isCompact = useIsCompact();
const caps = useCallCapabilities();
const controls = visibleRoomControls(caps, isCompact === true);
```

Sostituisci le classi del contenitore esterno (riga 325) con:

```tsx
className={
  isCompact
    ? 'fixed inset-0 z-50 h-dvh w-screen overflow-hidden bg-neutral-950'
    : 'relative h-[70vh] overflow-hidden rounded-lg border border-gray-200 bg-neutral-950 fullscreen:h-dvh fullscreen:w-screen fullscreen:rounded-none fullscreen:border-0'
}
```

`h-dvh` e non `h-screen`: su mobile la barra degli indirizzi si ritrae durante lo scorrimento e `100vh` porterebbe il fondo del contenitore fuori dallo schermo, tagliando proprio i comandi della chiamata.

- [ ] **Step 2: Riduci la barra dei comandi**

Sostituisci il contenuto della barra (righe 366–375) con la versione guidata dall'elenco:

```tsx
<div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/10 bg-black/40 px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
  {controls.includes('exit') && (
    <button
      type="button"
      onClick={() => router.push(backHref)}
      aria-label="Esci dalla videochiamata"
      className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </button>
  )}
  <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
    {controls.includes('fullscreen') && <RoomFullscreenControl />}
    {controls.includes('picture-in-picture') && (
      <PictureInPictureControl onTechnicalEvent={recordTechnicalEvent} />
    )}
    {controls.includes('connection-quality') && (
      <ConnectionQualityNotice compact={isCompact === true} />
    )}
    {controls.includes('share') && (
      <ShareButton bookingId={bookingId} appearance="room" />
    )}
  </div>
</div>
```

Importa `X` da `lucide-react`.

- [ ] **Step 3: Riduci l'indicatore di qualità a un pallino**

In `components/livekit-call-controls.tsx`, `ConnectionQualityNotice` accetta una prop opzionale `compact` (default `false`). Quando è `true`, rende solo il pallino colorato con l'etichetta come `aria-label` e `title`, invece del testo esteso. La logica di determinazione della qualità non cambia.

- [ ] **Step 4: Impila i bottoni del dialogo di uscita**

Nel dialogo (righe 385–430), sostituisci `className="mt-3 flex gap-3"` con:

```tsx
className={isCompact ? 'mt-3 flex flex-col gap-3' : 'mt-3 flex gap-3'}
```

Il comportamento dei bottoni non cambia: su schermo stretto tre bersagli affiancati diventano troppo piccoli per il pollice.

- [ ] **Step 5: Applica lo stesso trattamento alla stanza ospite**

In `components/guest-video-room.tsx`, replica i passi 1–3 in `ConnectedGuestVideoRoom`. Differenze: non esiste `ShareButton` (quindi `controls.includes('share')` non ha nulla da rendere e va ignorato), e l'uscita non ha un `backHref` — al suo posto la X non viene mostrata, perché l'ospite non ha una dashboard a cui tornare. Usa quindi:

```tsx
const controls = visibleRoomControls(caps, isCompact === true).filter(
  (control) => control !== 'share' && control !== 'exit'
);
```

- [ ] **Step 6: Verifica**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: nessun errore, suite verde.

Verifica manuale in emulazione iPhone SE: entrando in chiamata il video occupa tutto lo schermo, la X in alto a sinistra riporta alla dashboard, non compare il pulsante schermo intero, e il dialogo di uscita ha i bottoni impilati.

- [ ] **Step 7: Commit**

```bash
git add app/\(dashboard\)/dashboard/video components/guest-video-room.tsx components/livekit-call-controls.tsx
git commit -m "Videochiamata: stanza a schermo intero e comandi ridotti su mobile"
```

---

### Task 7: Verifica finale e documentazione

**Files:**
- Modify: `docs/06_UI.md`

- [ ] **Step 1: Percorso completo su telefono emulato**

In DevTools, emulazione **iPhone SE**, percorra e confermi ciascun punto:

1. Pre-join: il bottone "Entra nella videochiamata" è visibile senza scorrere.
2. Ruota in orizzontale: il bottone resta raggiungibile e nulla scorre.
3. Spegni la camera: compaiono le iniziali, non un rettangolo nero.
4. Inverti fotocamera: l'anteprima cambia dispositivo (con almeno due camere disponibili).
5. Apri le avanzate: nessuna sezione altoparlante-scelta su mobile, ma la prova altoparlante c'è; gli sfondi mostrano l'avviso sulla fluidità.
6. Entra in chiamata: nessuno sfarfallio di layout nel passaggio, il video occupa lo schermo.
7. Esci con la X: si torna alla dashboard.

- [ ] **Step 2: Stesso percorso dal link ospite**

Ripeti i punti 1–6 aprendo il link di invito ospite, che è il caso mobile più probabile in assoluto. Verifica che non compaia la X di uscita (l'ospite non ha dashboard).

- [ ] **Step 3: Nessuna regressione su desktop**

A finestra larga e con mouse: il pre-join è identico a prima del Task 3, e la barra della stanza mostra schermo intero, PiP, qualità e condivisione come oggi.

- [ ] **Step 4: Aggiorna la documentazione**

In `docs/06_UI.md`, aggiungi una sezione che documenti: il breakpoint compatto `(max-width: 767px), (pointer: coarse)`; la separazione fra `useIsCompact()` (come disporre) e `getCallCapabilities`/`readCallCapabilities` (cosa esiste); il fatto che i comandi visibili derivino da `visibleRoomControls` / `visibleAdvancedSections` e vadano modificati **lì**, non nei componenti. Rimanda alla spec `docs/superpowers/specs/2026-07-31-mobile-video-call-ui-design.md`.

- [ ] **Step 5: Commit**

```bash
git add docs/06_UI.md
git commit -m "Docs: interfaccia mobile della videochiamata"
```

---

## Lavoro successivo (fuori ambito, non implementare qui)

**Ciclo di vita dell'app su mobile** — blocco schermo, telefonata in arrivo, cambio applicazione. LiveKit sospende i track e il comportamento al ritorno varia sensibilmente fra iOS e Android. Su mobile accade a ogni sessione: è il candidato naturale al prossimo ciclo spec → piano → implementazione.
