'use client';

import { startTransition, useActionState, useEffect, useRef, useState } from 'react';
import { mutate } from 'swr';
import { Loader2, Upload, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoachAvatar } from '@/components/coach-visuals';
import { updatePhotoAction } from './photo-actions';
import type { ActionState } from '@/lib/auth/middleware';

export function PhotoForm({
  name,
  avatarUrl,
  status,
}: {
  name: string | null;
  avatarUrl: string | null;
  /** Coach profile status; an "Approved" badge shows when `approved`. */
  status?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updatePhotoAction,
    { error: '' }
  );
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.success) void mutate('/api/user');
  }, [state]);

  function submitUrl(url: string) {
    const fd = new FormData();
    fd.append('avatarUrl', url);
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
      const res = await fetch('/api/upload-avatar', {
        method: 'POST',
        body: fd,
      });
      const responseText = await res.text();
      let data: { error?: string; url?: string } | null = null;
      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          // Proxies and hosting platforms can return an HTML error page.
        }
      }
      if (!res.ok) {
        throw new Error(
          data?.error || `Caricamento fallito (errore ${res.status}).`
        );
      }
      if (!data?.url) {
        throw new Error('Il server non ha restituito la foto caricata.');
      }
      submitUrl(data.url);
    } catch (err) {
      setPreview(avatarUrl);
      setUploadError(err instanceof Error ? err.message : 'Caricamento fallito.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="h-full rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-700">Foto profilo</h2>
        {status === 'approved' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 ring-1 ring-green-200">
            <BadgeCheck className="h-4 w-4" />
            Approvato
          </span>
        )}
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <div className="relative">
          <CoachAvatar name={name} src={preview} className="size-20 text-xl" />
          {status === 'approved' && (
            <span
              title="Profilo approvato"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow ring-1 ring-green-200"
            >
              <BadgeCheck className="h-6 w-6 text-green-600" />
            </span>
          )}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
          />
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            size="sm"
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
                Carica foto
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
              className="ml-3 text-sm text-gray-500 hover:text-gray-900"
            >
              Rimuovi
            </button>
          )}
          <p className="mt-1.5 text-xs text-gray-400">JPG o PNG, max 5MB.</p>
        </div>
      </div>

      {uploadError && <p className="mt-2 text-sm text-red-500">{uploadError}</p>}
      {state?.error && <p className="mt-2 text-sm text-red-500">{state.error}</p>}
      {state?.success && (
        <p className="mt-2 text-sm text-green-600">{state.success}</p>
      )}
    </div>
  );
}
