import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { after } from 'next/server';
import {
  countReadyAiNotesJobs,
  enqueueReadySessionCompassJobs,
  processAiNotesBatch,
  recoverStaleAiProcessingJobs,
  recoverStaleTranscriptionRequests,
} from '@/lib/core/ai-session-notes/processing';
import { closeExpiredAiNotesSessions } from '@/lib/core/ai-session-notes/maintenance';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';
import { triggerAiNotesWorker } from '@/lib/core/ai-session-notes/worker-trigger';

export const dynamic = 'force-dynamic';
/**
 * Tetto del piano Hobby.
 *
 * Non è più un vincolo sulla durata delle sessioni: il worker consegna la
 * trascrizione al provider e si ritira, quindi l'invocazione dura circa un
 * secondo qualunque sia la lunghezza dell'audio. Resta ripartibile per
 * segmento — ciò che è già trascritto o già consegnato viene saltato — così
 * un timeout non perde lavoro.
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

/**
 * Quante volte il worker puo' richiamarsi da solo.
 *
 * Un'invocazione smaltisce al massimo `limit` job e poi muore: su Vercel non
 * c'e' un processo che resti in ascolto. Se la coda non e' vuota, l'ultima
 * cosa che fa e' svegliare il proprio successore. Il tetto esiste perche' un
 * difetto che lasciasse un job perennemente pronto non deve trasformarsi in
 * una catena infinita di invocazioni.
 */
const MAX_CHAIN_DEPTH = 6;

function requestedChain(request: Request): number {
  const raw = new URL(request.url).searchParams.get('chain');
  if (raw === null) return MAX_CHAIN_DEPTH;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= MAX_CHAIN_DEPTH
    ? value
    : MAX_CHAIN_DEPTH;
}

/**
 * Passa il testimone se resta lavoro pronto.
 *
 * Best effort come tutte le sveglie: se fallisce, restano il webhook, la
 * pagina aperta e il cron.
 */
async function chainIfWorkRemains(origin: string, chain: number): Promise<void> {
  if (chain <= 0) return;
  if ((await countReadyAiNotesJobs()) === 0) return;
  await triggerAiNotesWorker(
    (input, init) =>
      fetch(
        typeof input === 'string' && input.includes('?')
          ? `${input}&chain=${chain - 1}`
          : `${input}?chain=${chain - 1}`,
        init
      ),
    origin
  ).catch(() => {});
}

function requestedLimit(request: Request): number {
  const raw = new URL(request.url).searchParams.get('limit');
  if (raw === null) return DEFAULT_LIMIT;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 20 ? value : DEFAULT_LIMIT;
}

async function drainQueue(workerId: string, limit: number) {
  const dependencies = createProductionAiSessionNotesDependencies();
  // Prima di trattare la coda si chiudono le sessioni dimenticate aperte:
  // finché restano `active` continuano a registrare e a produrre audio che
  // nessuno ha chiesto.
  const expiredClosed = await closeExpiredAiNotesSessions(dependencies.liveKit);
  // Le risposte del provider che non sono mai arrivate: il provider non
  // conserva le trascrizioni, quindi l'unico recupero è reinviare l'audio.
  const staleRequests = await recoverStaleTranscriptionRequests(
    { limit },
    dependencies
  );
  const recovered = await recoverStaleAiProcessingJobs({ limit });
  const compassJobsQueued = await enqueueReadySessionCompassJobs(
    { limit },
    dependencies
  );
  const processed = await processAiNotesBatch({ workerId, limit }, dependencies);
  return { expiredClosed, staleRequests, recovered, compassJobsQueued, ...processed };
}

async function runWorker(request: Request): Promise<Response> {
  if (!authorized(request)) {
    return new Response('Not found', { status: 404 });
  }

  const limit = requestedLimit(request);
  const chain = requestedChain(request);
  const origin = new URL(request.url).origin;
  const workerId = `vercel-${Date.now().toString(36)}`;

  // La sveglia dal webhook non può restare in attesa della trascrizione: chi
  // chiama riceve subito 202 e il lavoro prosegue dopo la risposta. Il cron
  // usa invece la modalità sincrona, così l'esito resta osservabile nei log.
  if (new URL(request.url).searchParams.get('mode') === 'async') {
    after(async () => {
      try {
        const result = await drainQueue(workerId, limit);
        console.log('ai-notes worker done', { workerId, ...result });
        await chainIfWorkRemains(origin, chain);
      } catch (error) {
        console.error('ai-notes worker failed', { workerId }, error);
      }
    });
    return Response.json({ workerId, limit, mode: 'async' }, { status: 202 });
  }

  try {
    const result = await drainQueue(workerId, limit);
    await chainIfWorkRemains(origin, chain);
    return Response.json({ workerId, limit, ...result });
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
