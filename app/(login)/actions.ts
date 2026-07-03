'use server';

import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '@/lib/db/drizzle';
import {
  User,
  users,
  teams,
  teamMembers,
  activityLogs,
  type NewUser,
  type NewTeam,
  type NewTeamMember,
  type NewActivityLog,
  ActivityType,
  invitations
} from '@/lib/db/schema';
import {
  createSupabaseServer,
  createSupabaseAdmin,
} from '@/lib/auth/supabase';
import { sendWelcomeEmail } from '@/lib/core/email';
import { redirect } from 'next/navigation';
import { createCheckoutSession } from '@/lib/payments/stripe';
import { getUser, getUserWithTeam } from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser
} from '@/lib/auth/middleware';
import { dashboardPathForRoles, getUserRoles } from '@/lib/core/auth';
import {
  ensureProfile,
  provisionMarketplaceRole,
  type SignupRole
} from '@/lib/core/profiles';

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  exec: DbOrTx = db
) {
  if (teamId === null || teamId === undefined) {
    return;
  }
  const newActivity: NewActivityLog = {
    teamId,
    userId,
    action: type,
    ipAddress: ''
  };
  await exec.insert(activityLogs).values(newActivity);
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100)
});

export const signIn = validatedAction(signInSchema, async (data, formData) => {
  const { email, password } = data;

  // Supabase Auth owns the credentials; a successful call also sets the
  // session cookies for this response.
  const supabase = await createSupabaseServer();
  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (authError || !authData.user) {
    return {
      error: 'Email o password non corretti. Riprova.',
      email,
      password
    };
  }

  // App profile row, linked by auth_id (self-heal legacy rows by email).
  let [foundUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.authId, authData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (!foundUser) {
    const [byEmail] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    if (byEmail && !byEmail.authId) {
      await db
        .update(users)
        .set({ authId: authData.user.id })
        .where(eq(users.id, byEmail.id));
      foundUser = { ...byEmail, authId: authData.user.id };
    }
  }

  if (!foundUser) {
    await supabase.auth.signOut();
    return {
      error: 'Account non trovato. Contatta il supporto.',
      email,
      password
    };
  }

  const userWithTeam = await getUserWithTeam(foundUser.id);
  await logActivity(userWithTeam?.teamId, foundUser.id, ActivityType.SIGN_IN);

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string;
    const [team] = userWithTeam?.teamId
      ? await db
          .select()
          .from(teams)
          .where(eq(teams.id, userWithTeam.teamId))
          .limit(1)
      : [null];
    return createCheckoutSession({ team: team ?? null, priceId });
  }

  const roles = await getUserRoles(foundUser.id);
  redirect(dashboardPathForRoles(roles));
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  inviteId: z.string().optional(),
  // Public signup may only choose athlete / coach / club — never admin.
  role: z.enum(['athlete', 'coach', 'club']).optional()
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, inviteId, role } = data;

  const existingUser = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingUser.length > 0) {
    return {
      error:
        'Esiste già un account con questa email. Accedi oppure usa un’altra email.',
      email,
      password
    };
  }

  // Validate any invitation up-front (read-only) so we never create a user for
  // an invalid/expired invite.
  let invitation: typeof invitations.$inferSelect | null = null;
  if (inviteId) {
    [invitation] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, parseInt(inviteId)),
          eq(invitations.email, email),
          eq(invitations.status, 'pending')
        )
      )
      .limit(1);

    if (!invitation) {
      return { error: 'Invito non valido o scaduto.', email, password };
    }
  }

  // 1) Identity in Supabase Auth. Created via the admin API with the email
  //    marked confirmed (double-opt-in can be enabled later from the Supabase
  //    dashboard without code changes).
  const admin = createSupabaseAdmin();
  const { data: createdAuth, error: authError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

  if (authError || !createdAuth.user) {
    console.error('Supabase signUp failed:', authError);
    const duplicate = authError?.message?.toLowerCase().includes('already');
    return {
      error: duplicate
        ? 'Esiste già un account con questa email. Accedi oppure usa un’altra email.'
        : 'Creazione account non riuscita. Riprova.',
      email,
      password
    };
  }
  const authId = createdAuth.user.id;

  // Standard signups pick a marketplace role; invited members get a base
  // profile only (their marketplace role is managed within the club).
  const marketplaceRole: SignupRole | null = invitation ? null : role ?? 'athlete';

  // All writes run in a single transaction so a partial failure never leaves
  // orphaned user / team / profile rows behind.
  const signupResult = await db
    .transaction(async (tx) => {
      const newUser: NewUser = { email, authId, role: 'owner' };
      const [createdUser] = await tx.insert(users).values(newUser).returning();

      let teamId: number;
      let userRole: string;
      let team: typeof teams.$inferSelect;

      if (invitation) {
        teamId = invitation.teamId;
        userRole = invitation.role;
        await tx
          .update(invitations)
          .set({ status: 'accepted' })
          .where(eq(invitations.id, invitation.id));
        await logActivity(teamId, createdUser.id, ActivityType.ACCEPT_INVITATION, tx);
        [team] = await tx
          .select()
          .from(teams)
          .where(eq(teams.id, teamId))
          .limit(1);
      } else {
        const newTeam: NewTeam = { name: `${email}'s Team` };
        [team] = await tx.insert(teams).values(newTeam).returning();
        teamId = team.id;
        userRole = 'owner';
        await logActivity(teamId, createdUser.id, ActivityType.CREATE_TEAM, tx);
      }

      const newTeamMember: NewTeamMember = {
        userId: createdUser.id,
        teamId,
        role: userRole
      };
      await tx.insert(teamMembers).values(newTeamMember);
      await logActivity(teamId, createdUser.id, ActivityType.SIGN_UP, tx);

      if (marketplaceRole) {
        await provisionMarketplaceRole(
          createdUser.id,
          marketplaceRole,
          { email },
          tx
        );
      } else {
        await ensureProfile(createdUser.id, undefined, tx);
      }

      return { user: createdUser, team };
    })
    .catch((error) => {
      console.error('Sign-up transaction failed:', error);
      return null;
    });

  if (!signupResult) {
    // Roll back the Auth identity so a retry with the same email works.
    await admin.auth.admin.deleteUser(authId).catch(() => {});
    return {
      error: 'Creazione account non riuscita. Riprova.',
      email,
      password
    };
  }

  const { team: createdTeam } = signupResult;

  // 2) Session cookies for the freshly created identity.
  const supabase = await createSupabaseServer();
  await supabase.auth.signInWithPassword({ email, password });

  // Welcome email (best-effort; never blocks the signup).
  await sendWelcomeEmail({ to: email }).catch(() => {});

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string;
    return createCheckoutSession({ team: createdTeam, priceId });
  }

  redirect(
    marketplaceRole ? dashboardPathForRoles([marketplaceRole]) : '/dashboard'
  );
});

