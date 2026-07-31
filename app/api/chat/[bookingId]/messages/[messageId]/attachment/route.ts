import { getUser } from '@/lib/db/queries';
import { getMessageAttachment } from '@/lib/core/messages';
import { readPrivateFile } from '@/lib/core/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{ bookingId: string; messageId: string }>;
  }
) {
  const { bookingId: rawBookingId, messageId: rawMessageId } = await params;
  const bookingId = Number(rawBookingId);
  const messageId = Number(rawMessageId);
  const user = await getUser();

  if (
    !user ||
    !Number.isInteger(bookingId) ||
    !Number.isInteger(messageId)
  ) {
    return new Response('Not found', { status: 404 });
  }

  const attachment = await getMessageAttachment(
    bookingId,
    messageId,
    user.id
  );
  if (!attachment) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const bytes = await readPrivateFile(attachment.key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(
          attachment.name
        )}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
