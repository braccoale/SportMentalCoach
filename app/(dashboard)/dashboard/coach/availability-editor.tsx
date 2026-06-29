import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { WEEKDAY_LABELS, formatMinutesOfDay } from '@/lib/core/format';
import type { AvailabilitySlot } from '@/lib/core/availability';
import {
  addAvailabilityAction,
  deleteAvailabilityAction,
} from './availability-actions';

const fieldCls = 'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';

// Monday-first ordering for display and the picker.
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function AvailabilityEditor({ slots }: { slots: AvailabilitySlot[] }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h2 className="text-lg font-medium text-gray-900">
        Disponibilità settimanale
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Definisci le fasce orarie ricorrenti in cui sei disponibile.
      </p>

      {slots.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">
          Nessuna fascia. Aggiungine una qui sotto.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {WEEKDAY_ORDER.flatMap((wd) =>
            slots
              .filter((s) => s.weekday === wd)
              .map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm"
                >
                  <span className="text-gray-700">
                    <span className="font-medium">{WEEKDAY_LABELS[s.weekday]}</span>{' '}
                    {formatMinutesOfDay(s.startMinute)}–
                    {formatMinutesOfDay(s.endMinute)}
                  </span>
                  <ActionForm action={deleteAvailabilityAction}>
                    <input type="hidden" name="slotId" value={s.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                    >
                      Rimuovi
                    </Button>
                  </ActionForm>
                </li>
              ))
          )}
        </ul>
      )}

      <ActionForm
        action={addAvailabilityAction}
        className="mt-4 flex flex-wrap items-end gap-2 border-t border-gray-100 pt-4"
      >
        <div className="flex flex-col">
          <label htmlFor="weekday" className="text-xs font-medium text-gray-600">
            Giorno
          </label>
          <select id="weekday" name="weekday" defaultValue="1" className={fieldCls}>
            {WEEKDAY_ORDER.map((wd) => (
              <option key={wd} value={wd}>
                {WEEKDAY_LABELS[wd]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label htmlFor="start" className="text-xs font-medium text-gray-600">
            Inizio
          </label>
          <input id="start" name="start" type="time" required className={fieldCls} />
        </div>
        <div className="flex flex-col">
          <label htmlFor="end" className="text-xs font-medium text-gray-600">
            Fine
          </label>
          <input id="end" name="end" type="time" required className={fieldCls} />
        </div>
        <Button type="submit" className="rounded-md">
          Aggiungi fascia
        </Button>
      </ActionForm>
    </div>
  );
}
