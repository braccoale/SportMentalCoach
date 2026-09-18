'use client';

import { useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/auth/middleware';

type ActionFn = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Il form materiali. Prima era: input file nativo nudo ("Scegli file /
 * Nessun file selezionato" in piccolo tra un campo testo e un bottone
 * verde) — facile da non notare, e cliccare "Carica" senza aver scelto
 * niente faceva comparire il popup nativo del browser sopra il campo
 * file, non vicino al bottone appena premuto. Ora "Scegli file" è
 * un'etichetta cliccabile che mostra il nome scelto, e "Carica" resta
 * disattivato finché titolo e file non ci sono entrambi — cliccarlo
 * prematuramente non fa comparire nulla di sorprendente, perché non è
 * cliccabile.
 */
export function MaterialUploadForm({
  action,
  moduleId,
  courseId,
}: {
  action: ActionFn;
  moduleId: number;
  courseId: number;
}) {
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canSubmit = title.trim().length > 0 && fileName !== null;

  function reset() {
    setTitle('');
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <ActionForm
      action={action}
      onSuccess={reset}
      className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3"
    >
      <input type="hidden" name="moduleId" value={moduleId} />
      <input type="hidden" name="courseId" value={courseId} />
      <input
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="titolo materiale"
        required
        maxLength={200}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
        <Paperclip className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        <span className="max-w-[14rem] truncate">{fileName ?? 'Scegli file'}</span>
        <input
          ref={fileInputRef}
          name="file"
          type="file"
          required
          accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4,.mov"
          className="sr-only"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
        />
      </label>
      <Button type="submit" disabled={!canSubmit}>
        Carica
      </Button>
    </ActionForm>
  );
}
