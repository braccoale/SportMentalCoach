import { NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { storeFile } from '@/lib/core/storage';

const MAX_BYTES = 100 * 1024 * 1024; // 100MB

/**
 * Uploads a coach presentation video and returns its public URL. Stored in
 * Supabase Storage when configured, otherwise on the local filesystem
 * (see lib/core/storage.ts).
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Nessun file.' }, { status: 400 });
  }
  if (!file.type.startsWith('video/')) {
    return NextResponse.json(
      { error: 'Carica un file video.' },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'Video troppo grande (max 100MB).' },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split('.').pop() || 'mp4')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 5);
  const key = `videos/intro-${user.id}-${Date.now()}.${ext || 'mp4'}`;

  try {
    const url = await storeFile(key, bytes, file.type);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Caricamento fallito.' },
      { status: 500 }
    );
  }
}
