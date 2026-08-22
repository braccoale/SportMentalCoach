import 'server-only';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export async function loadKaiPaiPdfLogo(): Promise<Buffer | null> {
  return readFile(join(process.cwd(), 'public', 'email', 'kaipai-logo.png')).catch(
    () => null
  );
}

/**
 * Accetta solo file pubblici locali o immagini servite dallo stesso progetto
 * Supabase configurato. La normalizzazione elimina EXIF e produce un crop
 * quadrato, così il PDF non incorpora URL arbitrari o foto deformate.
 */
export async function loadPdfAvatar(avatarUrl: string | null): Promise<Buffer | null> {
  if (!avatarUrl) return null;

  let bytes: Buffer | null = null;
  if (avatarUrl.startsWith('/')) {
    const publicRoot = resolve(process.cwd(), 'public');
    const filePath = resolve(publicRoot, `.${avatarUrl}`);
    const childPath = relative(publicRoot, filePath);
    if (childPath.startsWith('..') || isAbsolute(childPath)) return null;
    bytes = await readFile(filePath).catch(() => null);
  } else {
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return null;

    let source: URL;
    try {
      source = new URL(avatarUrl);
      if (source.origin !== new URL(supabaseUrl).origin) return null;
    } catch {
      return null;
    }

    const response = await fetch(source, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(6_000),
    }).catch(() => null);
    if (!response?.ok) return null;
    if (!(response.headers.get('content-type') ?? '').startsWith('image/')) {
      return null;
    }
    const declaredSize = Number(response.headers.get('content-length') ?? 0);
    if (declaredSize > MAX_AVATAR_BYTES) return null;
    bytes = Buffer.from(await response.arrayBuffer());
  }

  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) {
    return null;
  }

  try {
    const { default: sharp } = await import('sharp');
    return await sharp(bytes)
      .rotate()
      .resize(160, 160, { fit: 'cover', position: 'attention' })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}
