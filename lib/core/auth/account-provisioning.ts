import 'server-only';
import { eq } from 'drizzle-orm';
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
  invitations,
  clientProfiles,
} from '@/lib/db/schema';
import { recordPlatformTermsAcceptance } from '@/lib/core/legal/acceptance';
import { ensureOnboarding } from '@/lib/core/onboarding';
import {
  ensureProfile,
  provisionMarketplaceRole,
  type SignupRole,
} from '@/lib/core/profiles';

/**
 * Come nasce un account, indipendentemente da come e' entrata la persona.
 *
 * **Perche' questo file esiste, e non e' un dettaglio di organizzazione.**
 * Queste funzioni vivevano dentro `app/(login)/actions.ts`, che porta in cima
 * `'use server'`. In un file cosi' **ogni funzione esportata diventa un
 * indirizzo raggiungibile dalla rete**: esportare da li' "crea un account"
 * per riusarla nel percorso Google avrebbe pubblicato la creazione di account
 * come endpoint. Qui l'esportazione e' una normale importazione fra moduli del
 * server, e `server-only` impedisce che finisca in un bundle del browser.
 */


export async function logActivity(
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

/**
 * Le scritture che trasformano un'identita' verificata in un account KaiPai.
 *
 * Estratta da `signUp` quando e' arrivato l'accesso con Google, e per un
 * motivo preciso: **un secondo percorso di registrazione che scrive le stesse
 * tabelle a modo suo e' il difetto che questo progetto ha gia' pagato piu'
 * volte.** Chi entra con la password e chi entra con Google devono ottenere lo
 * stesso account, la stessa prova del consenso e lo stesso stato di
 * onboarding; l'unica differenza legittima e' **da dove arriva l'identita'**,
 * e quella e' gia' decisa prima di arrivare qui.
 *
 * Tutto in una transazione sola: un fallimento a meta' lascerebbe un utente
 * senza squadra, o un account senza la riga che dimostra il consenso.
 * Restituisce `null` se qualcosa e' andato storto, e sta a chi chiama disfare
 * l'identita' su Auth.
 */
export async function createAccountRecords(params: {
  authId: string;
  email: string;
  name: string;
  lastName: string;
  marketing: boolean;
  marketplaceRole: SignupRole | null;
  birthDate: string | null;
  isAthleteSignup: boolean;
  isProfessional: boolean;
  invitation: typeof invitations.$inferSelect | null;
  signupIp: string | null;
  signupUserAgent: string | null;
}): Promise<{ user: User; team: typeof teams.$inferSelect } | null> {
  const {
    authId,
    email,
    name,
    lastName,
    marketing,
    marketplaceRole,
    birthDate,
    isAthleteSignup,
    isProfessional,
    invitation,
    signupIp,
    signupUserAgent,
  } = params;

  // Il nome per intero serve al profilo pubblico e allo slug del coach: si
  // ricompone qui perche' nome e cognome arrivano separati da entrambi i
  // percorsi, e cosi' non puo' divergere fra i due.
  const fullName = `${name} ${lastName}`.trim();

  return db
    .transaction(async (tx) => {
      const newUser: NewUser = {
        email,
        authId,
        role: 'owner',
        name,
        lastName,
        marketingConsent: marketing,
        marketingConsentAt: marketing ? new Date() : null
      };
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
          { email, displayName: fullName },
          tx
        );
      } else {
        await ensureProfile(createdUser.id, fullName, tx);
      }

      // Proof of acceptance, written in the same transaction as the account:
      // an account that exists without a matching acceptance row would be one
      // we cannot show anyone agreed to anything.
      await recordPlatformTermsAcceptance(
        createdUser.id,
        {
          ipAddress: signupIp,
          userAgent: signupUserAgent,
          acceptedVexatious: isProfessional,
        },
        tx
      );

      // Persist the declared birth date: the guardian gate reads it back from
      // the athlete profile, so it has to land in the same transaction that
      // creates the account rather than waiting for a profile edit.
      if (isAthleteSignup && birthDate) {
        await tx
          .insert(clientProfiles)
          .values({ userId: createdUser.id, birthDate, createdBy: createdUser.id })
          .onConflictDoUpdate({
            target: clientProfiles.userId,
            set: { birthDate, updatedAt: new Date() }
          });
      }

      // Onboarding state. Athletes and coaches go through the initial wizard;
      // club (and invited members) keep the current flow for now and are marked
      // complete so nothing gates their dashboard.
      await ensureOnboarding(
        createdUser.id,
        marketplaceRole === 'athlete' || marketplaceRole === 'coach'
          ? 'in_progress'
          : 'completed',
        tx
      );

      return { user: createdUser, team };
    })
    .catch((error) => {
      console.error('Sign-up transaction failed:', error);
      return null;
    });

}

