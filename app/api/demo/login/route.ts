import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { userRoles, users } from '@/lib/db/schema';
import {
  createSupabaseAdmin,
  createSupabaseServer,
} from '@/lib/auth/supabase';
import {
  DEMO_LOGIN_ACCOUNTS,
  isInteractiveDemoIdentity,
  parseDemoLoginRole,
} from '@/lib/auth/demo-login';

const buckets = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 8;

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}

function requestKey(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function withinRateLimit(key: string, now = Date.now()): boolean {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= MAX_ATTEMPTS) return false;
  current.count += 1;
  return true;
}

/** Login pubblico dei soli due account demo interattivi, senza password client. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return Response.json({ error: 'Richiesta non consentita.' }, { status: 403 });
  }
  if (!withinRateLimit(requestKey(request))) {
    return Response.json(
      { error: 'Troppi accessi ravvicinati. Riprova tra un minuto.' },
      { status: 429 }
    );
  }

  const body = (await request.json().catch(() => null)) as { role?: unknown } | null;
  const role = parseDemoLoginRole(body?.role);
  if (!role) {
    return Response.json({ error: 'Ruolo demo non valido.' }, { status: 400 });
  }

  const account = DEMO_LOGIN_ACCOUNTS[role];
  const [appUser] = await db
    .select({ id: users.id, authId: users.authId, email: users.email })
    .from(users)
    .innerJoin(
      userRoles,
      and(eq(userRoles.userId, users.id), eq(userRoles.roleKey, role))
    )
    .where(
      and(
        eq(users.email, account.email),
        eq(users.isDemo, true),
        isNull(users.deletedAt)
      )
    )
    .limit(1);

  if (!appUser?.authId) {
    return Response.json(
      { error: 'Account demo temporaneamente non disponibile.' },
      { status: 503 }
    );
  }

  const admin = createSupabaseAdmin();
  const { data: identityData, error: identityError } =
    await admin.auth.admin.getUserById(appUser.authId);
  if (
    identityError ||
    !identityData.user ||
    !isInteractiveDemoIdentity(identityData.user, role)
  ) {
    return Response.json(
      { error: 'Identità demo non valida.' },
      { status: 503 }
    );
  }

  // Admin genera il token monouso ma non invia email. Il token resta sul
  // server e viene scambiato subito con una sessione cookie-aware.
  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: account.email,
    });
  const tokenHash = linkData.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return Response.json(
      { error: 'Accesso demo non riuscito. Riprova tra poco.' },
      { status: 503 }
    );
  }

  const supabase = await createSupabaseServer();
  const { data: sessionData, error: sessionError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  });
  if (
    sessionError ||
    !sessionData.user ||
    sessionData.user.id !== appUser.authId ||
    !isInteractiveDemoIdentity(sessionData.user, role)
  ) {
    await supabase.auth.signOut();
    return Response.json(
      { error: 'Accesso demo non riuscito. Riprova tra poco.' },
      { status: 503 }
    );
  }

  return Response.json({ ok: true, destination: account.destination });
}