export async function signOut() {
  const user = (await getUser()) as User;
  if (user) {
    const userWithTeam = await getUserWithTeam(user.id);
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT);
  }
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100)
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    // Verify the current password against Supabase Auth.
    const supabase = await createSupabaseServer();
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    });

    if (verifyError) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'La password attuale non è corretta.'
      };
    }

    if (currentPassword === newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'La nuova password deve essere diversa da quella attuale.'
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'La nuova password e la conferma non coincidono.'
      };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (updateError) {
      return {
        currentPassword,
        newPassword,
        confirmPassword,
        error: 'Aggiornamento password non riuscito. Riprova.'
      };
    }

    const userWithTeam = await getUserWithTeam(user.id);
    await logActivity(
      userWithTeam?.teamId,
      user.id,
      ActivityType.UPDATE_PASSWORD
    );

    return {
      success: 'Password aggiornata.'
    };
  }
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100)
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const supabase = await createSupabaseServer();
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password
    });
    if (verifyError) {
      return {
        password,
        error: 'Password non corretta. Eliminazione annullata.'
      };
    }

    const userWithTeam = await getUserWithTeam(user.id);

    await logActivity(
      userWithTeam?.teamId,
      user.id,
      ActivityType.DELETE_ACCOUNT
    );

    // Soft delete
    await db
      .update(users)
      .set({
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-deleted')` // Ensure email uniqueness
      })
      .where(eq(users.id, user.id));

    if (userWithTeam?.teamId) {
      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, user.id),
            eq(teamMembers.teamId, userWithTeam.teamId)
          )
        );
    }

    // Remove the Supabase Auth identity and end the session.
    if (user.authId) {
      await createSupabaseAdmin()
        .auth.admin.deleteUser(user.authId)
        .catch(() => {});
    }
    await supabase.auth.signOut();
    redirect('/sign-in');
  }
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Il nome è obbligatorio').max(100),
  lastName: z.string().max(100).optional(),
  email: z.string().email('Indirizzo email non valido')
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, lastName, email } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    // Keep the Supabase Auth identity in sync when the email changes.
    if (email !== user.email && user.authId) {
      const { error } = await createSupabaseAdmin().auth.admin.updateUserById(
        user.authId,
        { email, email_confirm: true }
      );
      if (error) {
        return {
          name,
          lastName,
          error: 'Email non aggiornabile (forse è già in uso).'
        };
      }
    }

    await Promise.all([
      db
        .update(users)
        .set({
          name,
          lastName: lastName?.trim() || null,
          email,
          updatedBy: user.id
        })
        .where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT)
    ]);

    return { name, lastName, success: 'Account aggiornato.' };
  }
);

