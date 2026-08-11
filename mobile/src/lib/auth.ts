import 'react-native-url-polyfill/auto';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { createClient, type Session } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

/**
 * Autenticazione dell'app.
 *
 * La sessione vive nel portachiavi del sistema (`expo-secure-store`), non in
 * memoria e non in un archivio in chiaro: è cifrata dal dispositivo, e su
 * Android è protetta dal Keystore. È la differenza fra «la password non
 * gliela richiediamo» e «chiunque prenda in mano il telefono entra».
 *
 * Face ID (o l'impronta, o il volto su Android) non è una seconda password:
 * è la chiave che autorizza a **riusare** la sessione già salvata. Se il
 * dispositivo non ha biometria configurata si ricade sul codice di sblocco;
 * se non c'è nemmeno quello, si torna a chiedere le credenziali. Non si salta
 * mai il controllo lasciando entrare e basta.
 */

const SESSION_KEY = 'kaipai.session';

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Su mobile non esiste una barra degli indirizzi da cui leggere il
    // frammento di ritorno: va disattivato o Supabase ci prova comunque.
    detectSessionInUrl: false,
  },
});

export type BiometricSupport = {
  available: boolean;
  /** Come si chiama qui: cambia il testo del pulsante, non il meccanismo. */
  label: string;
};

export async function biometricSupport(): Promise<BiometricSupport> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !enrolled) {
    return { available: false, label: 'Sblocco del dispositivo' };
  }

  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const facial = types.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
  );
  const fingerprint = types.includes(
    LocalAuthentication.AuthenticationType.FINGERPRINT
  );

  return {
    available: true,
    label: facial ? 'Face ID' : fingerprint ? 'Impronta' : 'Biometria',
  };
}

/**
 * Chiede la conferma biometrica.
 *
 * `disableDeviceFallback: false` di proposito: chi non può usare il volto o
 * l'impronta — luce, guanti, un dito bagnato — deve poter entrare con il
 * codice del telefono invece di restare fuori.
 */
export async function confirmIdentity(reason: string): Promise<boolean> {
  const { available } = await biometricSupport();
  if (!available) return false;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Annulla',
    disableDeviceFallback: false,
  });
  return result.success;
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data.session;
}

export async function currentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
  await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
}

/**
 * Il token da mettere in `Authorization` verso la nostra API.
 *
 * Passa sempre da `getSession()` invece di tenersi una copia: il client
 * rinnova il token da solo, e una copia salvata da qualche parte sarebbe
 * scaduta esattamente quando serve.
 */
export async function accessToken(): Promise<string | null> {
  const session = await currentSession();
  return session?.access_token ?? null;
}
