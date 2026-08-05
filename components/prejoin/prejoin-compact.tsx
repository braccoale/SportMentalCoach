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
  onCancel,
}: {
  state: PreJoinState;
  /** Nome di chi si sta per incontrare. Assente nel flusso ospite. */
  counterpartName?: string;
  onCancel?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [isRearCamera, setIsRearCamera] = useState(false);
  const track = state.userChoices.videoEnabled ? state.videoTrack : undefined;

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !track) return;
    track.attach(element);
    // La fotocamera posteriore non va specchiata: farlo renderebbe illeggibile
    // qualunque testo inquadrato. `facingMode` manca sulla maggior parte delle
    // webcam desktop, che restano specchiate come oggi.
    setIsRearCamera(track.mediaStreamTrack.getSettings().facingMode === 'environment');
    return () => {
      track.detach(element);
    };
  }, [track]);

  const dot =
    state.networkState === 'checking' || !state.networkResult
      ? 'bg-white/50'
      : NETWORK_DOT[state.networkResult.grade];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-neutral-950 text-white">
      {track ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`absolute inset-0 h-full w-full object-cover ${
            isRearCamera ? '' : '-scale-x-100'
          }`}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 text-3xl font-semibold">
            {initials(state.participantName)}
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

      {track && state.videoInputs.length >= 2 && (
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
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-3 h-12 w-full rounded-full border border-white/20 text-sm font-semibold text-white/80 active:bg-white/10"
          >
            Esci senza entrare
          </button>
        )}
      </div>

      <AdvancedSettingsSheet
        state={state}
        open={advancedOpen}
        onClose={() => setAdvancedOpen(false)}
      />
    </div>
  );
}
