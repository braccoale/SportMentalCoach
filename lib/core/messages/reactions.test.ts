import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isMessageReactionEmoji,
  MESSAGE_REACTION_EMOJIS,
} from './policy';

test('message reactions expose six unique WhatsApp-style choices', () => {
  assert.equal(MESSAGE_REACTION_EMOJIS.length, 6);
  assert.equal(new Set(MESSAGE_REACTION_EMOJIS).size, 6);
  for (const emoji of MESSAGE_REACTION_EMOJIS) {
    assert.equal(isMessageReactionEmoji(emoji), true);
  }
});

test('message reactions reject arbitrary text and unsupported emoji', () => {
  assert.equal(isMessageReactionEmoji(''), false);
  assert.equal(isMessageReactionEmoji('like'), false);
  assert.equal(isMessageReactionEmoji('🚀'), false);
});
