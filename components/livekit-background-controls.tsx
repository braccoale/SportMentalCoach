'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import type { LocalVideoTrack } from 'livekit-client';
import {
  BackgroundProcessor,
  supportsBackgroundProcessors,
  type BackgroundProcessorWrapper,
} from '@livekit/track-processors';

type BackgroundOption =
  | { id: 'none'; label: string; kind: 'none' }
  | { id: 'blur'; label: string; kind: 'blur' }
  | { id: string; label: string; kind: 'image'; src: string }
  | {
      id: string;
      label: string;
      kind: 'image';
      from: string;
      to: string;
    };

function gradientDataUrl(from: string, to: string): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const gradient = context.createLinearGradient(
    0,
    0,
    canvas.width,
    canvas.height
  );
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.9);
}

const BACKGROUND_OPTIONS: BackgroundOption[] = [
  { id: 'none', label: 'Nessuno', kind: 'none' },
  { id: 'blur', label: 'Sfoca', kind: 'blur' },
  {
    id: 'kaipai',
    label: 'KaiPai',
    kind: 'image',
    src: '/kaipai-vc-bg.jpg',
  },
  {
    id: 'studio',
    label: 'Studio',
    kind: 'image',
    from: '#0f172a',
    to: '#334155',
  },
];

const BACKGROUND_STORAGE_KEY = 'kaipai-livekit-background';
const BACKGROUND_BLUR_RADIUS = 24;

function TrackBackgroundControls({
  track,
  controlsEnabled,
  showControls = true,
}: {
  track?: LocalVideoTrack;
  controlsEnabled: boolean;
  showControls?: boolean;
}) {
  const [selected, setSelected] = useState('none');
  const processorRef = useRef<BackgroundProcessorWrapper | null>(null);
  const processorTrackRef = useRef<LocalVideoTrack | null>(null);
  const supported = useMemo(() => supportsBackgroundProcessors(), []);
  const images = useMemo(() => {
    const result: Record<string, string> = {};
    for (const option of BACKGROUND_OPTIONS) {
      if (option.kind !== 'image') continue;
      result[option.id] =
        'src' in option
          ? option.src
          : gradientDataUrl(option.from, option.to);
    }
    return result;
  }, []);
  useEffect(() => {
    const stored = window.localStorage.getItem(BACKGROUND_STORAGE_KEY);
    if (
      stored &&
      BACKGROUND_OPTIONS.some((option) => option.id === stored)
    ) {
      setSelected(stored);
    }
  }, []);

  useEffect(() => {
    if (!supported || !track) return;
    const option = BACKGROUND_OPTIONS.find((item) => item.id === selected);
    if (!option) return;

    let cancelled = false;
    void (async () => {
      try {
        if (option.kind === 'none') {
          if (track.getProcessor()) await track.stopProcessor();
          processorRef.current = null;
          processorTrackRef.current = null;
          return;
        }
        const processorOptions =
          option.kind === 'blur'
            ? ({
                mode: 'background-blur',
                blurRadius: BACKGROUND_BLUR_RADIUS,
              } as const)
            : ({
                mode: 'virtual-background',
                imagePath: images[option.id],
              } as const);
        if (processorTrackRef.current !== track) {
          const existing = track.getProcessor();
          processorRef.current =
            existing && 'switchTo' in existing
              ? (existing as BackgroundProcessorWrapper)
              : null;
          processorTrackRef.current = track;
        }
        if (!processorRef.current) {
          processorRef.current = BackgroundProcessor(processorOptions);
        }
        if (cancelled) return;
        if (track.getProcessor() !== processorRef.current) {
          await track.setProcessor(processorRef.current);
        }
        if (!cancelled) {
          await processorRef.current.switchTo(processorOptions);
        }
      } catch (error) {
        console.error('[LiveKit] Background processor failed', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [images, selected, supported, track]);

  if (!supported || !showControls) return null;

  const selectBackground = (id: string) => {
    setSelected(id);
    window.localStorage.setItem(BACKGROUND_STORAGE_KEY, id);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-white/60">Sfondo</span>
      {BACKGROUND_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => selectBackground(option.id)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selected === option.id
              ? 'bg-red-600 text-white'
              : 'bg-white/10 text-white/80 hover:bg-white/20'
          }`}
        >
          {option.label}
        </button>
      ))}
      {!controlsEnabled && (
        <span className="text-[11px] text-white/40">
          Verrà applicato quando attivi la camera
        </span>
      )}
    </div>
  );
}

export function PreviewBackgroundControls({
  track,
  enabled,
}: {
  track?: LocalVideoTrack;
  enabled: boolean;
}) {
  return (
    <TrackBackgroundControls
      track={track}
      controlsEnabled={enabled}
    />
  );
}

export function BackgroundControls() {
  const { cameraTrack, isCameraEnabled } = useLocalParticipant();
  return (
    <TrackBackgroundControls
      track={cameraTrack?.track as LocalVideoTrack | undefined}
      controlsEnabled={isCameraEnabled}
    />
  );
}

export function BackgroundSelectionApplier() {
  const { cameraTrack, isCameraEnabled } = useLocalParticipant();
  return (
    <TrackBackgroundControls
      track={cameraTrack?.track as LocalVideoTrack | undefined}
      controlsEnabled={isCameraEnabled}
      showControls={false}
    />
  );
}
