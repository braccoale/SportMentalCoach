'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Circle, Loader2, RotateCcw, Square, Trash2, Upload, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  COACH_VIDEO_MAX_BYTES,
  COACH_VIDEO_MAX_SECONDS,
  baseVideoType,
  formatClock,
  pickRecorderMimeType,
  validateVideo,
} from '@/lib/core/coach-video-upload';
import { updateVideoAction } from './profile-actions';

/**
 * Il video di presentazione del coach: lo registra dal browser (webcam o
 * fotocamera del telefono) oppure carica un file, lo vede in anteprima e lo
 * pubblica. Può sostituirlo o eliminarlo.
 *
 * Il file va direttamente su Supabase Storage con un indirizzo firmato dal
 * server (`/api/coach-video/upload-url`): una funzione Vercel non accetta
 * richieste oltre i 4,5 MB. Il video già pubblicato resta tale finché il nuovo
 * non è stato caricato e salvato; solo allora il vecchio file viene tolto
 * (lo fa `updateVideoAction`).
 */

const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const RECORDING_BITRATE = 1_500_000; // ~22 MB per 2 minuti: sotto il limite con margine

type Draft = { blob: Blob; url: string; durationSec: number | null; source: 'recorded' | 'file' };

/** Un video riproducibile in pagina (caricato da noi), non un link a YouTube/Vimeo. */
function isPlayableFile(url: string): boolean {
  return url.startsWith('/uploads/') || /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url) || url.includes('/storage/v1/object/public/');
}

function readDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const el = document.createElement('video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => resolve(null);
    el.src = url;
  });
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Non abbiamo il permesso di usare fotocamera e microfono. Abilitali dalle impostazioni del browser e riprova.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'Non troviamo una fotocamera o un microfono su questo dispositivo.';
  }
  if (name === 'NotReadableError') {
    return 'La fotocamera è in uso da un’altra app. Chiudila e riprova.';
  }
  return 'Non riusciamo ad avviare la fotocamera. Puoi caricare un video già registrato.';
}

