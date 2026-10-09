import { matchCoaches } from '@/lib/core/coach-match';
import { createRateLimiter } from '@/lib/core/coach-match/rate-limit';

/**
 * «Aiutami a scegliere»: riceve le risposte del wizard e restituisce i coach
 * più adatti. Pubblico di proposito (chi cerca un coach spesso non ha un
 * account), quindi protetto da un limite per indirizzo e dal tetto sulla
 * lunghezza del testo. Le risposte non vengono salvate.
 */
const limiter = createRateLimiter(8, 10 * 60 * 1000);
const MAX_BODY_CHARS = 8_000;

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'sconosciuto';
  if (!limiter.allow(ip, Date.now())) {
    return Response.json(
      { error: 'Hai fatto molte ricerche in poco tempo. Riprova fra qualche minuto.' },
      { status: 429 }
    );
  }

  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_CHARS) {
      return Response.json({ error: 'Richiesta troppo grande.' }, { status: 413 });
    }
    payload = JSON.parse(text);
  } catch {
    return Response.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  try {
    return Response.json(await matchCoaches(payload));
  } catch (error) {
    console.error('[coach-match] errore:', error instanceof Error ? error.message : 'errore');
    return Response.json(
      { error: 'Non siamo riusciti a cercare i coach. Riprova fra poco.' },
      { status: 500 }
    );
  }
}
