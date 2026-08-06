import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPACT_MEDIA_QUERY,
  detectInAppBrowser,
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
  assert.deepEqual(controls, [
    'exit',
    'flip-camera',
    'connection-quality',
    'share',
  ]);
});

test('flipping the camera is offered on compact and nowhere else', () => {
  assert.equal(visibleRoomControls(FULL, true).includes('flip-camera'), true);
  assert.equal(visibleRoomControls(FULL, false).includes('flip-camera'), false);
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

// --- Browser interni delle app social ----------------------------------------

const IOS_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0 (iPhone14,5; iOS 17_5; it_IT)';
const ANDROID_FACEBOOK =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/468.0.0.35.109;]';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

test('i browser interni delle app social vengono riconosciuti per nome', () => {
  assert.equal(detectInAppBrowser(IOS_INSTAGRAM)?.label, 'Instagram');
  assert.equal(detectInAppBrowser(ANDROID_FACEBOOK)?.label, 'Facebook');
  assert.equal(
    detectInAppBrowser('… musical_ly_2023 BytedanceWebview/d8a21c')?.label,
    'TikTok'
  );
  assert.equal(
    detectInAppBrowser('… MicroMessenger/8.0.49')?.label,
    'WeChat'
  );
});

test('Safari e Chrome veri non vengono scambiati per browser interni', () => {
  assert.equal(detectInAppBrowser(IPHONE_SAFARI), null);
  assert.equal(detectInAppBrowser(ANDROID_CHROME), null);
  assert.equal(detectInAppBrowser(''), null);
});

test('su iOS il browser interno impedisce la chiamata, su Android la degrada', () => {
  // WKWebView dentro le app social non dà accesso a camera e microfono: lì
  // l'avviso deve fermare l'utente, non solo preoccuparlo.
  assert.equal(detectInAppBrowser(IOS_INSTAGRAM)?.severity, 'blocking');
  assert.equal(detectInAppBrowser(ANDROID_FACEBOOK)?.severity, 'warning');
});

test('ogni browser interno riconosciuto spiega come uscirne', () => {
  for (const ua of [IOS_INSTAGRAM, ANDROID_FACEBOOK]) {
    const detected = detectInAppBrowser(ua);
    assert.ok(detected);
    assert.match(detected.howToExit, /Safari|Chrome|browser/);
  }
});
