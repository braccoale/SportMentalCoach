'use client';

import '@livekit/components-styles';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LiveKitRoom,
  VideoConference,
  useLocalParticipant,
} from '@livekit/components-react';
import type { LocalVideoTrack } from 'livekit-client';
import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
  type BackgroundProcessorWrapper,
} from '@livekit/track-processors';

/* Background options. "image" backgrounds are generated at runtime as gradient
   data-URLs so we ship no assets and make no external requests. */
type BgOption =
  | { id: 'none'; label: string; kind: 'none' }
  | { id: 'blur'; label: string; kind: 'blur' }
  | { id: string; label: string; kind: 'image'; from: string; to: string };

/** Renders a diagonal two-stop gradient to a data-URL usable as a background. */
function gradientDataUrl(from: string, to: string): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  g.addColorStop(0, from);
  g.addColorStop(1, to);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

const BG_OPTIONS: BgOption[] = [
  { id: 'none', label: 'Nessuno', kind: 'none' },
  { id: 'blur', label: 'Sfoca', kind: 'blur' },
  { id: 'kaipai', label: 'Kai Pai', kind: 'image', from: '#1a0505', to: '#7f1d1d' },
  { id: 'studio', label: 'Studio', kind: 'image', from: '#0f172a', to: '#334155' },
];

/**
 * Camera background controls (blur / virtual background). Must live inside
 * <LiveKitRoom> so it can reach the local camera track. Applies a single
 * reusable processor and switches modes on the fly to avoid visual artifacts.
 */
function BackgroundControls() {
  const { cameraTrack, isCameraEnabled } = useLocalParticipant();
  const [selected, setSelected] = useState<string>('none');
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);
  const supported = useMemo(() => supportsBackgroundProcessors(), []);

  // Generate gradient data-URLs once (client-only).
  const images = useMemo(() => {
    const map: Record<string, string> = {};
    for (const o of BG_OPTIONS) {
      if (o.kind === 'image') map[o.id] = gradientDataUrl(o.from, o.to);
    }
    return map;
  }, []);

  const track = cameraTrack?.track as LocalVideoTrack | undefined;

  // Apply the selected effect whenever it — or the underlying camera track
  // (e.g. after toggling the camera) — changes.
  useEffect(() => {
    if (!supported || !track) return;
    const option = BG_OPTIONS.find((o) => o.id === selected);
    if (!option) return;

    let cancelled = false;
    (async () => {
      try {
        if (option.kind === 'none') {
          if (track.getProcessor()) await track.stopProcessor();
          return;
        }
        const opts =
          option.kind === 'blur'
            ? ({ mode: 'background-blur', blurRadius: 12 } as const)
            : ({ mode: 'virtual-background', imagePath: images[option.id] } as const);

        if (!processorRef.current) {
          processorRef.current = BackgroundProcessor(opts);
        }
        if (cancelled) return;
        if (track.getProcessor() !== processorRef.current) {
          await track.setProcessor(processorRef.current);
        }
        if (cancelled) return;
        await processorRef.current.switchTo(opts);
      } catch (err) {
        console.error('background processor failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supported, track, selected, images]);

  if (!supported) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 bg-black/40 px-3 py-2">
      <span className="mr-1 text-xs font-medium text-white/60">Sfondo</span>
      {BG_OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => setSelected(o.id)}
          disabled={!isCameraEnabled}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            selected === o.id
              ? 'bg-red-600 text-white'
              : 'bg-white/10 text-white/80 hover:bg-white/20'
          }`}
        >
          {o.label}
        </button>
      ))}
      {!isCameraEnabled && (
        <span className="text-[11px] text-white/40">
          Attiva la camera per cambiare sfondo
        </span>
      )}
    </div>
  );
}

/**
 * LiveKit room client. Connects with a server-minted token and renders the
 * standard conference UI (camera/mic publish + remote participants), plus a
 * background blur / virtual-background toolbar for the local camera.
 */
export function VideoRoom({
  serverUrl,
  token,
}: {
  serverUrl: string;
  token: string;
}) {
  return (
    <div
      data-lk-theme="default"
      style={{ height: '70vh' }}
      className="overflow-hidden rounded-lg border border-gray-200"
    >
      <LiveKitRoom
        serverUrl={serverUrl}
        token={token}
        connect
        video
        audio
        style={{ height: '100%' }}
      >
        <div className="flex h-full flex-col">
          <BackgroundControls />
          <div className="min-h-0 flex-1">
            {/* VideoConference renders its own RoomAudioRenderer internally —
                do not add a second one or remote audio plays twice/garbled. */}
            <VideoConference />
          </div>
        </div>
      </LiveKitRoom>
    </div>
  );
}
