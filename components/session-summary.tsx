import { Clock } from 'lucide-react';
import {
  getSessionDurationMinutes,
  formatMinutes,
  formatTime,
} from '@/lib/core/format';
import { StatMedal } from '@/components/coach-experience-stats';

/**
 * Compact recap of a completed session: a blue duration medal plus the real
 * start/end times when the video call was tracked. Falls back to the booked
 * service's planned length when no real span was recorded (e.g. a session
 * marked complete without a video call). Renders nothing when neither is known.
 */
export function SessionSummary({
  start,
  end,
  fallbackMinutes,
  className,
}: {
  start: Date | null;
  end: Date | null;
  fallbackMinutes?: number | null;
  className?: string;
}) {
  const realMinutes = getSessionDurationMinutes(start, end);
  const minutes = realMinutes ?? fallbackMinutes ?? null;
  if (minutes == null) return null;

  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <StatMedal icon={Clock} size={44} iconSize={16} fromColor="#3b82f6" toColor="#1d4ed8" />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
          Durata sessione
        </p>
        {start && end ? (
          <p className="mt-0.5 text-sm text-gray-700">
            <span className="font-semibold text-gray-900">
              {formatMinutes(minutes)}
            </span>{' '}
            · iniziata {formatTime(start)}, terminata {formatTime(end)}
          </p>
        ) : (
          <p className="mt-0.5 text-sm font-semibold text-gray-900">
            {formatMinutes(minutes)}
          </p>
        )}
      </div>
    </div>
  );
}
