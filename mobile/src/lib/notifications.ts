import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { API_BASE_URL } from './config';
import { accessToken } from './auth';

/**
 * Notifiche native.
 *
 * Il punto non è "far arrivare un avviso": è che una chiamata **suoni**. Su
 * Android il suono non lo decide chi spedisce, lo decide il canale dichiarato
 * dall'app — e un canale creato con importanza normale non si sente mai,
 * qualunque priorità metta il server. Per questo la prima cosa che si fa qui
 * è creare un canale `calls` con importanza massima: senza, tutto il resto
 * della catena funziona e nessuno se ne accorge.
 */

const DEVICE_ID_KEY = 'kaipai.deviceId';

/** In primo piano la notifica va comunque mostrata e suonata. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureCallChannel() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('calls', {
    name: 'Chiamate',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 500, 300, 500, 300, 500],
    lightColor: '#e11d2a',
    // Deve comparire sopra quello che si sta facendo: una chiamata che
    // aspetta in fondo al centro notifiche è una chiamata persa.
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
  });

  await Notifications.setNotificationChannelAsync('default', {
    name: 'Avvisi',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

/**
 * Identificativo stabile del telefono.
 *
 * I token di consegna ruotano; questo no. Serve al server per riconoscere lo
 * stesso dispositivo e sostituire la riga vecchia invece di accumularne una
 * nuova a ogni rotazione — altrimenti si spedisce a indirizzi morti per
 * sempre, senza che nessun errore lo segnali.
 */
async function deviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = `${Platform.OS}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, created);
  return created;
}

/**
 * L'ultimo motivo per cui non si è ottenuto un recapito.
 *
 * Vive qui, in un modulo, perché il fallimento capita all'accesso e la domanda
 * («perché non mi arriva niente?») arriva molto dopo, dalle impostazioni. Senza
 * conservarlo, l'unica risposta possibile sarebbe «non attive», che manda a
 * cercare nel posto sbagliato.
 */
let lastTokenError: string | null = null;

async function currentToken(): Promise<string | null> {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    lastTokenError = 'Identificativo del progetto mancante nella build.';
    console.warn('[notifications] projectId mancante: token non richiesto');
    return null;
  }
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    lastTokenError = data ? null : 'Il servizio non ha restituito un recapito.';
    return data ?? null;
  } catch (error) {
    /*
     * Su Android questo fallisce quando mancano le credenziali FCM della
     * build — il caso piu' comune, e il piu' invisibile: l'app sembra a posto,
     * il permesso e' concesso, e semplicemente non esiste un indirizzo a cui
     * spedire. Prima l'eccezione risaliva silenziosa e il risultato era un
     * telefono che non squillava mai senza che nessuno sapesse perche'.
     */
    lastTokenError =
      error instanceof Error ? error.message.slice(0, 160) : 'Errore sconosciuto.';
    console.warn('[notifications] token non ottenuto', error);
    return null;
  }
}

export type NotificationState = {
  /** Vero solo se esiste davvero un recapito valido. */
  enabled: boolean;
  permissionGranted: boolean;
  /** Perché non funziona, quando il permesso c'è ma il recapito no. */
  reason: string | null;
};

/** Lo stato da mostrare nelle impostazioni, senza chiedere nessun permesso. */
export async function notificationState(): Promise<NotificationState> {
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) {
    return { enabled: false, permissionGranted: false, reason: null };
  }
  const token = await currentToken();
  return {
    enabled: token !== null,
    permissionGranted: true,
    reason: token ? null : lastTokenError,
  };
}

/**
 * Chiede il permesso, prepara i canali e comunica al server dove trovarci.
 *
 * Da chiamare **dopo** l'accesso: prima non ci sarebbe un utente a cui legare
 * il dispositivo, e il permesso verrebbe chiesto a qualcuno che non sa ancora
 * cosa sia l'app.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  await ensureCallChannel();

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) return null;

  const token = await currentToken();
  if (!token) return null;

  const auth = await accessToken();
  if (!auth) return null;

  await fetch(`${API_BASE_URL}/api/mobile/devices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth}`,
    },
    body: JSON.stringify({
      token,
      platform: Platform.OS,
      deviceId: await deviceId(),
      appVersion: Constants.expoConfig?.version ?? null,
    }),
  }).catch((error) => {
    // Best effort: senza notifiche l'app funziona lo stesso.
    console.warn('[notifications] registrazione fallita', error);
  });

  return token;
}

/** All'uscita dall'account il telefono smette di essere un recapito valido. */
export async function unregisterPushNotifications(token: string | null) {
  if (!token) return;
  const auth = await accessToken();
  if (!auth) return;
  await fetch(`${API_BASE_URL}/api/mobile/devices`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth}`,
    },
    body: JSON.stringify({ token }),
  }).catch(() => {});
}

/**
 * Il tocco su una notifica porta dove dice la notifica.
 *
 * Restituisce la funzione per smettere di ascoltare: senza, ogni rimontaggio
 * aggiungerebbe un ascoltatore e un tocco solo aprirebbe la stanza più volte.
 */
export function onNotificationTap(handler: (url: string) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string') handler(url);
    }
  );
  return () => subscription.remove();
}
