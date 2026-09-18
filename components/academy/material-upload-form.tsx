'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import type { ActionState } from '@/lib/auth/middleware';

type ActionFn = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Il form materiali — un solo pulsante visibile, non due. Prima erano
 * "Scegli file" e "Carica" separati: due gesti per un'azione sola, e
 * cliccare "Carica" senza aver scelto niente faceva comparire il popup
 * nativo del browser sopra il campo file, non vicino al bottone appena
 * premuto — leggibile come "non succede niente".
 *
 * Ora "Carica file" è l'unica azione: resta disattivato finché il titolo
 * non è scritto (niente selettore file finché manca il nome del
 * materiale), poi apre subito il selettore del sistema, e appena un file
 * è scelto il form si invia da solo — lo stesso submit che prima serviva
 * un secondo click. Il bottone "Carica" reale resta nel form ma
 * invisibile: submit ancora raggiungibile da tastiera/lettore di
 * schermo, mai un secondo gesto per chi vede lo schermo.
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
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pendingSubmit) return;
    if (!title.trim() || !fileName) return;
    submitRef.current?.click();
    setPendingSubmit(false);
  }, [pendingSubmit, title, fileName]);

  function handleFileChosen(file: File | undefined) {
    setFileName(file?.name ?? null);
    if (file) setPendingSubmit(true);
  }

  const titleFilled = title.trim().length > 0;

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
        ref={titleInputRef}
        name="title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="titolo materiale"
        required
        maxLength={200}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <label
        className={
          titleFilled
            ? 'inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'
            : 'inline-flex cursor-not-allowed items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-400'
        }
      >
        <Paperclip className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="max-w-[14rem] truncate">{fileName ?? 'Carica file'}</span>
        <input
          ref={fileInputRef}
          name="file"
          type="file"
          required
          disabled={!titleFilled}
          accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.mp4,.mov"
          className="sr-only"
          onChange={(event) => handleFileChosen(event.target.files?.[0])}
        />
      </label>
      {!titleFilled && (
        <span className="text-xs text-gray-400">Scrivi prima un titolo per poter caricare il file.</span>
      )}
      <button ref={submitRef} type="submit" className="sr-only">
        Carica
      </button>
    </ActionForm>
  );
}
