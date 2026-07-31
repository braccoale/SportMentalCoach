import assert from 'node:assert/strict';
import test from 'node:test';
import { CHAT_IMAGE_MAX_BYTES } from './policy';
import { validateChatImageAttachment } from './attachments';

test('accepts JPG, PNG and WebP only when their signatures match', () => {
  const fixtures = [
    { mimeType: 'image/jpeg', bytes: Uint8Array.from([0xff, 0xd8, 0xff]) },
    {
      mimeType: 'image/png',
      bytes: Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]),
    },
    {
      mimeType: 'image/webp',
      bytes: Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
      ]),
    },
  ];

  for (const fixture of fixtures) {
    assert.equal(
      validateChatImageAttachment({
        ...fixture,
        size: fixture.bytes.length,
      }),
      null
    );
  }
});

test('rejects spoofed content types and unsupported image formats', () => {
  const fakePng = Uint8Array.from([0xff, 0xd8, 0xff]);
  assert.match(
    validateChatImageAttachment({
      mimeType: 'image/png',
      size: fakePng.length,
      bytes: fakePng,
    }) ?? '',
    /Formato non valido/
  );
  assert.match(
    validateChatImageAttachment({
      mimeType: 'image/gif',
      size: 6,
      bytes: Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]),
    }) ?? '',
    /Formato non valido/
  );
});

test('rejects empty, inconsistent and oversized payloads', () => {
  assert.match(
    validateChatImageAttachment({
      mimeType: 'image/jpeg',
      size: 0,
      bytes: new Uint8Array(),
    }) ?? '',
    /max 4 MB/
  );
  assert.match(
    validateChatImageAttachment({
      mimeType: 'image/jpeg',
      size: 4,
      bytes: Uint8Array.from([0xff, 0xd8, 0xff]),
    }) ?? '',
    /max 4 MB/
  );
  assert.match(
    validateChatImageAttachment({
      mimeType: 'image/jpeg',
      size: CHAT_IMAGE_MAX_BYTES + 1,
      bytes: new Uint8Array(CHAT_IMAGE_MAX_BYTES + 1),
    }) ?? '',
    /max 4 MB/
  );
});
