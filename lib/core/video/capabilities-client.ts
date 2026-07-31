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
