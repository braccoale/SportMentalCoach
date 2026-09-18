'use client';

import { useMemo, useState } from 'react';

const MONTHS = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseValue(value: string | undefined): { day: string; month: string; year: string } {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { day: '', month: '', year: '' };
  return { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) };
}

/**
 * Tre `<select>` (giorno/mese/anno) al posto del calendario nativo del
 * browser per la data di nascita. Il calendario nativo parte dal mese
 * corrente: per un anno lontano come il 1960 tocca scorrere indietro
 * decennio per decennio con la rotellina. Un `<select>` per l'anno si
 * raggiunge scrivendo le cifre mentre ha il focus — comportamento nativo
 * della tastiera su ogni browser, nessun codice in più per averlo.
 *
 * Sempre non controllato verso il form nativo (un input nascosto con lo
 * stesso `name` che un `<input type="date">` avrebbe avuto, stesso
 * formato `YYYY-MM-DD`), e in più `onChange`/`value` per chi vuole
 * pilotarlo da fuori (es. per calcolare l'età mentre si scrive).
 */
export function BirthDatePicker({
  id,
  name = 'birthDate',
  value,
  onChange,
  required,
  minYear,
  maxYear,
  className,
}: {
  id?: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  minYear?: number;
  maxYear?: number;
  className?: string;
}) {
  const currentYear = new Date().getFullYear();
  const [internal, setInternal] = useState(() => parseValue(value));
  const parsed = value !== undefined ? parseValue(value) : internal;

  const years = useMemo(() => {
    const from = minYear ?? currentYear - 100;
    const to = maxYear ?? currentYear;
    const list: number[] = [];
    for (let y = to; y >= from; y--) list.push(y);
    return list;
  }, [minYear, maxYear, currentYear]);

  const monthNumber = parsed.month ? Number(parsed.month) : null;
  const maxDay = monthNumber && parsed.year ? daysInMonth(Number(parsed.year), monthNumber) : 31;
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);

  function update(next: { day?: string; month?: string; year?: string }) {
    const merged = { ...parsed, ...next };
    // Un mese più corto del giorno scelto (es. 31 aprile) riporta il giorno all'ultimo valido.
    if (merged.day && merged.month && merged.year) {
      const cappedDay = Math.min(Number(merged.day), daysInMonth(Number(merged.year), Number(merged.month)));
      merged.day = String(cappedDay);
    }
    if (value === undefined) setInternal(merged);
    const complete = merged.day && merged.month && merged.year;
    onChange?.(
      complete
        ? `${merged.year}-${merged.month.padStart(2, '0')}-${merged.day.padStart(2, '0')}`
        : ''
    );
  }

  const combined =
    parsed.day && parsed.month && parsed.year
      ? `${parsed.year}-${parsed.month.padStart(2, '0')}-${parsed.day.padStart(2, '0')}`
      : '';

  const selectClass =
    className ??
    'rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500';

  return (
    <div id={id} className="flex gap-2">
      <input type="hidden" name={name} value={combined} />
      <select
        aria-label="Giorno"
        required={required}
        value={parsed.day}
        onChange={(e) => update({ day: e.target.value })}
        className={`${selectClass} w-20`}
      >
        <option value="" disabled>
          Giorno
        </option>
        {days.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        aria-label="Mese"
        required={required}
        value={parsed.month}
        onChange={(e) => update({ month: e.target.value })}
        className={`${selectClass} flex-1`}
      >
        <option value="" disabled>
          Mese
        </option>
        {MONTHS.map((label, index) => (
          <option key={label} value={index + 1}>
            {label}
          </option>
        ))}
      </select>
      <select
        aria-label="Anno"
        required={required}
        value={parsed.year}
        onChange={(e) => update({ year: e.target.value })}
        className={`${selectClass} w-24`}
      >
        <option value="" disabled>
          Anno
        </option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
