import { getUser } from '@/lib/db/queries';
import { getChat, sendMessage } from '@/lib/core/messages';
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_MIME_TYPES,
} from '@/lib/core/messages/policy';

// Participant-guarded message fetch. Realtime only nudges the client to call
// this endpoint; all access control (participant + accepted) lives here, never
// over the realtime channel.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const id = Number(bookingId);
  const user = await getUser();
  if (!user || !Number.isInteger(id)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const chat = await getChat(id, user.id);
  if (!chat) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const messages = chat.messages.map((m) => ({
    id: m.id,
    senderId: m.senderId,
    senderName: m.senderName,
    senderEmail: m.senderEmail,
    body: m.body,
    attachmentName: m.attachmentName,
    attachmentMimeType: m.attachmentMimeType,
    attachmentSize: m.attachmentSize,
    attachmentUrl: m.hasAttachment
      ? `/api/chat/${id}/messages/${m.id}/attachment`
      : null,
    reactions: m.reactions,
    createdAt: m.createdAt.toISOString(),
  }));

  return Response.json({ messages });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  const { bookingId } = await params;
  const id = Number(bookingId);
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'Non autenticato.' }, { status: 401 });
  }
  if (!Number.isInteger(id)) {
    return Response.json({ error: 'Chat non valida.' }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: 'Richiesta non valida.' }, { status: 400 });
  }

  const body = String(form.get('body') ?? '');
  const file = form.get('image');
  let attachment:
    | {
        name: string;
        mimeType: string;
        size: number;
        bytes: Buffer;
      }
    | undefined;

  if (file instanceof File && file.size > 0) {
    if (
      file.size > CHAT_IMAGE_MAX_BYTES ||
      !(CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)
    ) {
      return Response.json(
        { error: 'Usa un’immagine JPG, PNG o WebP di massimo 4 MB.' },
        { status: 400 }
      );
    }
    attachment = {
      name: file.name,
      mimeType: file.type,
      size: file.size,
      bytes: Buffer.from(await file.arrayBuffer()),
    };
  }

  const result = await sendMessage(id, user.id, body, attachment);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true }, { status: 201 });
}
