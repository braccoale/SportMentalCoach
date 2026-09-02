import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/core/auth';
import { db } from '@/lib/db/drizzle';
import {
  ADMIN_AUDIT_ACTION_LABEL,
  ADMIN_AUDIT_OUTCOME_LABEL,
  AUDIT_PAGE_SIZE,
  getAdminAuditEvents,
} from '@/lib/core/admin/audit-log';
import { ADMIN_AUDIT_ACTIONS, type AdminAuditAction } from '@/lib/db/schema';
import { formatDateTime } from '@/lib/core/format';
import {
  EmptyBlock,
  ErrorBlock,
  SectionHeader,
} from '@/components/admin/control-room';

export const dynamic = 'force-dynamic';

const OUTCOME_STYLE: Record<string, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rifiutata: 'bg-amber-50 text-amber-800 ring-amber-200',
  fallita: 'bg-red-50 text-red-700 ring-red-200',
};

/**
 * Sicurezza e audit: chi ha fatto cosa, e le consegne delle email.
 *
 * Due viste in una pagina perché rispondono alla stessa domanda con due
 * fonti: «è successo davvero quello che credo». Il registro amministrativo
 * dice chi ha deciso; le consegne dicono se il sistema ha davvero parlato con
 * l'esterno — e una mail che non arriva non lascia nessuna traccia nella
 * schermata che l'ha richiesta.
 *
 * Il registro è **append-only anche nel database** (trigger, migrazione
 * 0060): non esiste un percorso di modifica né di cancellazione, e non deve
 * essercene uno. Se la tabella non è ancora stata migrata, la pagina lo dice
 * invece di rompersi: è l'unica parte di questo lavoro che richiede una
 * migrazione, e finché non è applicata deve essere evidente.
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; azione?: string; pagina?: string }>;
}) {
  await requireRole('admin');
  const { vista, azione, pagina } = await searchParams;
  const view = vista === 'email' ? 'email' : 'admin';
  const action = ADMIN_AUDIT_ACTIONS.includes(azione as AdminAuditAction)
    ? (azione as AdminAuditAction)
    : null;
  const page = Math.max(1, Math.min(Number(pagina) || 1, 200));

  return (
    <section className="p-4 lg:p-0">
      <SectionHeader
        title="Sicurezza e audit"
        subtitle="Le azioni amministrative sensibili e le consegne delle email. Il registro non contiene contenuti di seduta né segreti: identificativi, esiti e codici."
        action={
          <div className="flex gap-2">
            <Tab href="/dashboard/admin/audit" active={view === 'admin'}>
              Azioni amministrative
            </Tab>
            <Tab
              href="/dashboard/admin/audit?vista=email"
              active={view === 'email'}
            >
              Consegne email
            </Tab>
          </div>
        }
      />

      {view === 'admin' ? (
        <AdminActionsView action={action} page={page} />
      ) : (
        <EmailDeliveriesView page={page} />
      )}
    </section>
  );
}

async function AdminActionsView({
  action,
  page,
}: {
  action: AdminAuditAction | null;
  page: number;
}) {
  let data;
  try {
    data = await getAdminAuditEvents({ page, action });
  } catch (error) {
    console.error('[admin] registro audit non leggibile', error);
    return (
      <div className="mt-5">
        <ErrorBlock
          title="Il registro non è leggibile"
          detail="Se la migrazione 0060 non è ancora stata applicata la tabella admin_audit_events non esiste: le azioni amministrative funzionano comunque, ma non lasciano traccia finché non viene applicata."
          retryHref="/dashboard/admin/audit"
        />
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(data.total / AUDIT_PAGE_SIZE));

  return (
    <>
      <div className="mt-4 flex flex-wrap gap-2">
        <Chip href="/dashboard/admin/audit" active={action === null}>
          Tutte
        </Chip>
        {ADMIN_AUDIT_ACTIONS.map((value) => (
          <Chip
            key={value}
            href={`/dashboard/admin/audit?azione=${value}`}
            active={action === value}
          >
            {ADMIN_AUDIT_ACTION_LABEL[value]}
          </Chip>
        ))}
      </div>

      <div className="mt-4">
        {data.rows.length === 0 ? (
          <EmptyBlock
            title="Nessuna azione registrata"
            detail="Il registro comincia dalla migrazione 0060: le azioni precedenti non sono state tracciate e non possono essere ricostruite. Da qui in avanti ogni approvazione, revoca e ripresa lascia una riga."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Quando</th>
                    <th scope="col" className="px-4 py-3">Chi</th>
                    <th scope="col" className="px-4 py-3">Azione</th>
                    <th scope="col" className="px-4 py-3">Oggetto</th>
                    <th scope="col" className="px-4 py-3">Esito</th>
                    <th scope="col" className="px-4 py-3">Dettaglio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                        {formatDateTime(row.at)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {row.actorName ?? row.actorEmail ?? 'sconosciuto'}
                        </p>
                        {row.actorName && row.actorEmail ? (
                          <p className="text-[11px] text-gray-500">
                            {row.actorEmail}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {ADMIN_AUDIT_ACTION_LABEL[
                          row.action as AdminAuditAction
                        ] ?? row.action}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {row.subjectType}
                        {row.subjectId !== null ? ` #${row.subjectId}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                            OUTCOME_STYLE[row.outcome] ??
                            'bg-gray-100 text-gray-600 ring-gray-200'
                          }`}
                        >
                          {ADMIN_AUDIT_OUTCOME_LABEL[
                            row.outcome as keyof typeof ADMIN_AUDIT_OUTCOME_LABEL
                          ] ?? row.outcome}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px] leading-4 text-gray-600">
                        {Object.keys(row.detail).length === 0
                          ? '—'
                          : Object.entries(row.detail)
                              .map(([key, value]) => `${key}: ${String(value)}`)
                              .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {data.total > AUDIT_PAGE_SIZE ? (
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Pagina {page} di {pages} · {data.total} voci
          </p>
          <div className="flex gap-2">
            <PageLink
              href={`/dashboard/admin/audit?${action ? `azione=${action}&` : ''}pagina=${page - 1}`}
              disabled={page <= 1}
            >
              Precedente
            </PageLink>
            <PageLink
              href={`/dashboard/admin/audit?${action ? `azione=${action}&` : ''}pagina=${page + 1}`}
              disabled={page >= pages}
            >
              Successiva
            </PageLink>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <ShieldCheck
          className="mt-0.5 h-4 w-4 shrink-0 text-gray-400"
          aria-hidden="true"
        />
        <p className="text-xs leading-5 text-gray-600">
          <span className="font-semibold text-gray-800">Append-only.</span> La
          tabella rifiuta UPDATE e DELETE con un trigger: nell’applicazione non
          esiste nessun percorso per modificare o cancellare una riga, e non
          deve essercene uno. Un registro che si può correggere non prova
          niente, ed è proprio la riga scomoda quella che si è tentati di
          correggere.
        </p>
      </div>
    </>
  );
}

async function EmailDeliveriesView({ page }: { page: number }) {
  const rows = (await db.execute(sql`
    SELECT id, template_key, status, recipient_user_id, attempt_count,
           created_at, sent_at
    FROM notification_email_deliveries
    ORDER BY created_at DESC
    LIMIT ${AUDIT_PAGE_SIZE} OFFSET ${(page - 1) * AUDIT_PAGE_SIZE}
  `)) as unknown as {
    id: string;
    template_key: string;
    status: string;
    recipient_user_id: number | null;
    attempt_count: number;
    created_at: Date | string;
    sent_at: Date | string | null;
  }[];

  return (
    <div className="mt-4">
      <p className="mb-3 text-sm text-gray-600">
        Le consegne registrate, dalla più recente. L’indirizzo del
        destinatario non compare: basta l’identificativo dell’utente per
        ritrovarlo, e un elenco di indirizzi in una console non serve a
        nessuna diagnosi.
      </p>
      {rows.length === 0 ? (
        <EmptyBlock
          title="Nessuna consegna registrata"
          detail="Nessuna email transazionale è passata da qui. In un ambiente senza Resend configurato è il comportamento atteso."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Creata</th>
                  <th scope="col" className="px-4 py-3">Modello</th>
                  <th scope="col" className="px-4 py-3">Destinatario</th>
                  <th scope="col" className="px-4 py-3">Stato</th>
                  <th scope="col" className="px-4 py-3">Tentativi</th>
                  <th scope="col" className="px-4 py-3">Inviata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">
                      {formatDateTime(new Date(row.created_at))}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {row.template_key}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {row.recipient_user_id
                        ? `utente #${row.recipient_user_id}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                          row.status === 'sent'
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : row.status === 'failed'
                              ? 'bg-red-50 text-red-700 ring-red-200'
                              : 'bg-gray-100 text-gray-600 ring-gray-200'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">
                      {row.attempt_count}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {row.sent_at ? formatDateTime(new Date(row.sent_at)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-3 flex justify-end gap-2">
        <PageLink
          href={`/dashboard/admin/audit?vista=email&pagina=${page - 1}`}
          disabled={page <= 1}
        >
          Precedente
        </PageLink>
        <PageLink
          href={`/dashboard/admin/audit?vista=email&pagina=${page + 1}`}
          disabled={rows.length < AUDIT_PAGE_SIZE}
        >
          Successiva
        </PageLink>
      </div>
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'border-gray-900 bg-gray-900 text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </Link>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {children}
    </Link>
  );
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1.5 text-sm font-medium text-gray-400">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-full border border-gray-300 bg-white px-3.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      {children}
    </Link>
  );
}
