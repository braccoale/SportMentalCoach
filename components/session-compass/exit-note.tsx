'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { VoiceNoteButton } from './voice-note-button';

/**
 * L'osservazione a caldo, chiesta uscendo dalla videochiamata.
 *
 * È il momento giusto per due ragioni. Il coach ha ancora tutto in mente e
 * sta per dimenticarlo. E il microfono è finalmente libero: durante la call
 * è di LiveKit, e contenderglielo romperebbe entrambe le cose.
 *
 * La sessione AI nasce durante la chiamata, quindi il suo identificativo non
 * esiste al momento in cui la pagina viene resa: si recupera qui, e se non
 * c'è il blocco non compare affatto.
 */
export function ExitNote({ bookingId }: { bookingId: number }) {
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/appointments/${bookingId}/ai-session-notes`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { session?: { id?: unknown } } | null) => {
        const id = payload?.session?.id;
        if (!cancelled && typeof id === 'number') setSessionId(id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (sessionId === null) return null;

  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50/70 p-4 text-left">
      <p className="text-sm font-bold text-gray-950">
        Vuoi lasciare una nota su questa sessione?
      </p>
      <p className="mt-1 text-xs leading-5 text-gray-600">
        Resta privata: l’atleta non la vede. La ritrovi nel riepilogo.
      </p>

      <textarea
        className="mt-3 w-full resize-y rounded-lg border border-gray-200 bg-white p-2.5 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        rows={3}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          setSaved(false);
        }}
        placeholder="Com’è andata, cosa riprendere la prossima volta…"
        aria-label="Nota sulla sessione"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving || !note.trim()}
          onClick={() => {
            setSaving(true);
            void fetch(`/api/ai-session-notes/${sessionId}/closing-note`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ note }),
            })
              .then((response) => setSaved(response.ok))
              .catch(() => setSaved(false))
              .finally(() => setSaving(false));
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
        >
          {saved ? <Check className="size-4" aria-hidden="true" /> : null}
          {saved ? 'Salvata' : saving ? 'Salvo…' : 'Salva nota'}
        </button>

        {/* Il microfono ora è libero: la call è chiusa. */}
        <VoiceNoteButton sessionId={sessionId} />
      </div>
    </div>
  );
}
