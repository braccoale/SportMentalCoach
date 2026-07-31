'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MediaDeviceMenu,
  useConnectionQualityIndicator,
  useConnectionState,
  useLocalParticipant,
  useLayoutContext,
  usePersistentUserChoices,
  useRoomContext,
  type LocalUserChoices,
} from '@livekit/components-react';
import {
  ConnectionState,
  ConnectionQuality,
  RoomEvent,
} from 'livekit-client';
import {
  AlertTriangle,
  Camera,
  Mic,
  Settings2,
  Sparkles,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import {
  KAIPAI_AUDIO_CAPTURE_DEFAULTS,
  connectionQualityPresentation,
} from '@/lib/core/video/call-settings';
import {
  parseBookingRoomName,
  type TechnicalEventDetails,
} from '@/lib/core/video/technical-events';
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';
import { isKrispNoiseFilterSupported } from '@livekit/krisp-noise-filter';
import { useIsCompact } from '@/lib/hooks/use-is-compact';
import { PreJoinCompact } from './prejoin/prejoin-compact';
import { PreJoinDesktop } from './prejoin/prejoin-desktop';
import {
  AUDIO_OUTPUT_STORAGE_KEY,
  playSpeakerTest,
  supportsAudioOutputSelection,
  usePreJoinState,
} from './prejoin/use-prejoin-state';

const KRISP_STORAGE_KEY = 'kaipai-livekit-krisp-enabled';

export type KaiPaiCallChoices = LocalUserChoices & {
  audioOutputDeviceId: string;
};

export function KaiPaiPreJoin({
  participantName,
  serverUrl,
  preflightToken,
  onDiagnostic,
  onJoin,
  minHeight = '70vh',
  counterpartName,
}: {
  participantName: string;
  serverUrl: string;
  preflightToken: string;
  onDiagnostic?: (details: TechnicalEventDetails) => void;
  onJoin: (choices: KaiPaiCallChoices) => void;
  minHeight?: string;
  counterpartName?: string;
}) {
  const state = usePreJoinState({
    participantName,
    serverUrl,
    preflightToken,
    onDiagnostic,
    onJoin,
  });

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
}

export function ConnectionQualityNotice() {
  const { localParticipant } = useLocalParticipant();
  const { quality } = useConnectionQualityIndicator({
    participant: localParticipant,
  });
  const presentation = connectionQualityPresentation(quality);
  const toneClasses = {
    neutral: 'border-white/15 bg-black/45 text-white/75',
    good: 'border-emerald-400/25 bg-emerald-950/75 text-emerald-100',
    warning: 'border-amber-400/30 bg-amber-950/85 text-amber-100',
    danger: 'border-red-400/30 bg-red-950/85 text-red-100',
  }[presentation.tone];
  const Icon =
    quality === ConnectionQuality.Lost
      ? WifiOff
      : quality === ConnectionQuality.Poor
        ? AlertTriangle
        : Wifi;

  return (
    <div
      role="status"
      aria-live="polite"
      title={presentation.detail}
      className={`flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm ${toneClasses}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{presentation.label}</span>
    </div>
  );
}

export function ApplyInitialAudioOutput({
  deviceId,
}: {
  deviceId: string;
}) {
  const room = useRoomContext();
  const connectionState = useConnectionState();

  useEffect(() => {
    if (
      connectionState !== ConnectionState.Connected ||
      !deviceId ||
      !supportsAudioOutputSelection()
    ) {
      return;
    }
    room.switchActiveDevice('audiooutput', deviceId).catch(() => {
      // Some browsers expose the device but still block changing the sink.
      // The default browser output remains active in that case.
    });
  }, [connectionState, deviceId, room]);

  return null;
}

function KrispNoiseControl() {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const supported = useMemo(() => isKrispNoiseFilterSupported(), []);
  const {
    setNoiseFilterEnabled,
    isNoiseFilterEnabled,
    isNoiseFilterPending,
    processor,
  } = useKrispNoiseFilter();
  const [error, setError] = useState<string | null>(null);
  const [activationRequested, setActivationRequested] = useState(false);
  const [startingMicrophone, setStartingMicrophone] = useState(false);
  const restored = useRef(false);
  const activationInFlight = useRef(false);

  const record = useCallback(
    (eventType: 'krisp_enabled' | 'krisp_disabled' | 'krisp_error') => {
      const bookingId = parseBookingRoomName(room.name);
      if (
        !bookingId ||
        !room.localParticipant.identity.startsWith('user-')
      ) {
        return;
      }
      void fetch(`/api/video/${bookingId}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventType,
          details: { supported },
        }),
        keepalive: true,
      }).catch(() => {});
    },
    [room, supported]
  );

  useEffect(() => {
    if (
      restored.current ||
      !supported ||
      isNoiseFilterPending
    ) {
      return;
    }
    restored.current = true;
    if (window.localStorage.getItem(KRISP_STORAGE_KEY) !== 'true') return;
    void setNoiseFilterEnabled(true).catch(() => {
      setError('Krisp non è disponibile su questo dispositivo.');
      record('krisp_error');
    });
  }, [
    isNoiseFilterPending,
    record,
    setNoiseFilterEnabled,
    supported,
  ]);

  useEffect(() => {
    if (
      !activationRequested ||
      !processor ||
      isNoiseFilterPending ||
      activationInFlight.current
    ) {
      return;
    }

    activationInFlight.current = true;
    void setNoiseFilterEnabled(true)
      .then(() => {
        window.localStorage.setItem(KRISP_STORAGE_KEY, 'true');
        record('krisp_enabled');
        setActivationRequested(false);
      })
      .catch(() => {
        setError(
          'Impossibile attivare Krisp. Controlla il microfono e riprova.'
        );
        record('krisp_error');
        setActivationRequested(false);
      })
      .finally(() => {
        activationInFlight.current = false;
        setStartingMicrophone(false);
      });
  }, [
    activationRequested,
    isNoiseFilterPending,
    processor,
    record,
    setNoiseFilterEnabled,
  ]);

  useEffect(() => {
    if (!activationRequested) return;
    const timeout = setTimeout(() => {
      if (activationInFlight.current) return;
      setActivationRequested(false);
      setStartingMicrophone(false);
      setError(
        'Krisp non si è avviato. Verifica che il microfono sia disponibile.'
      );
      record('krisp_error');
    }, 15_000);
    return () => clearTimeout(timeout);
  }, [activationRequested, record]);

  const toggle = async () => {
    const enabled = !isNoiseFilterEnabled;
    setError(null);
    try {
      if (enabled && !processor) {
        setStartingMicrophone(true);
        setActivationRequested(true);
        await setNoiseFilterEnabled(true);
        await localParticipant.setMicrophoneEnabled(
          true,
          KAIPAI_AUDIO_CAPTURE_DEFAULTS
        );
        return;
      }
      await setNoiseFilterEnabled(enabled);
      window.localStorage.setItem(KRISP_STORAGE_KEY, String(enabled));
      record(enabled ? 'krisp_enabled' : 'krisp_disabled');
    } catch {
      setStartingMicrophone(false);
      setActivationRequested(false);
      setError('Impossibile attivare Krisp. Riprova con il microfono acceso.');
      record('krisp_error');
    }
  };

  return (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 text-violet-300" />
          <div>
            <p className="text-sm font-medium">Krisp Noise Cancellation</p>
            <p className="mt-0.5 text-xs text-white/50">
              Riduzione avanzata di voci e rumori di fondo.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={
            !supported ||
            isNoiseFilterPending ||
            startingMicrophone
          }
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isNoiseFilterEnabled
              ? 'bg-violet-500/20 text-violet-200'
              : 'bg-white/10 text-white/60'
          } disabled:cursor-not-allowed disabled:opacity-45`}
        >
          {isNoiseFilterPending || startingMicrophone
            ? 'Attendo…'
            : isNoiseFilterEnabled
              ? 'Attivo'
              : 'Disattivato'}
        </button>
      </div>
      {!supported && (
        <p className="mt-2 text-xs text-amber-200">
          Non supportato da questo browser o dispositivo.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-amber-200">{error}</p>}
    </div>
  );
}

export function CallDeviceSettings() {
  const room = useRoomContext();
  const layout = useLayoutContext();
  const {
    saveAudioInputDeviceId,
    saveVideoInputDeviceId,
  } = usePersistentUserChoices();
  const [speakerTestState, setSpeakerTestState] = useState<
    'idle' | 'playing' | 'success' | 'error'
  >('idle');
  const [audioOutputDeviceId, setAudioOutputDeviceId] = useState(
    room.getActiveDevice('audiooutput') ?? 'default'
  );
  const outputSelectionSupported = useMemo(
    () => supportsAudioOutputSelection(),
    []
  );

  useEffect(() => {
    const handleActiveDeviceChanged = (
      kind: MediaDeviceKind,
      deviceId: string
    ) => {
      if (kind === 'audiooutput') setAudioOutputDeviceId(deviceId);
    };
    room.on(RoomEvent.ActiveDeviceChanged, handleActiveDeviceChanged);
    return () => {
      room.off(RoomEvent.ActiveDeviceChanged, handleActiveDeviceChanged);
    };
  }, [room]);

  const testSpeaker = async () => {
    setSpeakerTestState('playing');
    try {
      await playSpeakerTest(audioOutputDeviceId);
      setSpeakerTestState('success');
    } catch {
      setSpeakerTestState('error');
    }
  };

  const closeSettings = useCallback(() => {
    layout.widget.dispatch?.({ msg: 'toggle_settings' });
  }, [layout.widget]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSettings();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeSettings]);

  return (
    <div className="relative mx-auto max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950 p-4 text-white shadow-2xl">
      <button
        type="button"
        onClick={closeSettings}
        aria-label="Chiudi impostazioni"
        className="absolute right-3 top-3 rounded-full p-2 text-white/65 hover:bg-white/10 hover:text-white"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="mb-4 flex items-center gap-2 pr-10">
        <Settings2 className="h-5 w-5 text-red-400" />
        <div>
          <h3 className="font-semibold">Dispositivi chiamata</h3>
          <p className="text-xs text-white/55">
            Puoi cambiarli senza uscire dalla sessione.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <KrispNoiseControl />
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
          <span className="flex items-center gap-2 text-sm">
            <Mic className="h-4 w-4" /> Microfono
          </span>
          <MediaDeviceMenu
            kind="audioinput"
            onActiveDeviceChange={(_, deviceId) =>
              saveAudioInputDeviceId(deviceId)
            }
            className="!rounded-lg !bg-white/10 !px-3 !py-2 !text-xs"
          >
            Cambia
          </MediaDeviceMenu>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
          <span className="flex items-center gap-2 text-sm">
            <Camera className="h-4 w-4" /> Camera
          </span>
          <MediaDeviceMenu
            kind="videoinput"
            onActiveDeviceChange={(_, deviceId) =>
              saveVideoInputDeviceId(deviceId)
            }
            className="!rounded-lg !bg-white/10 !px-3 !py-2 !text-xs"
          >
            Cambia
          </MediaDeviceMenu>
        </div>
        {outputSelectionSupported && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 p-3">
            <span className="flex items-center gap-2 text-sm">
              <Volume2 className="h-4 w-4" /> Altoparlante
            </span>
            <MediaDeviceMenu
              kind="audiooutput"
              onActiveDeviceChange={(_, deviceId) => {
                setAudioOutputDeviceId(deviceId);
                window.localStorage.setItem(
                  AUDIO_OUTPUT_STORAGE_KEY,
                  deviceId
                );
              }}
              className="!rounded-lg !bg-white/10 !px-3 !py-2 !text-xs"
            >
              Cambia
            </MediaDeviceMenu>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={testSpeaker}
        disabled={speakerTestState === 'playing'}
        className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-sky-500/15 text-sm font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
      >
        <Volume2 className="h-4 w-4" />
        {speakerTestState === 'playing'
          ? 'Riproduzione…'
          : 'Prova altoparlante'}
      </button>
      {speakerTestState === 'success' && (
        <p className="mt-2 text-center text-xs text-emerald-300">
          Suono riprodotto correttamente.
        </p>
      )}
      {speakerTestState === 'error' && (
        <p className="mt-2 text-center text-xs text-amber-300">
          Controlla volume e autorizzazioni audio del browser.
        </p>
      )}

      <div className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-xs text-emerald-100">
        Riduzione rumore, cancellazione eco e volume automatico attivi.
      </div>
      <button
        type="button"
        onClick={closeSettings}
        className="mt-4 h-10 w-full rounded-full border border-white/15 text-sm font-semibold text-white/80 hover:bg-white/10"
      >
        Chiudi impostazioni
      </button>
    </div>
  );
}
