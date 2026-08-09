'use client';

import { useRef, useState } from 'react';
import { Mic, Loader2, Trash2 } from 'lucide-react';

/**
 * Nota vocale: si tiene premuto, si parla, si rilascia.
 *
 * Dopo una seduta da telefono scrivere è scomodo e parlare no. Il gesto è
 * quello di WhatsApp perché è già nelle mani di tutti: tenere premuto,
 * rilasciare per inviare, trascinare via per annullare.
 *
 * Il formato lo sceglie il browser: Chrome e Firefox producono webm, Safari
 * mp4, e non esiste un formato che vada bene ovunque. Il server accetta
 * entrambi.
 */

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return (
    MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
  );
}

export function VoiceNoteButton({
  sessionId,
  onRecorded,
  className = '',
}: {
  sessionId: number;
  onRecorded?: () => void;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'sending' | 'error'>(
    'idle'
  );
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const tickRef = useRef<number | null>(null);

  function stopTicking() {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }

  async function start() {
    if (state !== 'idle') return;
    const mimeType = pickMimeType();
    if (!mimeType) {
      setState('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stopTicking();
        // Il microfono si spegne sempre, anche annullando: una spia accesa
        // dopo che l'utente ha annullato è un tradimento.
        for (const track of stream.getTracks()) track.stop();
        if (cancelledRef.current) {
          setState('idle');
          setSeconds(0);
          return;
        }
        const durationMs = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        // Sotto il secondo è quasi sempre un tocco involontario.
        if (durationMs < 1000 || blob.size === 0) {
          setState('idle');
          setSeconds(0);
          return;
        }
        setState('sending');
        try {
          const response = await fetch(
            `/api/ai-session-notes/${sessionId}/voice-note`,
            {
              method: 'POST',
              headers: {
                'Content-Type': mimeType.split(';')[0],
                'x-duration-ms': String(durationMs),
              },
              body: blob,
            }
          );
          setState(response.ok ? 'idle' : 'error');
          if (response.ok) onRecorded?.();
        } catch {
          setState('error');
        }
        setSeconds(0);
      };
      startedAtRef.current = Date.now();
      recorder.start();
      recorderRef.current = recorder;
      setState('recording');
      setSeconds(0);
      tickRef.current = window.setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 250);
    } catch {
      setState('error');
    }
  }

  function stop(cancel = false) {
    cancelledRef.current = cancel;
    recorderRef.current?.state === 'recording' && recorderRef.current.stop();
    recorderRef.current = null;
  }

  const recording = state === 'recording';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        type="button"
        disabled={state === 'sending'}
        onPointerDown={() => void start()}
        onPointerUp={() => stop(false)}
        onPointerLeave={() => recording && stop(true)}
        aria-label={recording ? 'Rilascia per inviare la nota vocale' : 'Tieni premuto per registrare una nota vocale'}
        className={`inline-flex select-none items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
          recording
            ? 'bg-red-600 text-white'
            : state === 'error'
              ? 'border border-red-200 bg-red-50 text-red-700'
              : 'border border-violet-200 bg-white text-violet-700 hover:bg-violet-50'
        }`}
      >
        {state === 'sending' ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Mic className="size-4" aria-hidden="true" />
        )}
        {recording
          ? `${seconds}s · rilascia per inviare`
          : state === 'sending'
            ? 'Invio…'
            : state === 'error'
              ? 'Riprova'
              : 'Nota vocale'}
      </button>

      {recording ? (
        <span className="inline-flex items-center gap-1 text-xs text-gray-500">
          <Trash2 className="size-3.5" aria-hidden="true" />
          Sposta il dito fuori per annullare
        </span>
      ) : null}
    </div>
  );
}