export function VideoUpload({ videoUrl }: { videoUrl: string | null }) {
  const router = useRouter();
  const [published, setPublished] = useState<string | null>(videoUrl);
  const [panel, setPanel] = useState<'closed' | 'choose' | 'camera'>('closed');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const mimeRef = useRef('video/webm');

  const stopCamera = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    setRecording(false);
  }, []);

  // La fotocamera si spegne sempre quando si lascia la pagina.
  useEffect(() => () => stopCamera(), [stopCamera]);
  useEffect(() => {
    return () => {
      if (draft) URL.revokeObjectURL(draft.url);
    };
  }, [draft]);

  async function startCamera() {
    setError('');
    setMessage('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Questo browser non può registrare dalla fotocamera. Usa «Carica un video» (sul telefono si apre anche la fotocamera).');
      return;
    }
    setPanel('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      setCameraReady(true);
      requestAnimationFrame(() => {
        if (liveRef.current) {
          liveRef.current.srcObject = stream;
          void liveRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      setPanel('choose');
      setError(cameraErrorMessage(e));
    }
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    const mime = pickRecorderMimeType((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) {
      setError('Questo browser non sa registrare video. Usa «Carica un video».');
      return;
    }
    mimeRef.current = baseVideoType(mime);
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: RECORDING_BITRATE,
      audioBitsPerSecond: 96_000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const duration = Math.min((Date.now() - startedAtRef.current) / 1000, COACH_VIDEO_MAX_SECONDS);
      const blob = new Blob(chunksRef.current, { type: mimeRef.current });
      stopCamera();
      setDraft({ blob, url: URL.createObjectURL(blob), durationSec: duration, source: 'recorded' });
    };
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setSeconds(0);
    recorder.start(1000);
    setRecording(true);
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAtRef.current) / 1000;
      setSeconds(elapsed);
      // Il tetto dei 2 minuti: la registrazione si ferma da sola.
      if (elapsed >= COACH_VIDEO_MAX_SECONDS && recorderRef.current?.state === 'recording') {
        recorderRef.current.stop();
      }
    }, 250);
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  function discardDraftAndRetry() {
    setDraft(null);
    setError('');
    void startCamera();
  }

  function closeAll() {
    stopCamera();
    setDraft(null);
    setPanel('closed');
    setError('');
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setMessage('');
    const url = URL.createObjectURL(file);
    const durationSec = await readDuration(url);
    const check = validateVideo({ type: file.type, size: file.size, durationSec });
    if (!check.ok) {
      URL.revokeObjectURL(url);
      setError(check.error);
      return;
    }
    setPanel('choose');
    setDraft({ blob: file, url, durationSec, source: 'file' });
  }

  /** Carica con avanzamento: direttamente su Supabase Storage, o tramite il server in locale. */
  function sendWithProgress(
    method: 'PUT' | 'POST',
    url: string,
    body: FormData,
    headers: Record<string, string>
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else if (xhr.status === 413) reject(new Error('Il video è troppo grande per essere caricato.'));
        else reject(new Error('Caricamento non riuscito. Riprova.'));
      };
      xhr.onerror = () => reject(new Error('Connessione interrotta durante il caricamento. Riprova.'));
      xhr.send(body);
    });
  }

  async function publish() {
    if (!draft) return;
    setError('');
    setMessage('');
    const type = baseVideoType(draft.blob.type || mimeRef.current);
    const check = validateVideo({ type, size: draft.blob.size, durationSec: draft.durationSec });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const prep = await fetch('/api/coach-video/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, size: draft.blob.size, durationSec: draft.durationSec }),
      });
      const info = await prep.json();
      if (!prep.ok) throw new Error(info.error || 'Non riusciamo a preparare il caricamento.');

      let finalUrl: string;
      if (info.mode === 'direct') {
        const form = new FormData();
        form.append('cacheControl', '3600');
        form.append('', draft.blob);
        const headers: Record<string, string> = { 'x-upsert': 'false' };
        if (SUPABASE_ANON_KEY) {
          headers.apikey = SUPABASE_ANON_KEY;
          headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
        }
        await sendWithProgress('PUT', info.signedUrl, form, headers);
        finalUrl = info.publicUrl;
      } else {
        // Sviluppo locale: senza Supabase il file passa dal server.
        const form = new FormData();
        form.append('file', new File([draft.blob], `video.${type.split('/')[1]}`, { type }));
        const res = await fetch('/api/upload-video', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Caricamento fallito.');
        setProgress(100);
        finalUrl = data.url;
      }

      // Il nuovo video diventa quello pubblicato solo ora, a caricamento finito.
      const fd = new FormData();
      fd.append('videoUrl', finalUrl);
      const result = await updateVideoAction({ error: '' }, fd);
      if (result?.error) throw new Error(result.error);
      setPublished(finalUrl);
      setDraft(null);
      setPanel('closed');
      setMessage('Video pubblicato.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Caricamento non riuscito. Riprova.');
    } finally {
      setUploading(false);
    }
  }

  async function removeVideo() {
    setError('');
    setMessage('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('videoUrl', '');
      const result = await updateVideoAction({ error: '' }, fd);
      if (result?.error) throw new Error(result.error);
      setPublished(null);
      setConfirmDelete(false);
      setMessage('Video eliminato.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Non siamo riusciti a eliminare il video.');
    } finally {
      setUploading(false);
    }
  }

  const maxMinutes = COACH_VIDEO_MAX_SECONDS / 60;
  const maxMb = Math.round(COACH_VIDEO_MAX_BYTES / (1024 * 1024));
  const busy = uploading || recording;

  return (
    <section className="rounded-lg border border-gray-200 p-4" aria-labelledby="video-presentazione">
      <h2 id="video-presentazione" className="text-lg font-medium text-gray-900">
        Video di presentazione
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Un breve video (massimo {maxMinutes} minuti) aiuta gli atleti a conoscerti prima della sessione.
      </p>

      {/* Il video pubblicato: resta questo finché il nuovo non è caricato. */}
      {published && !draft && panel !== 'camera' && (
        <div className="mt-4">
          {isPlayableFile(published) ? (
            <div className="aspect-video w-full max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-black">
              <video src={published} controls preload="metadata" playsInline className="h-full w-full object-contain" />
            </div>
          ) : (
            <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-600">Video collegato da un servizio esterno.</p>
          )}
        </div>
      )}

      {/* Registrazione dal browser */}
      {panel === 'camera' && !draft && (
        <div className="mt-4 max-w-xl">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
            <video
              ref={liveRef}
              muted
              playsInline
              autoPlay
              className="h-full w-full -scale-x-100 object-cover"
              aria-label="Anteprima della fotocamera"
            />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Avvio della fotocamera…
              </div>
            )}
            {recording && (
              <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm font-medium text-white">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
                <span aria-live="off">
                  {formatClock(seconds)} / {formatClock(COACH_VIDEO_MAX_SECONDS)}
                </span>
              </span>
            )}
          </div>
          {recording && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
              <div
                className="h-full rounded-full bg-green-500 transition-[width]"
                style={{ width: `${Math.min(100, (seconds / COACH_VIDEO_MAX_SECONDS) * 100)}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-gray-500">
            {recording
              ? 'Stai registrando. Premi «Ferma» quando hai finito: si ferma da solo dopo 2 minuti.'
              : 'Inquadrati bene, con una luce davanti a te. Premi «Avvia» quando sei pronto.'}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!recording ? (
              <Button type="button" onClick={startRecording} disabled={!cameraReady} className="rounded-full">
                <Circle className="h-4 w-4 fill-current" /> Avvia
              </Button>
            ) : (
              <Button type="button" onClick={stopRecording} className="rounded-full">
                <Square className="h-4 w-4 fill-current" /> Ferma
              </Button>
            )}
            {!recording && (
              <Button type="button" variant="ghost" onClick={closeAll} className="rounded-full">
                Annulla
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Anteprima prima di pubblicare */}
      {draft && (
        <div className="mt-4 max-w-xl">
          <p className="mb-2 text-sm font-medium text-gray-800">
            Anteprima {draft.durationSec ? `(${formatClock(draft.durationSec)})` : ''}
          </p>
          <div className="aspect-video overflow-hidden rounded-xl border border-gray-200 bg-black">
            <video src={draft.url} controls playsInline preload="metadata" className="h-full w-full object-contain" />
          </div>
          {published && !uploading && (
            <p className="mt-2 text-xs text-gray-500">Il video attuale resta pubblicato finché questo non è stato caricato.</p>
          )}
          {uploading && (
            <div className="mt-3" role="status" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-green-500 transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-gray-600">Caricamento… {progress}%</p>
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={publish} disabled={uploading} className="rounded-full">
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Pubblica
                </>
              )}
            </Button>
            {draft.source === 'recorded' ? (
              <Button type="button" variant="outline" onClick={discardDraftAndRetry} disabled={uploading} className="rounded-full">
                <RotateCcw className="h-4 w-4" /> Riprova
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-full">
                Scegli un altro file
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={closeAll} disabled={uploading} className="rounded-full">
              Annulla
            </Button>
          </div>
        </div>
      )}

      {/* Scelta: registrare o caricare */}
      {panel !== 'camera' && !draft && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" onClick={startCamera} disabled={busy} className="rounded-full">
            <Camera className="h-4 w-4" /> {published ? 'Registra un nuovo video' : 'Registra video'}
          </Button>
          <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-full">
            <Upload className="h-4 w-4" /> {published ? 'Carica un nuovo video' : 'Carica video'}
          </Button>
          {published && !confirmDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-2 text-sm text-gray-500 hover:text-gray-900 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Elimina
            </button>
          )}
          {published && confirmDelete && (
            <span className="inline-flex flex-wrap items-center gap-2 text-sm text-gray-700">
              Eliminare il video?
              <Button type="button" size="sm" onClick={removeVideo} disabled={uploading} className="rounded-full">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sì, elimina'}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)} disabled={uploading} className="rounded-full">
                Annulla
              </Button>
            </span>
          )}
        </div>
      )}
      {panel !== 'camera' && !draft && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
          <Video className="h-3.5 w-3.5" aria-hidden /> MP4, WebM o MOV, massimo {maxMb} MB e {maxMinutes} minuti.
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*"
        className="hidden"
        onChange={onFile}
      />

      <div role="status" aria-live="polite">
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {message && !error && <p className="mt-3 text-sm text-green-700">{message}</p>}
      </div>
    </section>
  );
}
