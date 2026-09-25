/**
 * Il worker lungo degli Appunti AI: genera i riepiloghi che sul worker di
 * Vercel non hanno fatto in tempo.
 *
 * Vercel dà un minuto e una generazione ne usa 25-45: sulle sedute lunghe
 * sfora, e riprovarla lì sforerebbe di nuovo. Qui gira un processo Node vero,
 * senza quel tetto, e prende soltanto i job marcati per lui (`runner = long`,
 * messo quando un riepilogo fallisce per `COMPASS_TIMEOUT`).
 *
 * Gira in GitHub Actions (`.github/workflows/ai-notes-long-worker.yml`) ma è
 * lo stesso comando che si può lanciare a mano:
 *
 *   npm run ai-notes:process-reports
 *
 * Servono pochi segreti — il database e il modello — perché un riepilogo
 * lavora sui segmenti già salvati e non tocca l'audio. Per questo usa
 * dipendenze ridotte, e non quelle di produzione che pretendono lo storage.
 *
 * Il tempo e lo sforzo non sono quelli di Vercel: se non impostati, qui si usa
 * `medium` (più ragionamento, riepiloghi più ricchi) e 5 minuti. Un report
 * scritto con sforzo più alto resta approvabile.
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

process.env.AI_NOTES_COMPASS_REASONING_EFFORT ??= 'medium';
process.env.AI_NOTES_COMPASS_TIMEOUT_MS ??= '300000';

async function main() {
  // Caricati dopo, perché lo sforzo di ragionamento viene letto una volta sola
  // al caricamento del modulo del provider.
  const [{ processAiNotesBatch, recoverStaleAiProcessingJobs }, { createReportOnlyAiSessionNotesDependencies }] =
    await Promise.all([
      import('@/lib/core/ai-session-notes/processing'),
      import('@/lib/core/ai-session-notes/dependencies'),
    ]);

  const raw = process.argv.find((argument) => argument.startsWith('--limit='));
  const limit = raw ? Number(raw.slice('--limit='.length)) : 2;
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
    throw new Error('INVALID_LIMIT');
  }

  const workerId = `long-${process.pid}`;
  const dependencies = createReportOnlyAiSessionNotesDependencies();
  // Un job preso da un worker morto a metà resta `processing`: lo si rimette in
  // coda, e con il marcatore torna a questo stesso worker.
  const recovered = await recoverStaleAiProcessingJobs({ limit });
  const processed = await processAiNotesBatch(
    { workerId, limit, runner: 'long' },
    dependencies
  );
  console.log(
    JSON.stringify({ workerId, runner: 'long', recovered, ...processed }, null, 2)
  );
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'unknown');
    process.exit(1);
  });
