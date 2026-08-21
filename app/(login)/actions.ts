'use server';

import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  User,
  users,
  teams,
  teamMembers,
  ActivityType,
  invitations
} from '@/lib/db/schema';
import {
  createSupabaseServer,
  createSupabaseAdmin,
} from '@/lib/auth/supabase';
import { sendWelcomeEmail } from '@/lib/core/email';
import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { attributeReferral } from '@/lib/core/referrals';
import { createCheckoutSession } from '@/lib/payments/stripe';
import { getUser, getUserWithTeam } from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser
} from '@/lib/auth/middleware';
import { dashboardPathForRoles, getUserRoles } from '@/lib/core/auth';
import {
  ageFromBirthDate,
  isEligibleAge,
  MIN_SIGNUP_AGE,
  requiresGuardian
} from '@/lib/core/guardians/age';
import {
  syncDisplayName,
  notifyAdminsOfAthleteRegistration,
  notifyAdminsOfProviderRegistration,
  type SignupRole
} from '@/lib/core/profiles';
import {
  createAccountRecords,
  logActivity,
} from '@/lib/core/auth/account-provisioning';
import { safeRedirectPath } from '@/lib/core/auth/safe-redirect';

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
  // Gli account demo sono readonly: anche il semplice accesso non deve
  // alterare activity_logs quando si entra dal form tradizionale.
  if (!foundUser.isDemo) {
    await logActivity(userWithTeam?.teamId, foundUser.id, ActivityType.SIGN_IN);
  }

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

  // Back to where the user came from (e.g. the coach profile).
  const backTo = safeRedirectPath(redirectTo);
  if (backTo) {
    redirect(backTo);
  }

  const roles = await getUserRoles(foundUser.id);
  redirect(dashboardPathForRoles(roles));
});

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // Mandatory, like the email: the public display name and the invite page's
  // "[Nome] ti invita" both rely on a real first + last name being present.
  name: z.string().trim().min(1, 'Inserisci il tuo nome.').max(100),
  lastName: z.string().trim().min(1, 'Inserisci il tuo cognome.').max(100),
  inviteId: z.string().optional(),
  // Friend-referral code (from /invita/[code]). Unrelated to `inviteId` (team
  // invitations). Never trusted: validated server-side, and its absence or
  // invalidity must never block the signup.
  ref: z.string().optional(),
  // Public signup may only choose athlete / coach / club — never admin.
  role: z.enum(['athlete', 'coach', 'club']).optional(),
  // Required for athletes: the platform is offered from 15 up, and between 15
  // and 17 a guardian has to authorise. Neither rule can be applied without it.
  birthDate: z.string().optional(),
  // Legal: the two required acceptances arrive as 'on' from the checkboxes.
  // Marketing is optional and never blocks registration.
  acceptTerms: z.string().optional(),
  acceptPrivacy: z.string().optional(),
  acceptVexatious: z.string().optional(),
  marketing: z.string().optional()
});

