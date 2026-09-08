import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  systemConfig,
  userRoles,
  type SystemConfigValueType,
} from '@/lib/db/schema';
import type {
  RoleDef,
  TaxonomyItem,
  VerticalConfig,
  VerticalRoles,
} from './types';
import { sportMentalCoachConfig } from '@/lib/verticals/sport-mental-coach';
import { isCacheEntryValid, makeCacheEntry, type ConfigCacheEntry } from './cache';
import { parseSystemConfigValue } from './value-parsing';

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

// ---------------------------------------------------------------------------
// system_config: admin-editable business constants (key/value rows in the
// `system_config` table), unrelated to the vertical configuration above.
// Both live under `lib/core/config` because they share the "config" name,
// not because they share a concept — see task-3-report.md for context.
// ---------------------------------------------------------------------------

const cache = new Map<string, ConfigCacheEntry<unknown>>();

/**
 * `undefined` se la riga manca o il database ha un problema — mai un errore
 * lanciato: ogni chiamante ha già il suo fallback pronto.
 */
async function readRawValue(key: string): Promise<unknown> {
  const now = Date.now();
  const cached = cache.get(key);
  if (isCacheEntryValid(cached, now)) return cached.value;

  try {
    const [row] = await db
      .select({ value: systemConfig.value })
      .from(systemConfig)
      .where(eq(systemConfig.key, key))
      .limit(1);
    if (!row) {
      cache.delete(key);
      return undefined;
    }
    cache.set(key, makeCacheEntry(row.value, now));
    return row.value;
  } catch {
    return undefined;
  }
}

export async function getSystemConfigNumber(
  key: string,
  fallback: number
): Promise<number> {
  const value = await readRawValue(key);
  return typeof value === 'number' ? value : fallback;
}

export async function getSystemConfigString(
  key: string,
  fallback: string
): Promise<string> {
  const value = await readRawValue(key);
  return typeof value === 'string' ? value : fallback;
}

export async function getSystemConfigBoolean(
  key: string,
  fallback: boolean
): Promise<boolean> {
  const value = await readRawValue(key);
  return typeof value === 'boolean' ? value : fallback;
}

async function assertAdmin(actorUserId: number): Promise<void> {
  const [admin] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(eq(userRoles.userId, actorUserId), eq(userRoles.roleKey, 'admin'))
    )
    .limit(1);
  if (!admin) throw new Error('FORBIDDEN');
}

export type SystemConfigRow = {
  key: string;
  value: unknown;
  valueType: SystemConfigValueType;
  category: string;
  label: string;
  description: string | null;
  updatedDate: Date;
};

/** L'intero elenco, ordinato per categoria poi chiave — per il pannello admin. */
export async function listSystemConfig(
  actorUserId: number
): Promise<SystemConfigRow[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      key: systemConfig.key,
      value: systemConfig.value,
      valueType: systemConfig.valueType,
      category: systemConfig.category,
      label: systemConfig.label,
      description: systemConfig.description,
      updatedDate: systemConfig.updatedDate,
    })
    .from(systemConfig)
    .orderBy(asc(systemConfig.category), asc(systemConfig.key));
  return rows.map((row) => ({
    ...row,
    valueType: row.valueType as SystemConfigValueType,
  }));
}

export type SetSystemConfigResult =
  | { ok: true }
  | { ok: false; error: string };

export async function setSystemConfigValue(params: {
  actorUserId: number;
  key: string;
  valueType: SystemConfigValueType;
  rawValue: string;
}): Promise<SetSystemConfigResult> {
  await assertAdmin(params.actorUserId);

  const parsed = parseSystemConfigValue(params.valueType, params.rawValue);
  if (!parsed.ok) return parsed;

  const [updated] = await db
    .update(systemConfig)
    .set({
      value: parsed.value,
      updatedDate: new Date(),
      updatedBy: params.actorUserId,
    })
    .where(eq(systemConfig.key, params.key))
    .returning({ key: systemConfig.key });

  if (!updated) return { ok: false, error: 'Chiave non trovata.' };

  // Invalida subito per questo processo. Su serverless, un'altra istanza
  // vede il valore nuovo solo alla scadenza della sua cache (fino a 60s) —
  // limite noto e accettato, non un bug.
  cache.delete(params.key);
  return { ok: true };
}
