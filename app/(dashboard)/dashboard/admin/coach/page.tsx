import Link from 'next/link';
import { requireRole } from '@/lib/core/auth';
import {
  getProviderProfilesForReview,
  getAdminBookingsOverview,
} from '@/lib/core/admin';
import { getAllSports } from '@/lib/core/taxonomies';
import { getLiveCoachProviderIds } from '@/lib/core/admin/live-sessions';
import { CollapsiblePanel } from '@/components/collapsible-panel';
import { ProviderRow } from '@/components/admin/provider-row';
import { SectionHeader } from '@/components/admin/control-room';

export const dynamic = 'force-dynamic';

/**
 * L'area Coach: la coda di revisione e tutti i profili, per stato.
 *
 * È il contenuto della vecchia pagina unica, spostato dove si cerca. Non è
 * stato tolto niente: approvazione, rifiuto, le due verifiche a interruttore
 * e l'elenco degli atleti seguiti da ciascun coach sono tutti qui.
 *
 * `requireRole('admin')` anche qui e non solo nel guscio: un layout non è un
 * cancello, e questa pagina legge email e stato di revisione di persone vere.
 *
 * `?stato=` filtra senza nascondere: il blocco richiesto arriva aperto, gli
 * altri chiusi. Nascondere gli altri renderebbe il collegamento dalla
 * panoramica una pagina diversa a seconda di come ci si è arrivati.
 */
export default async function AdminCoachPage({
  searchParams,
}: {
  searchParams: Promise<{ stato?: string }>;
}) {
  await requireRole('admin');
  const { stato } = await searchParams;

  const [all, sportsList, liveProviderIds, bookingsOverview] = await Promise.all(
    [
      getProviderProfilesForReview(),
      getAllSports(),
      getLiveCoachProviderIds(),
      getAdminBookingsOverview(),
    ]
  );

  const { rosters } = bookingsOverview;
  const queue = all.filter((p) => p.status === 'pending');
  const drafts = all.filter((p) => p.status === 'draft');
  const approved = all.filter((p) => p.status === 'approved');
  const rejected = all.filter((p) => p.status === 'rejected');

  const openFor = (key: string, fallback: boolean) =>
    stato ? stato === key : fallback;

  const rows = (list: typeof all) =>
    list.map((p) => (
      <ProviderRow
        key={p.id}
        p={p}
        sportsList={sportsList}
        roster={rosters.get(p.id)}
        isLive={liveProviderIds.has(p.id)}
      />
    ));

  return (
    <section className="p-4 lg:p-0">
      <SectionHeader
        title="Coach"
        subtitle={
          <>
            Revisione dei profili. Solo i profili approvati appaiono su{' '}
            <Link href="/coaches" className="text-red-600 hover:underline">
              /coaches
            </Link>
            .
          </>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="In revisione" value={queue.length} tone={queue.length > 0} />
        <Tile label="Approvati" value={approved.length} />
        <Tile label="Profilo in bozza" value={drafts.length} />
        <Tile label="Rifiutati" value={rejected.length} />
      </div>

      <CollapsiblePanel
        title="Coda di revisione"
        count={queue.length}
        defaultOpen={openFor('pending', queue.length > 0)}
        persistKey="admin-queue"
      >
        {queue.length === 0 ? (
          <p className="text-gray-500">Nessun profilo in attesa di revisione.</p>
        ) : (
          <ul className="flex flex-col gap-3">{rows(queue)}</ul>
        )}
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Coach registrati · profilo non inviato"
        count={drafts.length}
        defaultOpen={openFor('draft', drafts.length > 0)}
        persistKey="admin-drafts"
      >
        {drafts.length === 0 ? (
          <p className="text-gray-500">
            Nessun coach con il profilo ancora in bozza.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500">
              Questi coach si sono registrati, ma non hanno ancora inviato il
              profilo per la revisione.
            </p>
            <ul className="mt-3 flex flex-col gap-3">{rows(drafts)}</ul>
          </>
        )}
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Profili approvati"
        count={approved.length}
        defaultOpen={openFor('approved', approved.length > 0)}
        persistKey="admin-approved"
      >
        {approved.length === 0 ? (
          <p className="text-gray-500">Nessun profilo approvato.</p>
        ) : (
          <ul className="flex flex-col gap-3">{rows(approved)}</ul>
        )}
      </CollapsiblePanel>

      {/* I rifiutati non hanno un blocco quando non ce ne sono: un elenco a
          zero che non serve a nessuno è rumore, non informazione. */}
      {rejected.length > 0 && (
        <CollapsiblePanel
          title="Profili rifiutati"
          count={rejected.length}
          defaultOpen={openFor('rejected', false)}
          persistKey="admin-rejected"
        >
          <ul className="flex flex-col gap-3">{rows(rejected)}</ul>
        </CollapsiblePanel>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  tone = false,
}: {
  label: string;
  value: number;
  tone?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 ${
        tone ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-gray-950">
        {value}
      </p>
    </div>
  );
}
