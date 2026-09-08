import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  systemConfig,
  userRoles,
  type SystemConfigValueType,
} from '@/lib/db/schema';
import { isCacheEntryValid, makeCacheEntry, type ConfigCacheEntry } from './cache';
import { parseSystemConfigValue } from './value-parsing';

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
