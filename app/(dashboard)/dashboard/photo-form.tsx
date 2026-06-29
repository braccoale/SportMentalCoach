'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoachAvatar } from '@/components/coach-visuals';
import { updatePhotoAction } from './photo-actions';
import type { ActionState } from '@/lib/auth/middleware';

export function PhotoForm({
  name,
  avatarUrl,
}: {
  name: string | null;
  avatarUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updatePhotoAction,
    { error: '' }
  );

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-medium text-gray-700">Foto profilo</h2>
      <form action={formAction} className="mt-3 flex items-center gap-4">
        <CoachAvatar name={name} src={avatarUrl} />
        <div className="flex-1">
          <input
            type="url"
            name="avatarUrl"
            defaultValue={avatarUrl ?? ''}
            placeholder="https://…/foto.jpg"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-gray-400">
            Incolla l’URL di un’immagine. Lascia vuoto per rimuovere.
          </p>
        </div>
        <Button type="submit" disabled={pending} className="rounded-md">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salva'}
        </Button>
      </form>
      {state?.error && (
        <p className="mt-2 text-sm text-red-500">{state.error}</p>
      )}
      {state?.success && (
        <p className="mt-2 text-sm text-green-600">{state.success}</p>
      )}
    </div>
  );
}
