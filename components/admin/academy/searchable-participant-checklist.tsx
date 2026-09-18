'use client';

import { useId, useRef, useState } from 'react';
import { X } from 'lucide-react';

type Participant = { assignmentId: number; displayName: string };

const MAX_DROPDOWN_ROWS = 6;

/**
 * Multi-select dei partecipanti da invitare a una sessione: cerchi per nome,
 * scegli dal menu, il partecipante diventa una "pillola" rimovibile. I
 * selezionati restano sempre visibili come lista compatta, separata dalla
 * ricerca — a differenza di una checklist piatta, non serve scorrere o
 * ricordare chi hai già spuntato tra centinaia di righe. Il submit resta
 * identico a prima: un input nascosto per id selezionato, stesso `name`
 * (`participantAssignmentIds`) che il server action già legge come lista.
 */
export function SearchableParticipantChecklist({
  name,
  participants,
}: {
  name: string;
  participants: Participant[];
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const inputId = useId();
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = participants.filter((p) => selectedIds.includes(p.assignmentId));
  const q = query.trim().toLowerCase();
  const candidates = participants
    .filter((p) => !selectedIds.includes(p.assignmentId))
    .filter((p) => !q || p.displayName.toLowerCase().includes(q));

  function addParticipant(assignmentId: number) {
    setSelectedIds((ids) => [...ids, assignmentId]);
    setQuery('');
  }

  function removeParticipant(assignmentId: number) {
    setSelectedIds((ids) => ids.filter((id) => id !== assignmentId));
  }

  function scheduleClose() {
    closeTimeout.current = setTimeout(() => setOpen(false), 120);
  }

  function cancelClose() {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
  }

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {selected.map((participant) => (
            <li
              key={participant.assignmentId}
              className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 py-1 pl-3 pr-1.5 text-sm text-indigo-800"
            >
              <input type="hidden" name={name} value={participant.assignmentId} />
              {participant.displayName}
              <button
                type="button"
                onClick={() => removeParticipant(participant.assignmentId)}
                aria-label={`Rimuovi ${participant.displayName}`}
                className="flex h-5 w-5 items-center justify-center rounded-full text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative max-w-sm">
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={scheduleClose}
          placeholder={
            participants.length === 0 ? 'Nessun coach assegnato al corso' : 'Cerca e aggiungi un partecipante…'
          }
          disabled={participants.length === 0}
          role="combobox"
          aria-expanded={open}
          className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50 disabled:text-gray-400"
        />

        {open && candidates.length > 0 && (
          <ul
            onMouseDown={cancelClose}
            className="absolute z-10 mt-1 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg"
            style={{ maxHeight: `${MAX_DROPDOWN_ROWS * 2.25}rem` }}
          >
            {candidates.map((participant) => (
              <li key={participant.assignmentId}>
                <button
                  type="button"
                  onClick={() => addParticipant(participant.assignmentId)}
                  className="block w-full px-3 py-1.5 text-left hover:bg-indigo-50"
                >
                  {participant.displayName}
                </button>
              </li>
            ))}
          </ul>
        )}

        {open && q && candidates.length === 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-400 shadow-lg">
            Nessun partecipante corrisponde alla ricerca.
          </div>
        )}
      </div>
    </div>
  );
}
