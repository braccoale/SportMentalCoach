import { NextResponse } from 'next/server';
import { hasRole } from '@/lib/core/auth';
import { buildVideoKey, validateVideo } from '@/lib/core/coach-video-upload';
import { createMediaSignedUpload } from '@/lib/core/storage';
import { getUser } from '@/lib/db/queries';

/**
 * Prepara il caricamento diretto del video di presentazione.
 *
 * Il video non passa da qui: una funzione Vercel non accetta richieste oltre i
 * 4,5 MB. Questa rotta controlla chi chiede (un coach) e cosa vuole caricare
 * (tipo, peso e durata dichiarati), sceglie lei il percorso del file e
 * restituisce un indirizzo firmato su cui il browser carica direttamente su
 * Supabase Storage. Il peso vero lo fa rispettare lo storage.
 *
 * Senza Supabase configurato (sviluppo locale) risponde `mode: 'proxy'` e il
 * browser ripiega sul caricamento tramite il server.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  if (!(await hasRole(user.id, 'coach'))) {
    return NextResponse.json({ error: 'Solo i coach possono caricare un video.' }, { status: 403 });
  }

  let body: { type?: unknown; size?: unknown; durationSec?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }
  const type = typeof body.type === 'string' ? body.type : '';
  const size = typeof body.size === 'number' ? body.size : Number.NaN;
  const durationSec = typeof body.durationSec === 'number' ? body.durationSec : null;

  const check = validateVideo({ type, size, durationSec });
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  try {
    const key = buildVideoKey(user.id, Date.now(), type);
    const upload = await createMediaSignedUpload(key);
    if (!upload) return NextResponse.json({ mode: 'proxy' });
    return NextResponse.json({
      mode: 'direct',
      signedUrl: upload.signedUrl,
      publicUrl: upload.publicUrl,
    });
  } catch (error) {
    console.error('[coach-video] indirizzo di caricamento non creato', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Non riusciamo a preparare il caricamento. Riprova.' }, { status: 500 });
  }
}
