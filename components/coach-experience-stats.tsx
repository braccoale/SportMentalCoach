import type { LucideIcon } from 'lucide-react';
import { Users, CalendarCheck, Clock } from 'lucide-react';
import { formatTotalHours } from '@/lib/core/format';

/**
 * Cerchio pieno con icona e valore al centro — una "medaglia", non un
 * indicatore di avanzamento. Sostituisce il precedente GaugeRing (un anello
 * ad arco parziale, riempito con una curva a rendimenti decrescenti per
 * aggirare la mancanza di un tetto reale): questi numeri sono contatori di
 * carriera che crescono e basta, non una quota su un totale — un arco che
 * "si avvicina al pieno" prometteva un limite che non esiste. Nessuna logica
 * di progresso da mantenere: il cerchio è sempre pieno.
 */
export function StatMedal({
  icon: Icon,
  value,
  unit,
  size = 96,
  iconSize = 16,
  valueClassName = 'text-xl font-bold',
  fromColor,
  toColor,
  className,
}: {
  icon: LucideIcon;
  value?: React.ReactNode;
  unit?: string;
  /** Pixel diameter of the medal. */
  size?: number;
  iconSize?: number;
  valueClassName?: string;
  fromColor: string;
  toColor: string;
  className?: string;
}) {
  return (
    <div
      className={`relative flex shrink-0 flex-col items-center justify-center rounded-full text-white shadow-md ${className ?? ''}`}
      style={{
        height: size,
        width: size,
        maxWidth: '100%',
        background: `linear-gradient(155deg, ${fromColor}, ${toColor})`,
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[3px] rounded-full border border-white/25"
      />
      <Icon style={{ width: iconSize, height: iconSize }} />
      {value != null && (
        <span className={`${valueClassName} mt-0.5 leading-none`}>{value}</span>
      )}
      {unit && (
        <span className="text-[10px] font-medium text-white/80">{unit}</span>
      )}
    </div>
  );
}

/**
 * Trust/experience showcase for the coach profile: three medals for athletes
 * coached, completed sessions and coaching hours. Hidden for coaches with no
 * completed sessions yet — there's nothing to show off.
 */
export function CoachExperienceStats({
  athletesCount,
  completedSessions,
  totalMinutes,
}: {
  athletesCount: number;
  completedSessions: number;
  totalMinutes: number;
}) {
  if (athletesCount === 0 && completedSessions === 0) return null;

  return (
    <div className="relative mt-6 overflow-hidden rounded-3xl border border-white/60 bg-white/70 p-3 shadow-xl ring-1 ring-black/5 backdrop-blur-xl sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-blue-200/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-sky-300/30 blur-3xl"
      />
      <div className="relative grid grid-cols-3 gap-2 sm:gap-6">
        <div className="flex flex-col items-center text-center">
          <StatMedal
            icon={Users}
            value={athletesCount}
            size={96}
            fromColor="#3b82f6"
            toColor="#1d4ed8"
          />
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            {athletesCount === 1 ? 'Atleta seguito' : 'Atleti seguiti'}
          </p>
        </div>

        <div className="flex flex-col items-center text-center">
          <StatMedal
            icon={CalendarCheck}
            value={completedSessions}
            size={96}
            fromColor="#22d3ee"
            toColor="#0e7490"
          />
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            {completedSessions === 1 ? 'Sessione completata' : 'Sessioni completate'}
          </p>
        </div>

        <div className="flex flex-col items-center text-center">
          <StatMedal
            icon={Clock}
            value={formatTotalHours(totalMinutes)}
            size={96}
            fromColor="#38bdf8"
            toColor="#0369a1"
          />
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-gray-500">
            Ore di coaching erogate
          </p>
        </div>
      </div>
    </div>
  );
}
