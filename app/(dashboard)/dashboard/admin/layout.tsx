import { sql } from 'drizzle-orm';
import { requireRole } from '@/lib/core/auth';
import { db } from '@/lib/db/drizzle';
import { AdminNav, EnvironmentBadge } from '@/components/admin/admin-nav';

/**
 * Il guscio della Control Room.
 *
 * `requireRole('admin')` sta qui **e** in ogni pagina figlia. Non è una
 * ripetizione per prudenza: un layout in Next.js non è un cancello. Le pagine
 * figlie possono essere richieste da sole (una navigazione client, un
 * prefetch, una server action), e un controllo che vive solo nel layout è un
 * controllo che si aggira. Il layout serve a non mostrare la navigazione a
 * chi non deve vederla; a proteggere i dati serve il controllo nella pagina
 * che li legge.
 *
 * I due conteggi nella barra sono le uniche letture del guscio, e sono
 * aggregati: la navigazione non deve costare quanto la pagina.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole('admin');

  const [counts] = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM provider_profiles WHERE status = 'pending') AS pending_coaches,
      (SELECT count(*)::int FROM session_ai_notes
        WHERE status IN ('transcription_failed', 'report_failed')
          AND createddate > now() - interval '30 days') AS failed_sessions
  `)) as unknown as { pending_coaches: number; failed_sessions: number }[];

  const environment = process.env.VERCEL_ENV ?? 'sviluppo locale';

  return (
    <div className="lg:flex lg:gap-6 lg:p-6">
      <aside className="border-b border-gray-200 px-4 pt-4 lg:w-56 lg:shrink-0 lg:border-b-0 lg:px-0 lg:pt-0">
        <div className="hidden lg:block">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            KaiPai
          </p>
          <p className="mt-0.5 px-3 text-base font-semibold text-gray-900">
            Control Room
          </p>
          <div className="mt-4" />
        </div>
        <AdminNav
          pendingCoaches={Number(counts?.pending_coaches ?? 0)}
          attentionCount={Number(counts?.failed_sessions ?? 0)}
        />
        <div className="mt-3 hidden lg:block">
          <EnvironmentBadge environment={environment} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="px-4 pt-3 lg:hidden">
          <EnvironmentBadge environment={environment} />
        </div>
        {children}
      </div>
    </div>
  );
}
