import { requireRole } from '@/lib/core/auth';
import { listSystemConfig } from '@/lib/core/system-config';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { updateSystemConfigAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function SystemConfigAdminPage() {
  const admin = await requireRole('admin');
  const rows = await listSystemConfig(admin.id);

  return (
    <section className="space-y-6 p-4 lg:p-0">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">
          Configurazione di sistema
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Costanti di business modificabili senza un deploy. Una nuova
          variabile la aggiunge uno sviluppatore con una migrazione — qui si
          modificano solo i valori esistenti. Un cambio può richiedere fino a
          60 secondi per essere effettivo ovunque.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Nessuna variabile configurata.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Chiave</th>
                <th className="px-4 py-3">Etichetta</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Valore</th>
                <th className="px-4 py-3 text-right">Aggiornato il</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {row.key}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{row.label}</p>
                    {row.description && (
                      <p className="text-xs text-gray-500">{row.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.category}</td>
                  <td className="px-4 py-3">
                    <ActionForm
                      action={updateSystemConfigAction}
                      className="flex items-center gap-2"
                      confirmTitle="Salvare il nuovo valore?"
                      confirmMessage={`Cambia "${row.label}" per tutti, entro 60 secondi. Non è reversibile con un clic.`}
                      confirmActionLabel="Salva"
                    >
                      <input type="hidden" name="key" value={row.key} />
                      <input type="hidden" name="valueType" value={row.valueType} />
                      {row.valueType === 'boolean' ? (
                        <input
                          type="checkbox"
                          name="rawValue"
                          value="true"
                          defaultChecked={row.value === true}
                          aria-label={row.label}
                          className="size-4 rounded border-gray-300"
                        />
                      ) : row.valueType === 'number' ? (
                        <input
                          type="number"
                          name="rawValue"
                          defaultValue={typeof row.value === 'number' ? row.value : ''}
                          aria-label={row.label}
                          className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        />
                      ) : (
                        <input
                          type="text"
                          name="rawValue"
                          defaultValue={typeof row.value === 'string' ? row.value : ''}
                          aria-label={row.label}
                          className="w-48 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                        />
                      )}
                      <Button type="submit" size="sm" variant="outline">
                        Salva
                      </Button>
                    </ActionForm>
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-gray-500">
                    {row.updatedDate.toLocaleDateString('it-IT')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
