'use server';

import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { createSupabaseServer } from '@/lib/auth/supabase';
import { validatedAction } from '@/lib/auth/middleware';
import { safeRedirectPath } from '@/lib/core/auth/safe-redirect';
import {
  ageFromBirthDate,
  isEligibleAge,
  MIN_SIGNUP_AGE,
} from '@/lib/core/guardians/age';
import { attributeReferral } from '@/lib/core/referrals';
import { sendWelcomeEmail } from '@/lib/core/email';
import {
  notifyAdminsOfAthleteRegistration,
  notifyAdminsOfProviderRegistration,
  type SignupRole,
} from '@/lib/core/profiles';
import { createAccountRecords } from '@/lib/core/auth/account-provisioning';
import { SIGNUP_ROLE_COOKIE } from '@/lib/core/auth/signup-role-cookie';

/**
 * La seconda meta' di una registrazione con Google.
 *
 * La prima meta' l'ha fatta Google: l'identita' esiste gia' su Supabase Auth e
 * la sessione e' aperta. Qui non si crea nessuna identita' — si creano le righe
 * applicative, con **le stesse identiche scritture** della registrazione con
 * password, perche' `createAccountRecords` e' la stessa funzione.
 *
 * Le verifiche di merito sono ripetute qui e non solo nel modulo: la spunta di
 * un consenso e una data di nascita sono campi di un modulo, e un modulo si
 * riscrive. Un minore di quindici anni non deve poter entrare cambiando un
 * valore prima di premere invio.
 */

const completeSchema = z.object({
  name: z.string().trim().min(1, 'Inserisci il tuo nome.').max(100),
  lastName: z.string().trim().min(1, 'Inserisci il tuo cognome.').max(100),
  role: z.enum(['athlete', 'coach', 'club']).optional(),
  birthDate: z.string().optional(),
  acceptTerms: z.string().optional(),
  acceptPrivacy: z.string().optional(),
  acceptVexatious: z.string().optional(),
  marketing: z.string().optional(),
  redirect: z.string().optional(),
});

export const completeGoogleSignup = validatedAction(
  completeSchema,
  async (data) => {
    const supabase = await createSupabaseServer();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    // Senza sessione non c'e' identita' da completare. Non e' un errore da
    // mostrare: e' una pagina raggiunta fuori dal suo flusso.
    if (!authUser?.email) {
      redirect('/sign-in');
    }

    const email = authUser.email;

    // Gia' completata — due invii dello stesso modulo, o un ritorno indietro
    // del browser. Il secondo non deve creare un secondo account.
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.authId, authUser.id), isNull(users.deletedAt)))
      .limit(1);
    if (existing) {
      redirect('/dashboard');
    }

    if (data.acceptTerms !== 'on' || data.acceptPrivacy !== 'on') {
      return {
        error:
          'Per registrarti devi accettare i Termini e dichiarare di aver letto l’Informativa privacy.',
      };
    }

    const role = data.role;
    const isProfessional = role === 'coach' || role === 'club';
    if (isProfessional && data.acceptVexatious !== 'on') {
      return {
        error:
          'Per registrarti come professionista devi approvare specificamente le clausole indicate.',
      };
    }

    const isAthleteSignup = !role || role === 'athlete';
    if (isAthleteSignup) {
      const age = ageFromBirthDate(data.birthDate ?? null);
      if (age == null) return { error: 'Indica la tua data di nascita.' };
      if (age > 120) return { error: 'Data di nascita non valida.' };
      if (!isEligibleAge(age)) {
        return {
          error: `KaiPai è riservato agli atleti dai ${MIN_SIGNUP_AGE} anni in su.`,
        };
      }
    }

    // Un'email gia' presente su un altro account applicativo. Con il
    // collegamento automatico di Supabase e' un caso raro — richiede un
    // account il cui `auth_id` non corrisponde a questa identita' — ma senza
    // questo controllo diventerebbe una violazione di vincolo, cioe' un
    // errore che l'utente non puo' interpretare.
    const [sameEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    if (sameEmail) {
      return {
        error:
          'Esiste già un account con questa email. Accedi con la password che avevi scelto.',
      };
    }

    const requestHeaders = await headers();
    const signupIp =
      requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      requestHeaders.get('x-real-ip') ||
      null;

    const marketplaceRole: SignupRole = (role ?? 'athlete') as SignupRole;

    const result = await createAccountRecords({
      authId: authUser.id,
      email,
      name: data.name,
      lastName: data.lastName,
      marketing: data.marketing === 'on',
      marketplaceRole,
      birthDate: data.birthDate ?? null,
      isAthleteSignup,
      isProfessional,
      // L'invito di squadra non passa da qui: chi arriva da un invito segue il
      // proprio collegamento, che porta al modulo con email e password.
      invitation: null,
      signupIp,
      signupUserAgent: requestHeaders.get('user-agent'),
    });

    if (!result) {
      // A differenza della registrazione con password, l'identita' su Auth
      // **non** si cancella: e' di Google, l'utente e' autenticato davvero, e
      // togliergliela lo lascerebbe fuori senza motivo. Puo' semplicemente
      // ripresentare il modulo.
      return { error: 'Creazione account non riuscita. Riprova.' };
    }

    const cookieStore = await cookies();
    cookieStore.set(SIGNUP_ROLE_COOKIE, '', { path: '/', maxAge: 0 });

    // Attribuzione dell'invito fra amici: sempre dopo il commit, e non puo'
    // mai bloccare la registrazione.
    const refCode = cookieStore.get('kp_ref')?.value || null;
    await attributeReferral({ rawCode: refCode, referredUserId: result.user.id });
    if (refCode) {
      cookieStore.set('kp_ref', '', { path: '/', maxAge: 0 });
    }

    await sendWelcomeEmail({
      to: email,
      name: result.user.name,
      role: marketplaceRole,
    }).catch(() => {});

    if (marketplaceRole === 'coach') {
      await notifyAdminsOfProviderRegistration(result.user.id).catch((error) => {
        console.error('Coach registration notification failed:', error);
      });
    }
    if (marketplaceRole === 'athlete') {
      await notifyAdminsOfAthleteRegistration(result.user.id).catch((error) => {
        console.error('Athlete registration notification failed:', error);
      });
    }

    const backTo = safeRedirectPath(data.redirect ?? null);
    if (backTo) {
      redirect(backTo);
    }

    redirect('/onboarding');
  }
);
