'use client';

import { startTransition, useActionState, useRef, useState } from 'react';
import { Loader2, Upload, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateVideoAction } from './profile-actions';
import type { ActionState } from '@/lib/auth/middleware';

/** True for a hosted video file we can play inline (uploaded, not YouTube/Vimeo). */
function isPlayableFile(url: string): boolean {
  return url.startsWith('/uploads/') || /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
}

export function VideoUpload({ videoUrl }: { videoUrl: string | null }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateVideoAction,
    { error: '' }
  );
  const [preview, setPreview] = useState<string | null>(videoUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function submitUrl(url: string) {
    const fd = new FormData();
    fd.append('videoUrl', url);
    startTransition(() => formAction(fd));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setUploadError('');
    setPreview(URL.createObjectURL(file)); // instant local preview
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload-video', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Caricamento fallito.');
      submitUrl(data.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Caricamento fallito.');
    } finally {
      setUploading(false);
    }
  }

  const playable = preview ? isPlayableFile(preview) : false;

  return (
    <div className="flex flex-col">
      <span className="text-sm font-medium text-gray-700">
        Video di presentazione
      </span>
      <p className="mt-1 text-xs text-gray-400">
        Un breve video aumenta molto le prenotazioni. MP4 o WebM, max 100MB.
      </p>

      <div className="mt-3">
        {preview ? (
          // YouTube-style thumbnail card with a play overlay.
          <div className="group relative aspect-video w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-black">
            {playable ? (
              <video
                src={preview}
                controls
                preload="metadata"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gray-900 text-center text-sm text-gray-300">
                Video collegato
              </div>
            )}
            {!playable && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-lg">
                  <Play className="h-6 w-6 translate-x-0.5 fill-white text-white" />
                </span>
              </span>
            )}
          </div>
        ) : (
          <div className="flex aspect-video w-full max-w-md items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 text-sm text-gray-400">
            Nessun video caricato
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={onFile}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-md"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Caricamento…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              {preview ? 'Sostituisci video' : 'Carica video'}
            </>
          )}
        </Button>
        {preview && (
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              submitUrl('');
            }}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
            Rimuovi
          </button>
        )}
      </div>

      {uploadError && <p className="mt-2 text-sm text-red-500">{uploadError}</p>}
      {state?.error && <p className="mt-2 text-sm text-red-500">{state.error}</p>}
      {state?.success && (
        <p className="mt-2 text-sm text-green-600">{state.success}</p>
      )}
    </div>
  );
}
