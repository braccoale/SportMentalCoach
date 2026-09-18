'use client';

import { useState } from 'react';

type Participant = { assignmentId: number; displayName: string };

const SEARCH_THRESHOLD = 8;

/**
 * Checkbox dei partecipanti da invitare a una sessione. Sopra una soglia
 * mostra un campo di ricerca che filtra le righe visibili senza smontarle:
 * una checkbox già selezionata resta selezionata anche se il filtro la
 * nasconde, perché è l'elemento stesso a restare nel DOM (solo `hidden`),
 * non una lista di id ricostruita da JS. Sotto la soglia il filtro
 * appesantirebbe solo l'interfaccia di un corso con pochi iscritti.
 */
export function SearchableParticipantChecklist({
  name,
  participants,
}: {
  name: string;
  participants: Participant[];
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (participant: Participant) =>
    !q || participant.displayName.toLowerCase().includes(q);
  const visibleCount = participants.filter(matches).length;

  return (
    <div className="flex flex-col gap-2">
      {participants.length > SEARCH_THRESHOLD && (
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca partecipante…"
          className="w-full max-w-xs rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        />
      )}
      <div className="flex max-h-60 flex-wrap gap-3 overflow-y-auto">
        {participants.map((participant) => (
          <label
            key={participant.assignmentId}
            hidden={!matches(participant)}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm"
          >
            <input
              type="checkbox"
              name={name}
              value={participant.assignmentId}
              className="size-4 rounded border-gray-300"
            />
            {participant.displayName}
          </label>
        ))}
      </div>
      {q && visibleCount === 0 && (
        <p className="text-xs text-gray-400">Nessun partecipante corrisponde alla ricerca.</p>
      )}
    </div>
  );
}
