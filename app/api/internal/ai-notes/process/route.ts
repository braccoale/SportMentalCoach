import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import {
  processAiNotesBatch,
  recoverStaleAiProcessingJobs,
} from '@/lib/core/ai-session-notes/processing';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';

export const dynamic = 'force-dynamic';
/**
 * Tetto del piano Hobby. Il worker è ripartibile per segmento fisico
 * (`transcribeParticipantRecording` salta ciò che è già trascritto), quindi
 * un timeout non perde lavoro: la corsa successiva riprende da dove era.
 */
export const maxDuration = 60;

/**
 * Esecuzione del worker AI Session Notes, invocabile dal cron Vercel o a mano.
 *
 * Gira dentro Vercel perché è l'unico ambiente che ha le credenziali dello
 * storage audio. L'accesso è protetto da `CRON_SECRET`: senza quel segreto la
 * rotta non è distinguibile da una 404 per chi la sonda dall'esterno.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  // Lunghezze diverse fanno fallire timingSafeEqual: confronta prima quelle.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Sul piano Hobby il cron scatta una volta al giorno: conviene provare a
 * svuotare la coda, non un job solo. Se il tetto dei 60 secondi arriva prima,
 * i job già completati restano tali e il resto riparte alla corsa successiva.
 */
const DEFAULT_LIMIT = 5;

function requestedLimit(request: Request): number {
  const raw = new URL(request.url).searchParams.get('limit');
  if (raw === null) return DEFAULT_LIMIT;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 20 ? value : DEFAULT_LIMIT;
}

async function drainQueue(workerId: string, limit: number) {
  const dependencies = createProductionAiSessionNotesDependencies();
  const recovered = await recoverStaleAiProcessingJobs({ limit });
  const processed = await processAiNotesBatch({ workerId, limit }, dependencies);
  return { recovered, ...processed };
}

async function runWorker(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return new Response('Not found', { status: 404 });
  }

  const limit = requestedLimit(request);
  const workerId = `vercel-${Date.now().toString(36)}`;

  // La sveglia dal webhook non può restare in attesa della trascrizione: chi
  // chiama riceve subito 202 e il lavoro prosegue dopo la risposta. Il cron
  // usa invece la modalità sincrona, così l'esito resta osservabile nei log.
  if (new URL(request.url).searchParams.get('mode') === 'async') {
    after(async () => {
      try {
        const result = await drainQueue(workerId, limit);
        console.log('ai-notes worker done', { workerId, ...result });
      } catch (error) {
        console.error('ai-notes worker failed', { workerId }, error);
      }
    });
    return Response.json({ workerId, limit, mode: 'async' }, { status: 202 });
  }

  try {
    return Response.json({ workerId, limit, ...(await drainQueue(workerId, limit)) });
  } catch (error) {
    // Il messaggio del provider non viene mai propagato al chiamante.
    console.error('ai-notes worker failed', { workerId }, error);
    return Response.json({ workerId, error: 'WORKER_FAILED' }, { status: 500 });
  }
}

/** Il cron di Vercel invoca in GET. */
export function GET(request: Request): Promise<Response> {
  return runWorker(request);
}

/** Invocazione manuale, utile fra un'esecuzione pianificata e l'altra. */
export function POST(request: Request): Promise<Response> {
  return runWorker(request);
}
