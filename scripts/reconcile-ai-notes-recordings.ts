import dotenv from 'dotenv';
import { reconcileAudioRecordings } from '@/lib/core/ai-session-notes/maintenance';
import { createProductionAiSessionNotesDependencies } from '@/lib/core/ai-session-notes/dependencies';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

async function main() {
  const repair = process.argv.includes('--repair');
  const dependencies = createProductionAiSessionNotesDependencies();
  const result = await reconcileAudioRecordings(
    dependencies.liveKit,
    { repair }
  );
  console.log(
    JSON.stringify(
      {
        ...result,
        issues: result.issues.map(
          ({ objectKey: _objectKey, ...issue }) => issue
        ),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.name : 'unknown');
  process.exitCode = 1;
});
