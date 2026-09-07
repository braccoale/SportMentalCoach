import { requireRole } from '@/lib/core/auth';
import { getFeatureMatrix } from '@/lib/core/features/catalog';
import {
  getCurrentOrganizationPackage,
} from '@/lib/core/features/packages';
import { listOrganizationMembers, searchOrganizations } from '@/lib/core/organizations';
import { matrixCellFieldName } from '@/lib/core/features/matrix-form';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  addOrganizationMemberAction,
  assignPackageToOrganizationAction,
  createPackageAction,
  revokeOrganizationPackageAction,
  updateFeatureMatrixAction,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ orgQuery?: string }>;
}) {
  const admin = await requireRole('admin');
  const { orgQuery = '' } = await searchParams;

  const [matrix, organizationResults] = await Promise.all([
    getFeatureMatrix(admin.id),
    searchOrganizations(admin.id, orgQuery),
  ]);

  const organizationsWithDetail = await Promise.all(
    organizationResults.map(async (org) => ({
      ...org,
      members: await listOrganizationMembers(admin.id, org.id),
      currentPackage: await getCurrentOrganizationPackage(admin.id, org.id),
    }))
  );

  return (
    <section className="space-y-8 p-4 lg:p-0">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Pacchetti</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          Ogni pacchetto porta con sé un insieme di feature. Assegnarlo a
          un&apos;organizzazione abilita quelle feature per tutti i suoi
          membri.
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
          <ActionForm action={updateFeatureMatrixAction} className="mt-4">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-700">
                      Funzionalità
                    </th>
                    {matrix.packages.map((pkg) => (
                      <th
                        key={pkg.id}
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
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{feature.label}</div>
                        {feature.description && (
                          <div className="text-xs text-gray-500">{feature.description}</div>
                        )}
                      </td>
                      {matrix.packages.map((pkg) => {
                        const fieldName = matrixCellFieldName(pkg.id, feature.code);
                        const currentValue = pkg.cells[feature.code];
                        const isIncluded = feature.code in pkg.cells;
                        return (
                          <td key={pkg.id} className="px-3 py-2 text-center">
                            {feature.type === 'boolean' ? (
                              <input
                                type="checkbox"
                                name={fieldName}
                                defaultChecked={isIncluded}
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
        <h2 className="text-lg font-semibold text-gray-900">Assegna a un&apos;organizzazione</h2>
        <form className="mt-3 flex flex-wrap gap-3" method="get">
          <input
            name="orgQuery"
            defaultValue={orgQuery}
            placeholder="cerca organizzazione per nome"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <Button type="submit" variant="outline">Cerca</Button>
        </form>

        <ul className="mt-4 space-y-4">
          {organizationsWithDetail.map((org) => (
            <li key={org.id} className="rounded-lg border border-gray-100 p-3">
              <p className="font-medium text-gray-900">
                {org.name} <span className="text-xs font-normal text-gray-400">({org.memberCount} membri)</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {org.members.map((m) => m.displayName).join(', ') || 'nessun membro'}
              </p>

              {org.currentPackage ? (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <span>
                    Pacchetto attuale: <strong>{org.currentPackage.packageName}</strong> — {org.currentPackage.status}
                    {org.currentPackage.expiresAt
                      ? ` (scade ${org.currentPackage.expiresAt.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })})`
                      : ''}
                  </span>
                  <ActionForm
                    action={revokeOrganizationPackageAction}
                    confirmTitle="Revocare il pacchetto?"
                    confirmMessage={`${org.name} perderà l'accesso alle feature di questo pacchetto per tutti i suoi membri.`}
                    confirmActionLabel="Revoca"
                  >
                    <input type="hidden" name="organizationId" value={org.id} />
                    <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                      Revoca
                    </Button>
                  </ActionForm>
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-400">Nessun pacchetto attivo.</p>
              )}

              <ActionForm
                action={assignPackageToOrganizationAction}
                className="mt-2 flex flex-wrap items-center gap-2"
                confirmTitle="Assegnare il pacchetto?"
                confirmMessage={`Se ${org.name} ha già un pacchetto attivo, verrà sostituito.`}
                confirmActionLabel="Assegna"
              >
                <input type="hidden" name="organizationId" value={org.id} />
                <select name="packageId" required className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                  {matrix.packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>{pkg.name}</option>
                  ))}
                </select>
                <input type="date" name="expiresAt" className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                <Button type="submit" className="h-8 px-3 text-xs">Assegna</Button>
              </ActionForm>

              <ActionForm action={addOrganizationMemberAction} className="mt-2 flex flex-wrap items-center gap-2">
                <input type="hidden" name="organizationId" value={org.id} />
                <input
                  name="email"
                  type="email"
                  placeholder="email del coach da aggiungere"
                  required
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
                <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                  Aggiungi membro
                </Button>
              </ActionForm>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
