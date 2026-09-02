import { requireRole } from '@/lib/core/auth';
import { getAllAthletesForAdmin } from '@/lib/core/admin';
import { getAllSports } from '@/lib/core/taxonomies';
import { getVerticalConfig, findTaxonomyItem } from '@/lib/core/config';
import { formatDate } from '@/lib/core/format';
import { getAthletesNeedingGuardian } from '@/lib/core/admin/guardians';
import { SectionHeader, EmptyBlock } from '@/components/admin/control-room';
import {
  AthleteProfileDialog,
  type AthleteProfileDialogData,
} from '../athlete-profile-dialog';

export const dynamic = 'force-dynamic';

/**
 * L'area Utenti: gli atleti registrati.
 *
 * `?filtro=minori-senza-autorizzazione` è il bersaglio della voce critica
 * della panoramica, e non è un filtro cosmetico: mostra soltanto gli atleti
 * minorenni con prenotazioni attive e nessuna autorizzazione del tutore
 * confermata. Una voce che dice «3 minori senza autorizzazione» e porta a un
 * elenco di duecento persone non è un collegamento, è un compito.
 *
 * La data di nascita completa non compare in elenco — solo l'età e il fatto
 * che sia un minore: all'amministrazione serve sapere che è un minore, non
 * quando compie gli anni. È la stessa regola di `getAdminBookingRows`.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  await requireRole('admin');
  const { filtro } = await searchParams;
  const onlyMinors = filtro === 'minori-senza-autorizzazione';

  const config = getVerticalConfig();
  const [athletes, sportsList, needingGuardian] = await Promise.all([
    getAllAthletesForAdmin(),
    getAllSports(),
    getAthletesNeedingGuardian(),
  ]);

  const flagged = new Map(needingGuardian.map((row) => [row.athleteUserId, row]));
  const list = onlyMinors
    ? athletes.filter((athlete) => flagged.has(athlete.userId))
    : athletes;

  return (
    <section className="p-4 lg:p-0">
      <SectionHeader
        title="Utenti"
        subtitle={
          onlyMinors
            ? 'Solo gli atleti minorenni con prenotazioni attive e nessuna autorizzazione del tutore confermata.'
            : 'Atleti registrati. Il riquadro si apre sul profilo: sport, livello, obiettivi e sedute.'
        }
        action={
          <div className="flex gap-2">
            <FilterLink
              href="/dashboard/admin/utenti"
              active={!onlyMinors}
              label={`Tutti · ${athletes.length}`}
            />
            <FilterLink
              href="/dashboard/admin/utenti?filtro=minori-senza-autorizzazione"
              active={onlyMinors}
              label={`Minori senza autorizzazione · ${needingGuardian.length}`}
              tone={needingGuardian.length > 0}
            />
          </div>
        }
      />

      {onlyMinors && needingGuardian.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-900">
            Finché il tutore non conferma, la seduta non ha una base valida
          </p>
          <p className="mt-1 text-sm text-red-800">
            L’autorizzazione si richiede dal profilo dell’atleta; questa pagina
            dice soltanto chi ne è privo. Nessuna azione automatica viene
            eseguita da qui.
          </p>
        </div>
      ) : null}

      <div className="mt-5">
        {list.length === 0 ? (
          <EmptyBlock
            title={
              onlyMinors
                ? 'Nessun minore senza autorizzazione'
                : 'Nessun atleta registrato'
            }
            detail={
              onlyMinors
                ? 'Ogni atleta minorenne con prenotazioni attive ha un’autorizzazione confermata. Questo elenco resta vuoto finché non ne compare uno che non ce l’ha.'
                : 'Gli atleti compaiono qui appena completano la registrazione.'
            }
          />
        ) : (
          <ul className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((a) => {
              const sport = a.category
                ? findTaxonomyItem(sportsList, a.category)?.label ?? a.category
                : null;
              const level = a.level
                ? findTaxonomyItem(config.taxonomies.levels ?? [], a.level)
                    ?.label ?? a.level
                : null;
              const athlete: AthleteProfileDialogData = {
                name: a.name,
                email: a.email,
                isDemo: a.isDemo,
                avatarUrl: a.avatarUrl,
                sport,
                level,
                city: a.city,
                birthDate: a.birthDate
                  ? formatDate(new Date(`${a.birthDate}T12:00:00Z`))
                  : null,
                goals: a.goals,
                completedSessions: a.completedSessions,
                scheduledSessions: a.scheduledSessions,
                totalMinutes: a.totalMinutes,
                registeredAt: formatDate(a.createdAt),
              };
              const guardian = flagged.get(a.userId);
              return (
                <li key={a.userId} className="h-full">
                  <div className="relative h-full">
                    <AthleteProfileDialog athlete={athlete} />
                    {guardian ? (
                      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        {guardian.age !== null
                          ? `${guardian.age} anni · tutore mancante`
                          : 'tutore mancante'}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function FilterLink({
  href,
  active,
  label,
  tone = false,
}: {
  href: string;
  active: boolean;
  label: string;
  tone?: boolean;
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'border-gray-900 bg-gray-900 text-white'
          : tone
            ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
            : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {label}
    </a>
  );
}