const removeTeamMemberSchema = z.object({
  memberId: z.number()
});

export const removeTeamMember = validatedActionWithUser(
  removeTeamMemberSchema,
  async (data, _, user) => {
    const { memberId } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'L’utente non fa parte di un’organizzazione' };
    }

    await db
      .delete(teamMembers)
      .where(
        and(
          eq(teamMembers.id, memberId),
          eq(teamMembers.teamId, userWithTeam.teamId)
        )
      );

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.REMOVE_TEAM_MEMBER
    );

    return { success: 'Membro rimosso.' };
  }
);

const inviteTeamMemberSchema = z.object({
  email: z.string().email('Indirizzo email non valido'),
  role: z.enum(['member', 'owner'])
});

export const inviteTeamMember = validatedActionWithUser(
  inviteTeamMemberSchema,
  async (data, _, user) => {
    const { email, role } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    if (!userWithTeam?.teamId) {
      return { error: 'L’utente non fa parte di un’organizzazione' };
    }

    const existingMember = await db
      .select()
      .from(users)
      .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
      .where(
        and(eq(users.email, email), eq(teamMembers.teamId, userWithTeam.teamId))
      )
      .limit(1);

    if (existingMember.length > 0) {
      return { error: 'L’utente fa già parte dell’organizzazione' };
    }

    // Check if there's an existing invitation
    const existingInvitation = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          eq(invitations.teamId, userWithTeam.teamId),
          eq(invitations.status, 'pending')
        )
      )
      .limit(1);

    if (existingInvitation.length > 0) {
      return { error: 'Un invito è già stato inviato a questa email' };
    }

    // Create a new invitation
    await db.insert(invitations).values({
      teamId: userWithTeam.teamId,
      email,
      role,
      invitedBy: user.id,
      status: 'pending'
    });

    await logActivity(
      userWithTeam.teamId,
      user.id,
      ActivityType.INVITE_TEAM_MEMBER
    );

    // TODO: Send invitation email and include ?inviteId={id} to sign-up URL
    // await sendInvitationEmail(email, userWithTeam.team.name, role)

    return { success: 'Invitation sent successfully' };
  }
);
