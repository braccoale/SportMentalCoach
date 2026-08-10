import { submitContactMessage } from '@/lib/core/contact';

/**
 * Form contatti della landing. Endpoint pubblico e volutamente anonimo: chi
 * scrive non ha un account, quindi non c'e' sessione da controllare. La difesa
 * dagli abusi sta a valle (campo esca + limite per indirizzo), non in un
 * controllo di autenticazione che qui non avrebbe senso.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  const body = (payload ?? {}) as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === 'string' ? value : '');

  const result = await submitContactMessage({
    name: str(body.name),
    email: str(body.email),
    subject: str(body.subject),
    message: str(body.message),
    privacyAccepted: body.privacyAccepted === true,
    website: str(body.website),
  });

  if (!result.ok) {
    return Response.json(
      { error: result.error, field: result.field ?? null },
      { status: 400 }
    );
  }

  return Response.json({ ok: true });
}
