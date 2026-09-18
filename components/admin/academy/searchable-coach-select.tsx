'use client';

import { useId, useState } from 'react';

type Coach = { userId: number; displayName: string; email: string };

/**
 * Un `<select>` nativo (submit e a11y invariati) con un campo di ricerca
 * sopra che filtra le opzioni per nome o email. Con `size` maggiore di 1 il
 * browser lo rende come lista aperta, non come tendina chiusa: le opzioni
 * nascoste dal filtro restano nel form (nessuna selezione persa), semplicemente
 * non occupano una riga. Serve ovunque si scelga un coach tra tanti — oggi
 * poche decine, domani centinaia — senza scorrere una tendina piatta.
 */
export function SearchableCoachSelect({
  name,
  coaches,
  required,
  defaultValue,
  className,
}: {
  name: string;
  coaches: Coach[];
  required?: boolean;
  defaultValue?: number;
  className?: string;
}) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (coach: Coach) =>
    !q || coach.displayName.toLowerCase().includes(q) || coach.email.toLowerCase().includes(q);
  const visibleCount = coaches.filter(matches).length;

  return (
    <div className="flex flex-col gap-1.5">
      <input
        id={inputId}
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Cerca per nome o email…"
        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
      />
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        size={Math.min(6, Math.max(3, coaches.length))}
        className={className ?? 'w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm'}
      >
        {coaches.map((coach) => (
          <option key={coach.userId} value={coach.userId} hidden={!matches(coach)}>
            {coach.displayName} ({coach.email})
          </option>
        ))}
      </select>
      {q && visibleCount === 0 && (
        <p className="text-xs text-gray-400">Nessun coach corrisponde alla ricerca.</p>
      )}
    </div>
  );
}