export const signUp = validatedAction(signUpSchema, async (data, formData) => {
  const { email, password, name, lastName, inviteId, role, birthDate } = data;
  const marketing = data.marketing === 'on';

  // Required legal acceptances — enforced server-side too, not just in the UI.
  if (data.acceptTerms !== 'on' || data.acceptPrivacy !== 'on') {
    return {
      error:
        'Per registrarti devi accettare i Termini e dichiarare di aver letto l’Informativa privacy.',
      email,
      password
    };
  }

  // Approvazione specifica ex artt. 1341-1342 c.c.: richiesta solo a chi si
  // registra come professionista, perché solo lì produce un effetto. Verso un
  // consumatore l'art. 36 del Codice del Consumo rende nulle le clausole
  // vessatorie anche se specificamente approvate.
  const isProfessional = role === 'coach' || role === 'club';
  if (isProfessional && data.acceptVexatious !== 'on') {
    return {
      error:
        'Per registrarti come professionista devi approvare specificamente le clausole indicate.',
      email,
      password
    };
  }

  // Age gate. Only athletes declare a birth date — a coach or a club signing
  // up is acting in a professional capacity, not as a young athlete.
  const isAthleteSignup = !role || role === 'athlete';
  let athleteAge: number | null = null;
  if (isAthleteSignup) {
    athleteAge = ageFromBirthDate(birthDate ?? null);
    if (athleteAge == null) {
      return { error: 'Indica la tua data di nascita.', email, password };
    }
    if (athleteAge > 120) {
      return { error: 'Data di nascita non valida.', email, password };
    }
    if (!isEligibleAge(athleteAge)) {
      return {
        error: `KaiPai è riservato agli atleti dai ${MIN_SIGNUP_AGE} anni in su.`,
        email,
        password
      };
    }
  }

  // Who accepted, and from where. Behind Vercel the client address arrives in
  // `x-forwarded-for`; the first entry is the original client.
  const reqHeaders = await headers();
  const signupIp =
    reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    reqHeaders.get('x-real-ip') ||
    null;
  const signupUserAgent = reqHeaders.get('user-agent');

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

  const signupResult = await createAccountRecords({
    authId,
    email,
    name,
    lastName,
    marketing,
    marketplaceRole,
    birthDate: birthDate ?? null,
    isAthleteSignup,
    isProfessional,
    invitation,
    signupIp,
    signupUserAgent,
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

  const { user: createdUser, team: createdTeam } = signupResult;

  // Friend referral attribution — strictly best-effort, AFTER the account is
  // safely committed. The code may come from the form (query param) or the
  // `kp_ref` cookie set when the invite link was opened. It can never block or
  // undo the signup: attributeReferral swallows every error, ignores self- and
  // duplicate-attribution, and no-ops on an invalid/unknown code.
  const cookieStore = await cookies();
  const refCode = data.ref?.trim() || cookieStore.get('kp_ref')?.value || null;
  await attributeReferral({ rawCode: refCode, referredUserId: createdUser.id });
  if (refCode) {
    // Consume the cookie so a later signup in the same browser isn't attributed.
    cookieStore.set('kp_ref', '', { path: '/', maxAge: 0 });
  }

  // 2) Session cookies for the freshly created identity.
  const supabase = await createSupabaseServer();
  await supabase.auth.signInWithPassword({ email, password });

  // Welcome email (best-effort; never blocks the signup).
  await sendWelcomeEmail({
    to: email,
    name: createdUser.name,
    role: marketplaceRole,
    guardianAuthorizationRequired:
      marketplaceRole === 'athlete' && requiresGuardian(athleteAge),
  }).catch(() => {});

  // Admin lifecycle alert: registration is distinct from the later request
  // for review, so an unfinished draft is visible without pretending that it
  // has already been submitted.
  if (marketplaceRole === 'coach') {
    await notifyAdminsOfProviderRegistration(createdUser.id).catch((error) => {
      console.error('Coach registration notification failed:', error);
    });
  }
  if (marketplaceRole === 'athlete') {
    await notifyAdminsOfAthleteRegistration(createdUser.id).catch((error) => {
      console.error('Athlete registration notification failed:', error);
    });
  }

  const redirectTo = formData.get('redirect') as string | null;
  if (redirectTo === 'checkout') {
    const priceId = formData.get('priceId') as string;
    return createCheckoutSession({ team: createdTeam, priceId });
  }

  // Back to where the user came from (e.g. the coach profile to finish
  // the booking request they started).
  const backTo = safeRedirectPath(redirectTo);
  if (backTo) {
    redirect(backTo);
  }

  // New athletes and coaches start the onboarding wizard; everyone else goes
  // straight to their dashboard (their onboarding is already marked complete).
  if (marketplaceRole === 'athlete' || marketplaceRole === 'coach') {
    redirect('/onboarding');
  }

  redirect(
    marketplaceRole ? dashboardPathForRoles([marketplaceRole]) : '/dashboard'
  );
});

export async function signOut() {
  // Il logout non modifica i dati della demo e deve restare sempre accessibile.
  const user = (await getUser({ allowDemoMutation: true })) as User;
  if (user && !user.isDemo) {
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

const resetRequestSchema = z.object({
  email: z.string().email('Indirizzo email non valido')
});

/**
 * Sends the password-reset email via Supabase Auth. Always reports success
 * (no account enumeration). The link lands on /auth/callback which exchanges
 * the code for a session and forwards to the update-password page.
 */
export const requestPasswordReset = validatedAction(
  resetRequestSchema,
  async (data) => {
    const supabase = await createSupabaseServer();
    const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
    await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${baseUrl}/auth/callback?next=/reset-password/update`
    });
    return {
      success:
        'Se l’email è registrata riceverai un link per reimpostare la password. Controlla la posta (anche lo spam).'
    };
  }
);

const resetConfirmSchema = z.object({
  password: z.string().min(8, 'Minimo 8 caratteri').max(100),
  confirmPassword: z.string().min(8).max(100)
});

/** Sets the new password (requires the session created by the email link). */
export const confirmPasswordReset = validatedAction(
  resetConfirmSchema,
  async (data) => {
    if (data.password !== data.confirmPassword) {
      return { error: 'Le password non coincidono.' };
    }

    const supabase = await createSupabaseServer();
    const {
      data: { user: authUser }
    } = await supabase.auth.getUser();
    if (!authUser) {
      return {
        error:
          'Link scaduto o non valido. Richiedi un nuovo link di reimpostazione.'
      };
    }

    const { error } = await supabase.auth.updateUser({
      password: data.password
    });
    if (error) {
      return { error: 'Aggiornamento non riuscito. Richiedi un nuovo link.' };
    }

    // The user already has a valid session: straight to their area.
    const appUser = await getUser();
    const roles = appUser ? await getUserRoles(appUser.id) : [];
    redirect(dashboardPathForRoles(roles));
  }
);

const updateAccountSchema = z.object({
  name: z.string().trim().min(1, 'Il nome è obbligatorio').max(100),
  lastName: z.string().trim().min(1, 'Il cognome è obbligatorio').max(100),
  email: z
    .string()
    .trim()
    .min(1, 'L’email è obbligatoria')
    .email('Indirizzo email non valido')
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
          lastName,
          email,
          updatedBy: user.id
        })
        .where(eq(users.id, user.id)),
      // Public display name (marketplace card, chat, reviews) follows the
      // account name; the email is never shown publicly.
      syncDisplayName(user.id, [name, lastName].filter(Boolean).join(' ')),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT)
    ]);

    return { name, lastName, email, success: 'Account aggiornato.' };
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
