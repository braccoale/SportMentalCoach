/** Booking states in which both participants may use the session chat. */
export const CHATTABLE_STATUSES = [
  'requested',
  'accepted',
  'completed',
] as const;

/** Closed states whose existing messages remain available as read-only history. */
export const CHAT_HISTORY_STATUSES = [
  'declined',
  'expired',
  'cancelled',
] as const;

export function isBookingChatAvailable(status: string): boolean {
  return (CHATTABLE_STATUSES as readonly string[]).includes(status);
}

export function canViewBookingChatHistory(
  status: string,
  hasMessages: boolean
): boolean {
  return (
    isBookingChatAvailable(status) ||
    (hasMessages &&
      (CHAT_HISTORY_STATUSES as readonly string[]).includes(status))
  );
}
