import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getUser } from '@/lib/db/queries';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Saves an uploaded avatar image to public/uploads/ and returns its public
 * path (e.g. /uploads/avatar-12-....jpg). Works on a writable filesystem
 * (local dev); on a read-only serverless host swap this for object storage.
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
  const filename = `avatar-${user.id}-${Date.now()}.${ext || 'jpg'}`;
  const dir = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), bytes);

  return NextResponse.json({ url: `/uploads/${filename}` });
}
