import type { MessageCatalog } from './catalogs';

/**
 * Only namespaces consumed by Client Components cross the RSC boundary.
 * Server Components keep access to the complete request catalogue without
 * serializing it into every HTML response.
 */
export const CLIENT_MESSAGE_NAMESPACES = [
  'MarketplaceAuth',
  'SharedActions',
  'UserMenu',
  'DashboardShell',
  'Notifications',
  'CookieConsent',
  'Invite',
] as const satisfies readonly (keyof MessageCatalog)[];

export function getClientMessages(messages: MessageCatalog) {
  return {
    MarketplaceAuth: messages.MarketplaceAuth,
    SharedActions: messages.SharedActions,
    UserMenu: messages.UserMenu,
    DashboardShell: messages.DashboardShell,
    Notifications: messages.Notifications,
    CookieConsent: messages.CookieConsent,
    Invite: messages.Invite,
  } satisfies Pick<
    MessageCatalog,
    (typeof CLIENT_MESSAGE_NAMESPACES)[number]
  >;
}
