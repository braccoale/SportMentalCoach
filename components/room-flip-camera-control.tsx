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
    const next: VideoFacingMode =
      facingMode === 'environment' ? 'user' : 'environment';
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
      className="inline-flex min-h-9 items-center rounded-full border border-white/15 bg-black/45 p-2 text-white/85 hover:bg-black/65 disabled:opacity-50"
    >
      <SwitchCamera className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
