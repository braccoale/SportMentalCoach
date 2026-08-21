import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { createSupabaseServer } from '@/lib/auth/supabase';
import { safeRedirectPath } from '@/lib/core/auth/safe-redirect';
import { SIGNUP_ROLE_COOKIE } from '@/lib/core/auth/signup-role-cookie';
import { CompleteSignupForm } from './complete-form';

export const dynamic = 'force-dynamic';

/**
 * Il ritorno da Google.
 *
 * Google ci dà un'identità verificata, un'email e un nome. Non ci dà il ruolo,
 * non la data di nascita e soprattutto **non i consensi**: senza quelli non si
 * può creare un account, e non per scrupolo formale — è la data di nascita che
 * decide se davanti c'è un minore per cui serve l'autorizzazione di un tutore.
 * Quindi qui non si «finisce una registrazione»: si fa la parte che un
 * fornitore d'identità non potrà mai fare al posto nostro.
 *
 * La stessa pagina serve chi entra e chi si registra, e la distinzione non è
 * un parametro ma un fatto: **esiste già una riga in `users` per questa
 * identità?** Se sì è un accesso e si tira dritto. Se no, l'account
 * applicativo non c'è ancora — o non c'è mai stato, o qualcuno ha abbandonato
 * questa pagina a metà la volta scorsa, e in entrambi i casi la risposta è la
 * stessa.
 */
export default async function CompletaRegistrazionePage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const backTo = safeRedirectPath(params.redirect ?? null);

  const supabase = await createSupabaseServer();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  // Nessuna sessione: qui non ci si arriva digitando l'indirizzo.
  if (!authUser) {
    redirect('/sign-in');
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.authId, authUser.id), isNull(users.deletedAt)))
    .limit(1);

  // Account già completo: era un accesso, non una registrazione.
  if (existing) {
    redirect(backTo ?? '/dashboard');
  }

  const cookieStore = await cookies();
  const presetRole = cookieStore.get(SIGNUP_ROLE_COOKIE)?.value ?? '';

  const metadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
  const asText = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

  // Google manda `given_name`/`family_name` quando li ha; `full_name` è il
  // ripiego, e va spezzato perché da noi nome e cognome sono due colonne.
  const fullName = asText(metadata.full_name) || asText(metadata.name);
  const spaceIndex = fullName.lastIndexOf(' ');
  const fallbackFirst =
    spaceIndex > 0 ? fullName.slice(0, spaceIndex) : fullName;
  const fallbackLast = spaceIndex > 0 ? fullName.slice(spaceIndex + 1) : '';

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <CompleteSignupForm
          email={authUser.email ?? ''}
          presetRole={presetRole}
          presetName={asText(metadata.given_name) || fallbackFirst}
          presetLastName={asText(metadata.family_name) || fallbackLast}
          redirectTo={backTo}
        />
      </div>
    </main>
  );
}
