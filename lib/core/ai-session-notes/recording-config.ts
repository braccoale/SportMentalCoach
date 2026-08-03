import 'server-only';

export type AudioRecordingConfig = {
  livekitHost: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  s3Endpoint: string;
  s3Region: string;
  s3AccessKey: string;
  s3SecretKey: string;
  bucket: string;
  retentionDays: number;
  maxBytes: number;
  safetyTimeoutMinutes: number;
  webhookMaxAgeSeconds: number;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

function boundedInteger(
  name: string,
  fallback: number,
  min: number,
  max: number
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`INVALID_${name}`);
  }
  return value;
}

export function getLiveKitWebhookMaxAgeSeconds(): number {
  return boundedInteger(
    'LIVEKIT_WEBHOOK_MAX_AGE_SECONDS',
    86_400,
    300,
    604_800
  );
}

export function getAiNotesAudioMaxBytes(): number {
  return boundedInteger(
    'AI_NOTES_AUDIO_MAX_BYTES',
    128 * 1024 * 1024,
    1024 * 1024,
    2_000_000_000
  );
}

export function livekitApiHost(publicUrl: string): string {
  const parsed = new URL(publicUrl);
  if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
  if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
  if (!['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('INVALID_NEXT_PUBLIC_LIVEKIT_URL');
  }
  parsed.pathname = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

function assertSupabaseS3Endpoint(
  supabaseUrl: string,
  endpoint: string
): void {
  const projectHost = new URL(supabaseUrl).hostname;
  const projectRef = projectHost.split('.')[0];
  const expectedHost = `${projectRef}.storage.supabase.co`;
  const parsed = new URL(endpoint);
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== expectedHost ||
    parsed.pathname.replace(/\/$/, '') !== '/storage/v1/s3'
  ) {
    throw new Error('AI_NOTES_AUDIO_S3_ENDPOINT_PROJECT_MISMATCH');
  }
}

/**
 * Recording is fail-closed: unlike normal video, Track Egress never starts
 * with partial storage configuration or a local/public fallback.
 */
export function getAudioRecordingConfig(): AudioRecordingConfig {
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();
  if (!supabaseUrl) throw new Error('MISSING_SUPABASE_URL');

  const s3Endpoint = required('AI_NOTES_AUDIO_S3_ENDPOINT');
  assertSupabaseS3Endpoint(supabaseUrl, s3Endpoint);

  const bucket = required('AI_NOTES_AUDIO_BUCKET');
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('INVALID_AI_NOTES_AUDIO_BUCKET');
  }

  return {
    livekitHost: livekitApiHost(required('NEXT_PUBLIC_LIVEKIT_URL')),
    livekitApiKey: required('LIVEKIT_API_KEY'),
    livekitApiSecret: required('LIVEKIT_API_SECRET'),
    s3Endpoint,
    s3Region: required('AI_NOTES_AUDIO_S3_REGION'),
    s3AccessKey: required('AI_NOTES_AUDIO_S3_ACCESS_KEY'),
    s3SecretKey: required('AI_NOTES_AUDIO_S3_SECRET_KEY'),
    bucket,
    // Seven days is the documented MVP proposal; deployments can reduce it.
    retentionDays: boundedInteger(
      'AI_NOTES_AUDIO_RETENTION_DAYS',
      7,
      1,
      30
    ),
    maxBytes: getAiNotesAudioMaxBytes(),
    safetyTimeoutMinutes: boundedInteger(
      'AI_NOTES_AUDIO_SAFETY_TIMEOUT_MINUTES',
      180,
      5,
      360
    ),
    webhookMaxAgeSeconds: getLiveKitWebhookMaxAgeSeconds(),
    supabaseUrl,
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function audioRetentionUntil(
  config: Pick<AudioRecordingConfig, 'retentionDays'>,
  now = new Date()
): Date {
  return new Date(now.getTime() + config.retentionDays * 86_400_000);
}
