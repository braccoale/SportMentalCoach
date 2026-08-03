import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_MIME_TYPES,
} from './policy';

export type ChatImageForValidation = {
  mimeType: string;
  size: number;
  bytes: Uint8Array;
};

function detectedImageMimeType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Returns a reader-facing validation error, or null when the file is safe. */
export function validateChatImageAttachment(
  attachment: ChatImageForValidation
): string | null {
  if (
    attachment.size <= 0 ||
    attachment.size > CHAT_IMAGE_MAX_BYTES ||
    attachment.bytes.length !== attachment.size
  ) {
    return 'Immagine troppo grande o non valida (max 4 MB).';
  }
  if (
    !(CHAT_IMAGE_MIME_TYPES as readonly string[]).includes(
      attachment.mimeType
    ) ||
    detectedImageMimeType(attachment.bytes) !== attachment.mimeType
  ) {
    return 'Formato non valido. Usa JPG, PNG o WebP.';
  }
  return null;
}
