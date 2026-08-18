import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIVEKIT_EXPO_PLUGIN,
  cameraActionFor,
  iosMajorVersion,
  keepsCameraInBackground,
  readLiveKitPluginFlags,
  type PlatformFacts,
} from './background-camera';

const IOS_18: PlatformFacts = {
  os: 'ios',
  version: '18.1',
  multitaskingCameraAccess: true,
  androidCameraService: false,
};

const ANDROID: PlatformFacts = {
  os: 'android',
  version: 35,
  multitaskingCameraAccess: false,
  androidCameraService: false,
};

test('iOS 18 con il multitasking abilitato tiene la fotocamera in secondo piano', () => {
  assert.equal(keepsCameraInBackground(IOS_18), true);
});

test('su iOS il permesso non basta senza la versione, e la versione senza il permesso', () => {
  assert.equal(
    keepsCameraInBackground({ ...IOS_18, version: '17.6' }),
    false,
    'iOS 17 non concede la fotocamera fuori dal primo piano, comunque sia compilata la build'
  );
  assert.equal(
    keepsCameraInBackground({ ...IOS_18, multitaskingCameraAccess: false }),
    false,
    'senza il flag del plugin la build non e` preparata, anche su iOS 18'
  );
});

test('su Android decide il foreground service, non la versione del sistema', () => {
  assert.equal(keepsCameraInBackground(ANDROID), false);
  assert.equal(
    keepsCameraInBackground({ ...ANDROID, androidCameraService: true }),
    true
  );
  assert.equal(
    keepsCameraInBackground({ ...ANDROID, version: 28, androidCameraService: true }),
    true,
    'il servizio e` la condizione: l`API level non entra nella decisione'
  );
});

test('una piattaforma sconosciuta non tiene la fotocamera accesa', () => {
  assert.equal(keepsCameraInBackground({ ...ANDROID, os: 'web' }), false);
});

test('la major di iOS si legge da tutte le forme che Platform.Version assume', () => {
  assert.equal(iosMajorVersion('18'), 18);
  assert.equal(iosMajorVersion('18.1'), 18);
  assert.equal(iosMajorVersion('18.1.1'), 18);
  assert.equal(iosMajorVersion(' 17.5 '), 17);
  assert.equal(iosMajorVersion(35), 35);
  assert.equal(iosMajorVersion('boh'), null);
});

test('dove la piattaforma non regge, la fotocamera la spegniamo noi andando in background', () => {
  assert.equal(
    cameraActionFor({
      next: 'background',
      keepsCapture: false,
      cameraWanted: true,
      releasedByUs: false,
    }),
    'release'
  );
});

test('dove la piattaforma regge, andando in background non si tocca niente', () => {
  assert.equal(
    cameraActionFor({
      next: 'background',
      keepsCapture: true,
      cameraWanted: true,
      releasedByUs: false,
    }),
    'none'
  );
});

test('`inactive` conta come background: su iOS la fotocamera e` gia` sospesa li`', () => {
  assert.equal(
    cameraActionFor({
      next: 'inactive',
      keepsCapture: false,
      cameraWanted: true,
      releasedByUs: false,
    }),
    'release'
  );
});

test('la camera spenta dall`utente resta spenta, in entrambe le direzioni', () => {
  assert.equal(
    cameraActionFor({
      next: 'background',
      keepsCapture: false,
      cameraWanted: false,
      releasedByUs: false,
    }),
    'none'
  );
  assert.equal(
    cameraActionFor({
      next: 'active',
      keepsCapture: true,
      cameraWanted: false,
      releasedByUs: false,
    }),
    'none',
    'tornare in primo piano non e` il momento di riaccendere quello che l`utente ha spento'
  );
});

test('tornando in primo piano si riaccende solo quello che avevamo spento noi', () => {
  assert.equal(
    cameraActionFor({
      next: 'active',
      keepsCapture: false,
      cameraWanted: true,
      releasedByUs: true,
    }),
    'restore'
  );
});

test('se la piattaforma regge, al ritorno si controlla comunque che stia riprendendo', () => {
  assert.equal(
    cameraActionFor({
      next: 'active',
      keepsCapture: true,
      cameraWanted: true,
      releasedByUs: false,
    }),
    'verify',
    'Android puo` riprendersi la fotocamera anche con il servizio attivo: la traccia resta pubblicata e l`altra persona vede un fermo immagine'
  );
});

test('i flag del plugin si leggono dalla configurazione, non da una copia', () => {
  const plugins = [
    'expo-dev-client',
    [
      LIVEKIT_EXPO_PLUGIN,
      {
        android: { audioType: 'communication', enableScreenShareService: true },
        ios: { enableMultitaskingCameraAccess: true },
      },
    ],
    ['expo-notifications', { color: '#e11d2a' }],
  ];

  assert.deepEqual(readLiveKitPluginFlags(plugins), {
    multitaskingCameraAccess: true,
    screenShareService: true,
  });
});

test('una configurazione senza il plugin, o senza le sue opzioni, non concede niente', () => {
  const spento = { multitaskingCameraAccess: false, screenShareService: false };

  assert.deepEqual(readLiveKitPluginFlags(undefined), spento);
  assert.deepEqual(readLiveKitPluginFlags(['expo-dev-client']), spento);
  assert.deepEqual(readLiveKitPluginFlags([LIVEKIT_EXPO_PLUGIN]), spento,
    'il plugin senza opzioni e` il plugin ai suoi valori predefiniti, e il predefinito e` falso');
  assert.deepEqual(
    readLiveKitPluginFlags([[LIVEKIT_EXPO_PLUGIN, { ios: {} }]]),
    spento
  );
  assert.deepEqual(
    readLiveKitPluginFlags([[LIVEKIT_EXPO_PLUGIN, { ios: { enableMultitaskingCameraAccess: 'si' } }]]),
    spento,
    'solo il booleano vero conta: una stringa non e` un consenso'
  );
});
