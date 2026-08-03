import dotenv from 'dotenv';
import { processAiNotesBatch, recoverStaleAiProcessingJobs } from '@/lib/core/ai-session-notes/processing';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

function readLimit(): number {
  const raw = process.argv.find((argument) => argument.startsWith('--limit='));
  if (!raw) return 5;
  const value = Number(raw.slice('--limit='.length));
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error('INVALID_LIMIT');
  }
  return value;
}

async function main() {
  const limit = readLimit();
  const workerId = `batch-${process.pid}`;
  const dependencies = createProductionAiSessionNotesDependencies();
  const recovered = await recoverStaleAiProcessingJobs({ limit });
  const processed = await processAiNotesBatch(
    { workerId, limit },
    dependencies
  );
  // limit is the maximum number of jobs claimed in this finite invocation;
  // downstream jobs may be claimed only while capacity remains.
  console.log(JSON.stringify({ workerId, limitMeaning: 'maximum_claimed_jobs', recovered, ...processed }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.name : 'unknown');
  process.exitCode = 1;
});
