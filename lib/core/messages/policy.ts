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

// Kept below Vercel's request-body ceiling, including multipart overhead.
export const CHAT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const CHAT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MESSAGE_REACTION_EMOJIS = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🙏',
] as const;

export function isMessageReactionEmoji(
  emoji: string
): emoji is (typeof MESSAGE_REACTION_EMOJIS)[number] {
  return (MESSAGE_REACTION_EMOJIS as readonly string[]).includes(emoji);
}

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
