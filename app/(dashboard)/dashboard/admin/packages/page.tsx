import { requireRole } from '@/lib/core/auth';
import { getFeatureMatrix } from '@/lib/core/features/catalog';
import {
  findUserByEmail,
  getCurrentUserPackage,
  listUsersForPackage,
} from '@/lib/core/features/packages';
import { matrixCellFieldName } from '@/lib/core/features/matrix-form';
import { romeDayStartShifted } from '@/lib/core/admin/period';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  assignPackageToUserAction,
  createPackageAction,
  revokeUserPackageAction,
  updateFeatureMatrixAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ userEmail?: string }>;
}) {
  const admin = await requireRole('admin');
  const { userEmail = '' } = await searchParams;

  const matrix = await getFeatureMatrix(admin.id);

  const foundUser = userEmail.trim()
    ? await findUserByEmail(admin.id, userEmail.trim())
    : null;
  const foundUserPackage = foundUser
    ? await getCurrentUserPackage(admin.id, foundUser.id)
    : null;

  const packagesWithUsers = await Promise.all(
    matrix.packages.map(async (pkg) => ({
      ...pkg,
      users: await listUsersForPackage(admin.id, pkg.id),
    }))
  );

  return (
    <section className="space-y-8 p-4 lg:p-0">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Pacchetti</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Ogni pacchetto porta con sé un insieme di feature. Assegnarlo a
          un utente abilita quelle feature per il suo account.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Nuovo pacchetto</h2>
        <ActionForm action={createPackageAction} className="mt-3 flex flex-wrap gap-3">
          <input
            name="key"
            placeholder="chiave (es. starter)"
            required
            maxLength={60}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            name="name"
            placeholder="nome"
            required
            maxLength={120}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit">Crea</Button>
        </ActionForm>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Matrice funzionalità × pacchetti</h2>
        <p className="mt-1 text-sm text-gray-500">
          Per le funzionalità numeriche, campo vuoto = illimitato.
        </p>

        {matrix.packages.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">
            Nessun pacchetto ancora — crealo qui sopra prima di configurare la matrice.
          </p>
        ) : (
          <ActionForm
            action={updateFeatureMatrixAction}
            className="mt-4"
            confirmTitle="Salvare la matrice?"
            confirmMessage="Sostituisce l'intera configurazione: una casella non spuntata toglie quella funzionalità dal pacchetto per tutti gli utenti che lo hanno. Una cella numerica lasciata vuota vuol dire illimitata, non esclusa."
            confirmActionLabel="Salva"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-700">
                      Funzionalità
                    </th>
                    {matrix.packages.map((pkg) => (
                      <th
                        key={pkg.id}
                        scope="col"
                        className="border-b border-gray-200 px-3 py-2 text-center font-semibold text-gray-700"
                      >
                        {pkg.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.features.map((feature) => (
                    <tr key={feature.code} className="border-b border-gray-100">
                      <th scope="row" className="px-3 py-2 text-left font-normal">
                        <div className="font-medium text-gray-900">{feature.label}</div>
                        {feature.description && (
                          <div className="text-xs text-gray-500">{feature.description}</div>
                        )}
                      </th>
                      {matrix.packages.map((pkg) => {
                        const fieldName = matrixCellFieldName(pkg.id, feature.code);
                        const currentValue = pkg.cells[feature.code];
                        const isIncluded = feature.code in pkg.cells;
                        const cellLabel = `${feature.label} — ${pkg.name}`;
                        return (
                          <td key={pkg.id} className="px-3 py-2 text-center">
                            {feature.type === 'boolean' ? (
                              <input
                                type="checkbox"
                                name={fieldName}
                                defaultChecked={isIncluded}
                                aria-label={cellLabel}
                                className="size-4 rounded border-gray-300"
                              />
                            ) : (
                              <input
                                type="number"
                                name={fieldName}
                                min={0}
                                step={1}
                                placeholder="illimitato"
                                defaultValue={currentValue ?? undefined}
                                aria-label={cellLabel}
                                className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-center text-sm"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="submit" className="mt-4">Salva</Button>
          </ActionForm>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Assegna a un utente</h2>
        <form className="mt-3 flex flex-wrap gap-3" method="get">
          <input
            name="userEmail"
            type="email"
            defaultValue={userEmail}
            placeholder="email dell'utente"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit" variant="outline">Cerca</Button>
        </form>

        {userEmail.trim() && !foundUser && (
          <p className="mt-3 text-sm text-gray-400">Nessun utente con questa email.</p>
        )}

        {foundUser && (
          <div className="mt-4 rounded-lg border border-gray-100 p-3">
            <p className="font-medium text-gray-900">{foundUser.email}</p>

            {foundUserPackage ? (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                <span>
                  Pacchetto attuale: <strong>{foundUserPackage.packageName}</strong> — {foundUserPackage.status}
                  {foundUserPackage.expiresAt
                    ? // La scadenza salvata è l'inizio del giorno *dopo* l'ultimo
                      // giorno valido (assignPackageToUserAction) — un giorno
                      // indietro per mostrare il giorno che l'admin ha davvero
                      // scelto.
                      ` (scade ${romeDayStartShifted(foundUserPackage.expiresAt, -1).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })})`
                    : ''}
                </span>
                <ActionForm
                  action={revokeUserPackageAction}
                  confirmTitle="Revocare il pacchetto?"
                  confirmMessage={`${foundUser.email} perderà l'accesso alle feature di questo pacchetto.`}
                  confirmActionLabel="Revoca"
                >
                  <input type="hidden" name="userId" value={foundUser.id} />
                  <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                    Revoca
                  </Button>
                </ActionForm>
              </div>
            ) : (
              <p className="mt-2 text-xs text-gray-400">Nessun pacchetto attivo.</p>
            )}

            <ActionForm
              action={assignPackageToUserAction}
              className="mt-2 flex flex-wrap items-center gap-2"
              confirmTitle="Assegnare il pacchetto?"
              confirmMessage={`Se ${foundUser.email} ha già un pacchetto attivo, verrà sostituito.`}
              confirmActionLabel="Assegna"
            >
              <input type="hidden" name="userId" value={foundUser.id} />
              <select name="packageId" required className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                {matrix.packages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                ))}
              </select>
              <input type="date" name="expiresAt" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <Button type="submit" className="h-8 px-3 text-xs">Assegna</Button>
            </ActionForm>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-900">Chi ha ogni pacchetto</h2>
        {packagesWithUsers.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Nessun pacchetto ancora.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {packagesWithUsers.map((pkg) => (
              <div key={pkg.id}>
                <h3 className="text-sm font-semibold text-gray-700">{pkg.name}</h3>
                <ul className="mt-1 space-y-1 text-sm text-gray-600">
                  {pkg.users.length === 0 ? (
                    <li className="text-gray-400">Nessun utente ha questo pacchetto.</li>
                  ) : (
                    pkg.users.map((u) => (
                      <li key={u.userId}>
                        {u.displayName} <span className="text-xs text-gray-400">({u.email})</span> — {u.status}
                        {u.expiresAt
                          ? ` (scade ${romeDayStartShifted(u.expiresAt, -1).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })})`
                          : ''}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
