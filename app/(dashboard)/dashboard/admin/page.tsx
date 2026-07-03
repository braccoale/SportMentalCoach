import Link from 'next/link';
import { ShieldCheck, Award } from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import { getProviderProfilesForReview, type ProviderReviewItem } from '@/lib/core/admin';
import { getVerticalConfig, findTaxonomyItem, t } from '@/lib/core/config';
import { getAllSports } from '@/lib/core/taxonomies';
import type { TaxonomyItem } from '@/lib/core/config/types';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { CoachAvatar } from '@/components/coach-visuals';
import {
  approveProviderAction,
  rejectProviderAction,
  toggleIdentityVerifiedAction,
  toggleCertificationsVerifiedAction,
} from './actions';

function verifyChip(active: boolean) {
  return `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
    active
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
      : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
  }`;
}

function statusBadge(status: string) {
  const config = getVerticalConfig();
  const label = t(`provider.status.${status}`, config);
  const cls =
    status === 'approved'
      ? 'bg-green-50 text-green-700'
      : status === 'rejected'
        ? 'bg-red-50 text-red-700'
        : status === 'pending'
          ? 'bg-gray-100 text-gray-700'
          : 'bg-gray-100 text-gray-600';
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function ProviderRow({ p, sportsList }: { p: ProviderReviewItem; sportsList: TaxonomyItem[] }) {
  const config = getVerticalConfig();
  const sportLabels = (p.categories ?? [])
    .map((k) => findTaxonomyItem(sportsList, k)?.label ?? k)
    .join(', ');

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <CoachAvatar name={p.displayName} src={p.avatarUrl} className="size-12" />
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900">
              {p.displayName ?? p.email}
            </p>
            {statusBadge(p.status)}
          </div>
          <p className="text-sm text-gray-500">{p.email}</p>
          {p.headline && (
            <p className="text-sm text-gray-600">{p.headline}</p>
          )}
          {sportLabels && (
            <p className="mt-1 text-xs text-gray-400">{sportLabels}</p>
          )}
          {p.status === 'approved' && p.slug && (
            <Link
              href={`/coaches/${p.slug}`}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              Vedi profilo pubblico →
            </Link>
          )}

          {/* Admin-managed verification (click to toggle) */}
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={toggleIdentityVerifiedAction}>
              <input type="hidden" name="providerId" value={p.id} />
              <input
                type="hidden"
                name="value"
                value={p.identityVerified ? '0' : '1'}
              />
              <button type="submit" className={verifyChip(p.identityVerified)}>
                <ShieldCheck className="h-3.5 w-3.5" /> Identità{' '}
                {p.identityVerified ? '✓' : '—'}
              </button>
            </form>
            <form action={toggleCertificationsVerifiedAction}>
              <input type="hidden" name="providerId" value={p.id} />
              <input
                type="hidden"
                name="value"
                value={p.certificationsVerified ? '0' : '1'}
              />
              <button
                type="submit"
                className={verifyChip(p.certificationsVerified)}
              >
                <Award className="h-3.5 w-3.5" /> Certificazioni{' '}
                {p.certificationsVerified ? '✓' : '—'}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <ActionForm action={approveProviderAction}>
          <input type="hidden" name="providerId" value={p.id} />
          <Button
            type="submit"
            className="rounded-full"
            disabled={p.status === 'approved'}
          >
            Approva
          </Button>
        </ActionForm>
        <ActionForm action={rejectProviderAction}>
          <input type="hidden" name="providerId" value={p.id} />
          <Button
            type="submit"
            variant="outline"
            className="rounded-full"
            disabled={p.status === 'rejected'}
          >
            Rifiuta
          </Button>
        </ActionForm>
      </div>
    </li>
  );
}

export default async function AdminDashboardPage() {
  await requireRole('admin');
  const [all, sportsList] = await Promise.all([
    getProviderProfilesForReview(),
    getAllSports(),
  ]);
  const queue = all.filter((p) => p.status === 'draft' || p.status === 'pending');
  const reviewed = all.filter(
    (p) => p.status === 'approved' || p.status === 'rejected'
  );

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Admin dashboard</h1>
      <p className="mt-1 text-sm text-gray-500">
        Revisione dei profili coach. Solo i profili approvati appaiono su{' '}
        <Link href="/coaches" className="text-red-600 hover:underline">
          /coaches
        </Link>
        .
      </p>

      <h2 className="mt-6 text-lg font-medium text-gray-900">
        Coda di revisione ({queue.length})
      </h2>
      {queue.length === 0 ? (
        <p className="mt-2 text-gray-500">Nessun profilo in attesa di revisione.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {queue.map((p) => (
            <ProviderRow key={p.id} p={p} sportsList={sportsList} />
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-lg font-medium text-gray-900">
        Profili revisionati ({reviewed.length})
      </h2>
      {reviewed.length === 0 ? (
        <p className="mt-2 text-gray-500">Nessun profilo revisionato.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {reviewed.map((p) => (
            <ProviderRow key={p.id} p={p} sportsList={sportsList} />
          ))}
        </ul>
      )}
    </section>
  );
}
