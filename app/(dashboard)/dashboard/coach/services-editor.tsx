import { Button } from '@/components/ui/button';
import type { Service } from '@/lib/db/schema';
import {
  createServiceAction,
  updateServiceAction,
  deleteServiceAction,
} from './service-actions';

const fieldCls =
  'rounded-md border border-gray-300 bg-white px-3 py-2 text-sm';

function eurosFromCents(cents: number | null): string {
  return cents == null ? '' : String(cents / 100);
}

export function ServicesEditor({ services }: { services: Service[] }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h2 className="text-lg font-medium text-gray-900">Servizi</h2>

      {services.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          Nessun servizio. Aggiungine uno qui sotto.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {services.map((s) => (
            <li key={s.id} className="rounded-md border border-gray-100 p-3">
              <form action={updateServiceAction} className="flex flex-col gap-2">
                <input type="hidden" name="serviceId" value={s.id} />
                <input
                  name="title"
                  defaultValue={s.title ?? ''}
                  placeholder="Titolo"
                  className={fieldCls}
                  required
                />
                <div className="flex gap-2">
                  <input
                    name="durationMin"
                    type="number"
                    min={0}
                    defaultValue={s.durationMin ?? ''}
                    placeholder="Durata (min)"
                    className={`${fieldCls} w-32`}
                  />
                  <input
                    name="price"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={eurosFromCents(s.price)}
                    placeholder="Prezzo (€)"
                    className={`${fieldCls} w-32`}
                  />
                </div>
                <textarea
                  name="description"
                  defaultValue={s.description ?? ''}
                  rows={2}
                  placeholder="Descrizione"
                  className={fieldCls}
                />
                <div className="flex gap-2">
                  <Button type="submit" className="rounded-md">
                    Salva
                  </Button>
                  <Button
                    type="submit"
                    formAction={deleteServiceAction}
                    variant="outline"
                    className="rounded-md text-red-600 hover:text-red-700"
                  >
                    Elimina
                  </Button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form
        action={createServiceAction}
        className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4"
      >
        <h3 className="text-sm font-medium text-gray-700">Nuovo servizio</h3>
        <input
          name="title"
          placeholder="Titolo"
          className={fieldCls}
          required
        />
        <div className="flex gap-2">
          <input
            name="durationMin"
            type="number"
            min={0}
            placeholder="Durata (min)"
            className={`${fieldCls} w-32`}
          />
          <input
            name="price"
            type="number"
            min={0}
            step="0.01"
            placeholder="Prezzo (€)"
            className={`${fieldCls} w-32`}
          />
        </div>
        <textarea
          name="description"
          rows={2}
          placeholder="Descrizione"
          className={fieldCls}
        />
        <div>
          <Button type="submit" className="rounded-md">
            Aggiungi servizio
          </Button>
        </div>
      </form>
    </div>
  );
}
