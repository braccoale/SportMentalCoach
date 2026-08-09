import Link from 'next/link';
import { requireRole } from '@/lib/core/auth';
import {
  FEATURE_CODES,
  getFeatureAdminUsers,
} from '@/lib/core/features';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { updateAiNotesEntitlementAction } from './actions';
import { AiPipelineHealthPanel } from '@/components/admin/ai-pipeline-health';
import { getAiPipelineHealth } from '@/lib/core/ai-session-notes/queue-health';
import { HouseGuidelinesEditor } from '@/components/admin/house-guidelines-editor';
import { loadActiveHouseGuidelines } from '@/lib/core/ai-session-notes/house-guidelines';

export const dynamic = 'force-dynamic';
// Il worker gira dentro questa rotta quando l'admin lo lancia a mano: serve
// tutto il tempo che il piano concede, non i pochi secondi di default.
export const maxDuration = 60;

function statusLabel(status: string | null) {
  switch (status) {
    case 'enabled':
      return 'Abilitato';
    case 'trial':
      return 'Trial';
    case 'disabled':
      return 'Revocato';
    case 'expired':
      return 'Scaduto';
    case 'suspended':
      return 'Sospeso';
    default:
      return 'Non abilitato';
  }
}

export default async function AiNotesAdminPage() {
  const admin = await requireRole('admin');
  const [users, health, guidelines] = await Promise.all([
    getFeatureAdminUsers(admin.id, FEATURE_CODES.AI_SESSION_NOTES),
    getAiPipelineHealth(),
    loadActiveHouseGuidelines(),
  ]);

  return (
    <section className="p-6">
      <Link
        href="/dashboard/admin"
        className="text-sm text-gray-500 hover:text-gray-900"
      >
        ← Torna alla dashboard admin
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">
              Appunti AI
            </h1>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
              BETA
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Abilita la richiesta di consenso per utenti selezionati. In questa
            fase non viene acquisito o trascritto alcun audio.
          </p>
        </div>
      </div>

      <AiPipelineHealthPanel health={health} />

      <HouseGuidelinesEditor
        body={guidelines?.body ?? ''}
        version={guidelines?.version ?? null}
        updatedAt={guidelines?.updatedAt ?? null}
      />

      <h2 className="mt-8 text-lg font-semibold text-gray-900">
        Utenti abilitati
      </h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Utente</th>
              <th className="px-4 py-3">Ruoli</th>
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3">Utilizzi</th>
              <th className="px-4 py-3 text-right">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.userId}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">
                    {user.displayName}
                  </p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {user.roles.join(', ') || '—'}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      user.status === 'enabled' || user.status === 'trial'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {statusLabel(user.status)}
                  </span>
                  {user.expiresAt && (
                    <p className="mt-1 text-xs text-gray-500">
                      fino al {user.expiresAt.toLocaleDateString('it-IT')}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {user.usageCount}
                  {user.usageLimit !== null ? ` / ${user.usageLimit}` : ''}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <ActionForm action={updateAiNotesEntitlementAction}>
                      <input type="hidden" name="userId" value={user.userId} />
                      <input type="hidden" name="operation" value="enable" />
                      <Button type="submit" size="sm" className="rounded-full">
                        Abilita
                      </Button>
                    </ActionForm>
                    <ActionForm action={updateAiNotesEntitlementAction}>
                      <input type="hidden" name="userId" value={user.userId} />
                      <input type="hidden" name="operation" value="trial" />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="rounded-full"
                      >
                        Trial 30 gg
                      </Button>
                    </ActionForm>
                    <ActionForm
                      action={updateAiNotesEntitlementAction}
                      confirmMessage="Revocare Appunti AI per questo utente?"
                    >
                      <input type="hidden" name="userId" value={user.userId} />
                      <input type="hidden" name="operation" value="revoke" />
                      <Button
                        type="submit"
                        size="sm"
                        variant="outline"
                        className="rounded-full text-red-600"
                      >
                        Revoca
                      </Button>
                    </ActionForm>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
