'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { Track, type LocalVideoTrack } from 'livekit-client';
import { SwitchCamera } from 'lucide-react';
import type { VideoFacingMode } from '@/components/prejoin/use-prejoin-state';

/**
 * Inverte la fotocamera durante la chiamata.
 *
 * Usa `restartTrack`, che riavvia la sorgente lasciando pubblicata la stessa
 * traccia: nessuna rinegoziazione e nessun buco video per chi sta guardando.
 * Ripubblicare la traccia funzionerebbe, ma interromperebbe il flusso
 * all'altra persona per qualche istante.
 *
 * Si chiede `facingMode` e non un `deviceId`: sui browser mobili
 * l'identificativo del dispositivo è una preferenza che il browser può
 * ignorare, il lato del telefono no.
 */
export function RoomFlipCameraControl() {
  const { cameraTrack, isCameraEnabled } = useLocalParticipant();
  const [facingMode, setFacingMode] = useState<VideoFacingMode>('user');
  const [pending, setPending] = useState(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let active = true;
    const refresh = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!active) return;
        setHasMultipleCameras(
          devices.filter((device) => device.kind === 'videoinput').length > 1
        );
      } catch {
        // Senza permessi l'elenco è vuoto: il pulsante resta nascosto.
      }
    };
    void refresh();
    navigator.mediaDevices.addEventListener?.('devicechange', refresh);
    return () => {
      active = false;
      navigator.mediaDevices.removeEventListener?.('devicechange', refresh);
    };
  }, []);

  const flip = useCallback(async () => {
    const track = cameraTrack?.track as LocalVideoTrack | undefined;
    if (!track || pending) return;
    // Il lato attuale si chiede alla traccia, non lo si ricorda: chi ha già
    // invertito nel pre-join entra in chiamata sulla posteriore, e uno stato
    // interno inizializzato per ipotesi sprecherebbe la prima pressione a
    // richiedere il lato su cui si è già.
    const settings = track.mediaStreamTrack?.getSettings();
    const current =
      (settings?.facingMode as VideoFacingMode | undefined) ?? facingMode;
    const next: VideoFacingMode =
      current === 'environment' ? 'user' : 'environment';
    setPending(true);
    try {
      await track.restartTrack({ facingMode: next });
      setFacingMode(next);
    } catch (error) {
      // Un telefono con una sola fotocamera, o un permesso revocato a metà
      // chiamata: si resta sulla sorgente attuale invece di perdere il video.
      console.warn('[LiveKit] Inversione fotocamera non riuscita', error);
    } finally {
      setPending(false);
    }
  }, [cameraTrack, facingMode, pending]);

  if (
    !hasMultipleCameras ||
    !isCameraEnabled ||
    cameraTrack?.source !== Track.Source.Camera
  ) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => void flip()}
      disabled={pending}
      aria-label={
        facingMode === 'environment'
          ? 'Torna alla fotocamera frontale'
          : 'Passa alla fotocamera posteriore'
      }
      title={
        facingMode === 'environment'
          ? 'Torna alla fotocamera frontale'
          : 'Passa alla fotocamera posteriore'
      }
      className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 disabled:opacity-50"
    >
      <SwitchCamera className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
