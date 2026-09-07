import 'server-only';
import { and, eq, ilike, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { organizations, teamMembers, users, type NewTeamMember } from '@/lib/db/schema';
import { assertAdmin } from '@/lib/core/features';

export type OrganizationSearchResult = {
  id: number;
  name: string;
  memberCount: number;
};

/** Organizzazioni il cui nome contiene `query` (case-insensitive). */
export async function searchOrganizations(
  actorUserId: number,
  query: string
): Promise<OrganizationSearchResult[]> {
  await assertAdmin(actorUserId);
  const trimmed = query.trim();
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      memberCount: sql<number>`count(${teamMembers.id})::int`,
    })
    .from(organizations)
    .leftJoin(teamMembers, eq(teamMembers.teamId, organizations.id))
    .where(trimmed ? ilike(organizations.name, `%${trimmed}%`) : undefined)
    .groupBy(organizations.id)
    .orderBy(organizations.name)
    .limit(20);
  return rows;
}

export type OrganizationMember = {
  userId: number;
  email: string;
  displayName: string;
  role: string;
};

export async function listOrganizationMembers(
  actorUserId: number,
  organizationId: number
): Promise<OrganizationMember[]> {
  await assertAdmin(actorUserId);
  const rows = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      lastName: users.lastName,
      role: teamMembers.role,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, organizationId));
  return rows.map((row) => ({
    userId: row.userId,
    email: row.email,
    displayName: [row.name, row.lastName].filter(Boolean).join(' ') || row.email,
    role: row.role,
  }));
}

/** `null` se nessun utente ha questa email — l'azione chiamante decide il messaggio. */
export async function findUserByEmail(
  actorUserId: number,
  email: string
): Promise<{ id: number; email: string } | null> {
  await assertAdmin(actorUserId);
  const [found] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.email, email.trim().toLowerCase()),
        isNull(users.deletedAt),
        eq(users.isDemo, false)
      )
    )
    .limit(1);
  return found ?? null;
}

/** Idempotente: aggiungere due volte lo stesso membro non crea righe doppie. */
export async function addOrganizationMember(params: {
  actorUserId: number;
  organizationId: number;
  userId: number;
  role?: string;
}): Promise<void> {
  await assertAdmin(params.actorUserId);
  const [existing] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.userId, params.userId),
        eq(teamMembers.teamId, params.organizationId)
      )
    )
    .limit(1);
  if (existing) return;

  const newMember: NewTeamMember = {
    userId: params.userId,
    teamId: params.organizationId,
    role: params.role ?? 'member',
  };
  await db.insert(teamMembers).values(newMember);
}
