import dotenv from 'dotenv';
import { db } from '@/lib/db/drizzle';
import { getSpeechToTextProvider } from '@/lib/core/ai-session-notes/providers';
import { getAudioRecordingConfig } from '@/lib/core/ai-session-notes/recording-config';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

async function main() {
  const selected = process.env.AI_NOTES_STT_PROVIDER?.trim() || 'disabled';
  const result: Record<string, unknown> = { provider: selected, model: process.env.AI_NOTES_STT_MODEL?.trim() || 'nova-3', database: false, storage: false, ready: false };
  await db.execute('select 1'); result.database = true;
  if (selected === 'deepgram') {
    result.apiKeyConfigured = Boolean(process.env.DEEPGRAM_API_KEY?.trim());
    try { getAudioRecordingConfig(); result.storage = true; } catch { result.storage = false; }
  } else result.storage = true;
  result.ready = selected === 'disabled' || (result.apiKeyConfigured === true && result.storage === true && getSpeechToTextProvider().name === 'deepgram');
  console.log(JSON.stringify(result));
}
main().catch(() => { console.error('AI_NOTES_TRANSCRIPTION_DIAGNOSTIC_FAILED'); process.exitCode = 1; });
