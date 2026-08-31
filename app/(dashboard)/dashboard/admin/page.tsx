import Link from 'next/link';
import {
  Award,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Hourglass,
  Send,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { requireRole } from '@/lib/core/auth';
import {
  getProviderProfilesForReview,
  getAllAthletesForAdmin,
  getAdminBookingsOverview,
  type ProviderReviewItem,
  type AthleteAdminItem,
} from '@/lib/core/admin';
import type { CoachRoster } from '@/lib/core/admin/coach-roster';
import { DemoBadge } from '@/components/demo-badge';
import { getVerticalConfig, findTaxonomyItem, t } from '@/lib/core/config';
import { getAllSports } from '@/lib/core/taxonomies';
import type { TaxonomyItem } from '@/lib/core/config/types';
import { formatDate, formatDateTime } from '@/lib/core/format';
import { Button } from '@/components/ui/button';
import { ActionForm } from '@/components/action-form';
import { CoachAvatar } from '@/components/coach-visuals';
import { CollapsiblePanel } from '@/components/collapsible-panel';
import { LiveSessionDot } from '@/components/admin/live-session-dot';
import { CoachRosterBlock } from '@/components/admin/coach-roster';
import { TodaySessionsWidget } from '@/components/admin/today-sessions-widget';
import { getLiveCoachProviderIds } from '@/lib/core/admin/live-sessions';
import {
  approveProviderAction,
  rejectProviderAction,
  toggleIdentityVerifiedAction,
  toggleCertificationsVerifiedAction,
} from './actions';
import {
  AthleteProfileDialog,
  type AthleteProfileDialogData,
} from './athlete-profile-dialog';

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

function ProviderRow({
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
  const config = getVerticalConfig();
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
            {statusBadge(p.status)}
            {isLive ? <LiveSessionDot /> : null}
          </div>
          <p className="text-sm text-gray-500">{p.email}</p>
          {p.headline && (
            <p className="text-sm text-gray-600">{p.headline}</p>
          )}
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

function AthleteRow({
  a,
  sportsList,
}: {
  a: AthleteAdminItem;
  sportsList: TaxonomyItem[];
}) {
  const config = getVerticalConfig();
  const sport = a.category
    ? findTaxonomyItem(sportsList, a.category)?.label ?? a.category
    : null;
  const level = a.level
    ? findTaxonomyItem(config.taxonomies.levels ?? [], a.level)?.label ?? a.level
    : null;
  const birthDate = a.birthDate
    ? formatDate(new Date(`${a.birthDate}T12:00:00Z`))
    : null;
  const athlete: AthleteProfileDialogData = {
    name: a.name,
    email: a.email,
    isDemo: a.isDemo,
    avatarUrl: a.avatarUrl,
    sport,
    level,
    city: a.city,
    birthDate,
    goals: a.goals,
    completedSessions: a.completedSessions,
    scheduledSessions: a.scheduledSessions,
    totalMinutes: a.totalMinutes,
    registeredAt: formatDate(a.createdAt),
  };

  return (
    <li className="h-full">
      <AthleteProfileDialog athlete={athlete} />
    </li>
  );
}

export default async function AdminDashboardPage() {
  await requireRole('admin');
  const [all, sportsList, athletes, liveProviderIds, bookingsOverview] =
    await Promise.all([
      getProviderProfilesForReview(),
      getAllSports(),
      getAllAthletesForAdmin(),
      getLiveCoachProviderIds(),
      getAdminBookingsOverview(),
    ]);
  const { rosters, todaySessions } = bookingsOverview;
  const queue = all.filter((p) => p.status === 'pending');
  const drafts = all.filter((p) => p.status === 'draft');
  const approved = all.filter((p) => p.status === 'approved');
  const rejected = all.filter((p) => p.status === 'rejected');

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
      <Link
        href="/dashboard/admin/ai-notes"
        className="mt-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
      >
        Configura Appunti AI · BETA
      </Link>

      {/*
        I numeri restano fuori dai blocchi richiudibili: sono il riassunto
        della pagina, e un riassunto che si può nascondere non riassume più
        niente.
      */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <Hourglass className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">
              Coach da approvare
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">{queue.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <Award className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">
              Coach approvati
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {approved.length}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-gray-500">
            <Users className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">
              Atleti registrati
            </span>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {athletes.length}
          </p>
        </div>

        {/* Il quarto riquadro è anche un pulsante: cliccato, si apre sulla
            giornata — orario, coach, atleta, stato. Gli altri tre sono numeri
            e basta, perché non c'è un elenco dietro. */}
        <TodaySessionsWidget sessions={todaySessions} />
      </div>

      {/*
        Da qui in giù la pagina è fatta di blocchi che si aprono e si
        richiudono. Arrivano aperti — chiusi, sarebbero sei titoli da aprire
        uno per uno per sapere cosa contengono — tranne quelli vuoti, dove il
        conteggio a zero è già tutto il contenuto. Quello che richiudi resta
        richiuso: la scelta la ricorda questo browser.
      */}
      <CollapsiblePanel
        title="Atleti registrati"
        count={athletes.length}
        defaultOpen={athletes.length > 0}
        persistKey="admin-athletes"
      >
        {athletes.length === 0 ? (
          <p className="text-gray-500">Nessun atleta registrato.</p>
        ) : (
          <ul className="grid items-stretch gap-3 sm:grid-cols-2">
            {athletes.map((a) => (
              <AthleteRow key={a.userId} a={a} sportsList={sportsList} />
            ))}
          </ul>
        )}
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Coda di revisione"
        count={queue.length}
        defaultOpen={queue.length > 0}
        persistKey="admin-queue"
      >
        {queue.length === 0 ? (
          <p className="text-gray-500">Nessun profilo in attesa di revisione.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {queue.map((p) => (
              <ProviderRow
                key={p.id}
                p={p}
                sportsList={sportsList}
                roster={rosters.get(p.id)}
                isLive={liveProviderIds.has(p.id)}
              />
            ))}
          </ul>
        )}
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Coach registrati · profilo non inviato"
        count={drafts.length}
        defaultOpen={drafts.length > 0}
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
            <ul className="mt-3 flex flex-col gap-3">
              {drafts.map((p) => (
                <ProviderRow
                  key={p.id}
                  p={p}
                  sportsList={sportsList}
                  roster={rosters.get(p.id)}
                  isLive={liveProviderIds.has(p.id)}
                />
              ))}
            </ul>
          </>
        )}
      </CollapsiblePanel>

      <CollapsiblePanel
        title="Profili approvati"
        count={approved.length}
        defaultOpen={approved.length > 0}
        persistKey="admin-approved"
      >
        {approved.length === 0 ? (
          <p className="text-gray-500">Nessun profilo approvato.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {approved.map((p) => (
              <ProviderRow
                key={p.id}
                p={p}
                sportsList={sportsList}
                roster={rosters.get(p.id)}
                isLive={liveProviderIds.has(p.id)}
              />
            ))}
          </ul>
        )}
      </CollapsiblePanel>

      {/* I rifiutati non hanno un blocco quando non ce ne sono: un elenco a
          zero che non serve a nessuno è rumore, non informazione. */}
      {rejected.length > 0 && (
        <CollapsiblePanel
          title="Profili rifiutati"
          count={rejected.length}
          persistKey="admin-rejected"
        >
          <ul className="flex flex-col gap-3">
            {rejected.map((p) => (
              <ProviderRow
                key={p.id}
                p={p}
                sportsList={sportsList}
                roster={rosters.get(p.id)}
                isLive={liveProviderIds.has(p.id)}
              />
            ))}
          </ul>
        </CollapsiblePanel>
      )}
    </section>
  );
}
