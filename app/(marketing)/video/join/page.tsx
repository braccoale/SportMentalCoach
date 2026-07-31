import { createGuestRoomToken } from '@/lib/core/video';
import GuestJoinPage, {
  type GuestJoinResult,
} from '@/components/page';

export const dynamic = 'force-dynamic';

export default async function VideoGuestJoinRoute({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const invite = String((await searchParams).invite ?? '').trim();
  if (!invite || invite.length > 4_000) {
    return <GuestJoinPage result={{ ok: false, reason: 'invalid' }} />;
  }

  const result = await createGuestRoomToken(invite);
  const clientResult: GuestJoinResult = result.ok
    ? {
        ok: true,
        token: result.token,
        preflightToken: result.preflightToken,
        serverUrl: result.url,
        coachIdentity: result.coachIdentity,
      }
    : result.reason === 'too_early'
      ? {
          ok: false,
          reason: 'too_early',
          scheduledFor: result.scheduledFor,
        }
      : { ok: false, reason: result.reason };
  return <GuestJoinPage result={clientResult} />;
}
