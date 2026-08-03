import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { EgressClient, RoomServiceClient } from 'livekit-server-sdk';
import { livekitApiHost } from '@/lib/core/ai-session-notes/recording-config';

dotenv.config({ path: '.env.local', override: true });
dotenv.config();

async function main() {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  ) as {
    dependencies?: Record<string, string>;
  };

  const publicUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL?.trim() ?? '';
  const apiKey = process.env.LIVEKIT_API_KEY?.trim() ?? '';
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim() ?? '';
  const output: Record<string, unknown> = {
  destructive: false,
  sdk: {
    server: packageJson.dependencies?.['livekit-server-sdk'] ?? 'unknown',
    client: packageJson.dependencies?.['livekit-client'] ?? 'unknown',
  },
  project: {
    configured: Boolean(publicUrl && apiKey && apiSecret),
    cloud: publicUrl.endsWith('.livekit.cloud'),
    host: publicUrl ? new URL(publicUrl).hostname : null,
    plan: 'not_available_via_configured_service_api',
  },
  identityConvention: {
    authenticated: 'user-{applicationUserId}',
    guest: 'guest-{randomUUID}',
    room: 'booking-{bookingId}',
  },
  storage: {
    supabaseServiceConfigured: Boolean(
      (process.env.SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL) &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    dedicatedAudioS3Configured: [
      'AI_NOTES_AUDIO_S3_ENDPOINT',
      'AI_NOTES_AUDIO_S3_REGION',
      'AI_NOTES_AUDIO_S3_ACCESS_KEY',
      'AI_NOTES_AUDIO_S3_SECRET_KEY',
      'AI_NOTES_AUDIO_BUCKET',
    ].every((key) => Boolean(process.env[key]?.trim())),
  },
  requiredDashboardChecks: [
    'LiveKit plan name',
    'remaining included Track Egress minutes',
    'project Egress concurrency limit',
    'global webhook URL points to /api/livekit/webhook',
  ],
  pricingSource: 'https://livekit.com/pricing',
  };

  if (publicUrl && apiKey && apiSecret) {
    try {
      const host = livekitApiHost(publicUrl);
      const [rooms, egresses] = await Promise.all([
        new RoomServiceClient(host, apiKey, apiSecret).listRooms(),
        new EgressClient(host, apiKey, apiSecret).listEgress({ active: true }),
      ]);
      output.apiReadCheck = {
        ok: true,
        activeRoomCount: rooms.length,
        activeEgressCount: egresses.length,
      };
    } catch (error) {
      output.apiReadCheck = {
        ok: false,
        errorType: error instanceof Error ? error.name : 'unknown',
      };
    }
  }
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.name : 'unknown');
  process.exitCode = 1;
});
