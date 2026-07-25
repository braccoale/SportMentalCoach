/**
 * A service can be booked only when its planned duration is a positive,
 * whole number of minutes. The coach owns this value; booking forms never ask
 * the athlete to provide or override it.
 */
export const MAX_SERVICE_DURATION_MIN = 24 * 60;
export const DEFAULT_SERVICE_DURATION_MIN = 40;

export function hasValidServiceDuration(
  durationMin: number | null | undefined
): durationMin is number {
  return (
    Number.isInteger(durationMin) &&
    (durationMin ?? 0) > 0 &&
    (durationMin ?? 0) <= MAX_SERVICE_DURATION_MIN
  );
}
