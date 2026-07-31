'use client';

import { useEffect, useRef } from 'react';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Esc chiude il pannello: su tablet con tastiera è il gesto atteso.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // All'apertura sposta il focus nel pannello e lo ripristina alla chiusura;
  // un dialog con aria-modal deve gestire il focus da sé, non solo dichiararlo.
  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();
    return () => {
      previouslyFocusedRef.current?.focus();
    };
  }, [open]);

  // Intrappola Tab/Shift+Tab dentro il pannello finché è aperto, altrimenti
  // il focus potrebbe finire sugli elementi dietro il backdrop.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !dialog.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

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
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Impostazioni avanzate"
        className="relative max-h-[80%] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-neutral-950 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 text-white"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Impostazioni avanzate</h2>
          <button
            ref={closeButtonRef}
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
