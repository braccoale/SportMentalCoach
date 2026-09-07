import { requireRole } from '@/lib/core/auth';
import { FEATURE_CODES } from '@/lib/core/features';
import { listOrganizationsForPackage, listPackages } from '@/lib/core/features/packages';
import { listOrganizationMembers, searchOrganizations } from '@/lib/core/organizations';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import {
  addOrganizationMemberAction,
  assignPackageToOrganizationAction,
  createPackageAction,
  revokeOrganizationPackageAction,
  updatePackageFeaturesAction,
} from './actions';

export const dynamic = 'force-dynamic';

const FEATURE_LABEL: Record<string, string> = {
  AI_SESSION_NOTES: 'Appunti AI',
};

export default async function AdminPackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ orgQuery?: string }>;
}) {
  const admin = await requireRole('admin');
  const { orgQuery = '' } = await searchParams;

  const [packageList, organizationResults] = await Promise.all([
    listPackages(admin.id),
    searchOrganizations(admin.id, orgQuery),
  ]);

  const packagesWithOrganizations = await Promise.all(
    packageList.map(async (pkg) => ({
      ...pkg,
      organizations: await listOrganizationsForPackage(admin.id, pkg.id),
    }))
  );

  const organizationsWithMembers = await Promise.all(
    organizationResults.map(async (org) => ({
      ...org,
      members: await listOrganizationMembers(admin.id, org.id),
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

      <div className="space-y-6">
        {packagesWithOrganizations.map((pkg) => (
          <div key={pkg.id} className="rounded-xl border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {pkg.name} <span className="text-sm font-normal text-gray-400">({pkg.key})</span>
            </h2>

            <ActionForm action={updatePackageFeaturesAction} className="mt-3 flex flex-wrap items-center gap-4">
              <input type="hidden" name="packageId" value={pkg.id} />
              {Object.values(FEATURE_CODES).map((code) => (
                <label key={code} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    name={`feature_${code}`}
                    defaultChecked={pkg.featureCodes.includes(code)}
                    className="size-4 rounded border-gray-300"
                  />
                  {FEATURE_LABEL[code] ?? code}
                </label>
              ))}
              <Button type="submit" variant="outline">Salva feature</Button>
            </ActionForm>

            <h3 className="mt-4 text-sm font-semibold text-gray-700">Organizzazioni</h3>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              {pkg.organizations.length === 0 ? (
                <li className="text-gray-400">Nessuna organizzazione ha ancora questo pacchetto.</li>
              ) : (
                pkg.organizations.map((org) => (
                  <li key={org.organizationId} className="flex items-center justify-between gap-3">
                    <span>
                      {org.organizationName} — {org.status}
                      {org.expiresAt ? ` (scade ${org.expiresAt.toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })})` : ''}
                    </span>
                    {org.status !== 'expired' && (
                      <ActionForm
                        action={revokeOrganizationPackageAction}
                        confirmTitle="Revocare il pacchetto?"
                        confirmMessage={`${org.organizationName} perderà l'accesso alle feature di questo pacchetto per tutti i suoi membri.`}
                        confirmActionLabel="Revoca"
                      >
                        <input type="hidden" name="organizationId" value={org.organizationId} />
                        <Button type="submit" variant="outline" className="h-8 px-3 text-xs">
                          Revoca
                        </Button>
                      </ActionForm>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        ))}
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
          {organizationsWithMembers.map((org) => (
            <li key={org.id} className="rounded-lg border border-gray-100 p-3">
              <p className="font-medium text-gray-900">
                {org.name} <span className="text-xs font-normal text-gray-400">({org.memberCount} membri)</span>
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {org.members.map((m) => m.displayName).join(', ') || 'nessun membro'}
              </p>

              <ActionForm
                action={assignPackageToOrganizationAction}
                className="mt-2 flex flex-wrap items-center gap-2"
                confirmTitle="Assegnare il pacchetto?"
                confirmMessage={`Se ${org.name} ha già un pacchetto attivo, verrà sostituito.`}
                confirmActionLabel="Assegna"
              >
                <input type="hidden" name="organizationId" value={org.id} />
                <select name="packageId" required className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                  {packageList.map((pkg) => (
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
