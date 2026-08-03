import dotenv from 'dotenv';
import { runAudioRetention } from '@/lib/core/ai-session-notes/maintenance';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

async function main() {
  const apply = process.argv.includes('--apply');
  const result = await runAudioRetention({ apply });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.name : 'unknown');
  process.exitCode = 1;
});
