import type {
  RoleDef,
  TaxonomyItem,
  VerticalConfig,
  VerticalRoles,
} from './types';
import { sportMentalCoachConfig } from '@/lib/verticals/sport-mental-coach';

export type {
  RoleDef,
  TaxonomyItem,
  VerticalConfig,
  VerticalLocale,
  VerticalRoles,
  VerticalTaxonomies,
} from './types';

/**
 * The active vertical for this deployment. Phase 1 ships a single vertical;
 * this indirection keeps every core call site (`getVerticalConfig()`) free of
 * vertical-specific imports, so swapping verticals is a one-line change here.
 */
const ACTIVE_VERTICAL: VerticalConfig = sportMentalCoachConfig;

/** Returns the active vertical configuration. */
export function getVerticalConfig(): VerticalConfig {
  return ACTIVE_VERTICAL;
}

/** Looks up a taxonomy item by key within a given list. */
export function findTaxonomyItem(
  items: TaxonomyItem[],
  key: string
): TaxonomyItem | undefined {
  return items.find((item) => item.key === key);
}

/** All role definitions of the active vertical as a flat array. */
export function getRoleList(config: VerticalConfig = ACTIVE_VERTICAL): RoleDef[] {
  return Object.values(config.roles);
}

/** Resolves a role key to its vertical label, falling back to the key. */
export function getRoleLabel(
  roleKey: string,
  config: VerticalConfig = ACTIVE_VERTICAL
): string {
  const match = (Object.values(config.roles) as RoleDef[]).find(
    (role) => role.key === roleKey
  );
  return match?.label ?? roleKey;
}

/** Resolves a copy key to its string, falling back to the key when missing. */
export function t(
  key: string,
  config: VerticalConfig = ACTIVE_VERTICAL
): string {
  return config.copy[key] ?? key;
}

export type { VerticalRoles as Roles };
