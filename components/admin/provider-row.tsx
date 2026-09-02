import Link from 'next/link';
import {
  Award,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Send,
  ShieldCheck,
} from 'lucide-react';
import type { ProviderReviewItem } from '@/lib/core/admin';
import type { CoachRoster } from '@/lib/core/admin/coach-roster';
import type { TaxonomyItem } from '@/lib/core/config/types';
import { DemoBadge } from '@/components/demo-badge';
import { getVerticalConfig, findTaxonomyItem, t } from '@/lib/core/config';
import { formatDate, formatDateTime } from '@/lib/core/format';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { CoachAvatar } from '@/components/coach-visuals';
import { LiveSessionDot } from '@/components/admin/live-session-dot';
import { CoachRosterBlock } from '@/components/admin/coach-roster';
import {
  approveProviderAction,
  rejectProviderAction,
  toggleIdentityVerifiedAction,
  toggleCertificationsVerifiedAction,
} from '@/app/(dashboard)/dashboard/admin/actions';

/**
 * La riga di un coach in revisione.
 *
 * Estratta dalla vecchia pagina unica: il contenuto è lo stesso, comprese le
 * azioni di approvazione e le due verifiche a interruttore, perché nessuna
 * funzione dell'amministrazione doveva sparire nel riordino. Cambia solo dove
 * vive — l'area «Coach» — e che l'ancora `#coach-<id>` continua a funzionare,
 * perché è il bersaglio dei collegamenti nelle notifiche agli amministratori.
 */

function verifyChip(active: boolean) {
  return `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
    active
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
      : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
  }`;
}

export function ProviderStatusBadge({ status }: { status: string }) {
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

function ProviderRequirements({ p }: { p: ProviderReviewItem }) {
  if (p.status !== 'draft' && p.status !== 'rejected') return null;

  const contentSteps = p.onboarding.steps.filter(
    (step) => step.key !== 'submit'
  );
  const completed = contentSteps.filter((step) => step.done).length;
  const missing = contentSteps.filter((step) => !step.done);

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <p className="text-xs font-semibold text-gray-700">
        Requisiti per inviare la richiesta · {completed}/{contentSteps.length}{' '}
        completi
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {contentSteps.map((step) => (
          <span
            key={step.key}
            title={step.description}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
              step.done
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : 'bg-amber-50 text-amber-800 ring-amber-200'
            }`}
          >
            {step.done ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <CircleAlert className="h-3.5 w-3.5" />
            )}
            {step.done ? step.label : `Manca: ${step.label}`}
          </span>
        ))}
      </div>
      {missing.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-800">
          {missing.map((step) => (
            <li key={step.key}>• {step.description}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProviderRow({
  p,
  sportsList,
  roster,
  isLive = false,
}: {
  p: ProviderReviewItem;
  sportsList: TaxonomyItem[];
  /** Assente quando il coach non ha nessuna prenotazione: allora non c'è nulla da mostrare. */
  roster?: CoachRoster;
  isLive?: boolean;
}) {
  const sportLabels = (p.categories ?? [])
    .map((k) => findTaxonomyItem(sportsList, k)?.label ?? k)
    .join(', ');

  return (
    <li
      id={`coach-${p.id}`}
      className="flex scroll-mt-24 flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <CoachAvatar name={p.displayName} src={p.avatarUrl} className="size-12" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900">
              {p.displayName ?? p.email}
            </p>
            {p.isDemo && <DemoBadge />}
            <ProviderStatusBadge status={p.status} />
            {isLive ? <LiveSessionDot /> : null}
          </div>
          <p className="text-sm text-gray-500">{p.email}</p>
          {p.headline && <p className="text-sm text-gray-600">{p.headline}</p>}
          {sportLabels && (
            <p className="mt-1 text-xs text-gray-400">{sportLabels}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              Registrato il {formatDateTime(p.registeredAt)}
            </span>
            <span
              className={`inline-flex items-center gap-1 ${
                p.submittedAt ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              <Send className="h-3.5 w-3.5" />
              {p.submittedAt
                ? `Richiesta inviata il ${formatDateTime(p.submittedAt)}`
                : 'Richiesta non ancora inviata'}
            </span>
          </div>
          <ProviderRequirements p={p} />
          {p.status === 'approved' && (
            <p className="mt-1 text-xs font-medium text-green-700">
              Approvato da {p.reviewedByName ?? 'amministratore'}
              {p.reviewedAt
                ? ` il ${formatDate(p.reviewedAt)}`
                : ' · data non disponibile'}
            </p>
          )}
          {p.status === 'approved' && p.slug && (
            <Link
              href={`/coaches/${p.slug}`}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              Vedi profilo pubblico →
            </Link>
          )}

          {/* Verifiche gestite dall'amministrazione: un clic le commuta. */}
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

          {roster ? (
            <div className="mt-3">
              <CoachRosterBlock roster={roster} sportsList={sportsList} />
            </div>
          ) : null}
        </div>
      </div>

      {p.status === 'draft' ? (
        <span className="text-sm font-medium text-amber-700">
          In attesa del coach
        </span>
      ) : (
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
      )}
    </li>
  );
}
