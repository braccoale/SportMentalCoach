import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPACT_MEDIA_QUERY,
  visibleAdvancedSections,
  visibleRoomControls,
  type CallCapabilities,
} from './capabilities';

const FULL: CallCapabilities = {
  audioOutputSelection: true,
  pictureInPicture: true,
  backgroundProcessors: true,
  fullscreen: true,
  isIosSafari: false,
};

const IOS_SAFARI: CallCapabilities = {
  audioOutputSelection: false,
  pictureInPicture: false,
  backgroundProcessors: false,
  fullscreen: false,
  isIosSafari: true,
};

test('compact means narrow screen or coarse pointer', () => {
  assert.equal(COMPACT_MEDIA_QUERY, '(max-width: 767px), (pointer: coarse)');
});

test('desktop keeps exactly the controls it has today', () => {
  assert.deepEqual(visibleRoomControls(FULL, false), [
    'fullscreen',
    'picture-in-picture',
    'connection-quality',
    'share',
  ]);
});

test('compact never offers fullscreen and always offers an exit', () => {
  const controls = visibleRoomControls(FULL, true);
  assert.equal(controls.includes('fullscreen'), false);
  assert.equal(controls.includes('exit'), true);
});

test('picture-in-picture disappears on iOS Safari', () => {
  assert.equal(
    visibleRoomControls(IOS_SAFARI, true).includes('picture-in-picture'),
    false
  );
});

test('connection quality and sharing survive on compact', () => {
  const controls = visibleRoomControls(IOS_SAFARI, true);
  assert.deepEqual(controls, ['exit', 'connection-quality', 'share']);
});

test('speaker selection hides where unsupported but the test stays', () => {
  const sections = visibleAdvancedSections(IOS_SAFARI);
  assert.equal(sections.includes('speaker-select'), false);
  assert.equal(sections.includes('speaker-test'), true);
});

test('a browser without background processors loses only that section', () => {
  assert.deepEqual(visibleAdvancedSections(IOS_SAFARI), [
    'microphone',
    'camera',
    'speaker-test',
    'network',
  ]);
});

test('a fully capable browser lists every section', () => {
  assert.deepEqual(visibleAdvancedSections(FULL), [
    'microphone',
    'camera',
    'speaker-select',
    'speaker-test',
    'backgrounds',
    'network',
  ]);
});
