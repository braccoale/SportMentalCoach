import { NextResponse } from 'next/server';
import { getUser } from '@/lib/db/queries';
import { storeFile } from '@/lib/core/storage';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Uploads an avatar and returns its public URL. Stored in Supabase Storage
 * when configured, otherwise on the local filesystem (see lib/core/storage.ts).
 */
export async function POST(req: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Nessun file.' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Carica un file immagine.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Immagine troppo grande (max 5MB).' },
        { status: 400 }
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const ext = (file.name.split('.').pop() || 'jpg')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 5);
    const key = `avatars/avatar-${user.id}-${Date.now()}.${ext || 'jpg'}`;
    const url = await storeFile(key, bytes, file.type);

    return NextResponse.json({ url });
  } catch (err) {
    console.error('Avatar upload failed:', err);
    return NextResponse.json(
      { error: 'Caricamento non riuscito. Riprova tra poco.' },
      { status: 500 }
    );
  }
}
