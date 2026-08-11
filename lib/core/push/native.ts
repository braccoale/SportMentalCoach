import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { devicePushTokens } from '@/lib/db/schema';
import type { PushPayload } from './index';

/**
 * Notifiche verso l'app installata.
 *
 * Passa dal servizio push di Expo invece di parlare direttamente con FCM e
 * APNs. Il motivo non è pigrizia: sono due integrazioni distinte, una con un
 * file di credenziali Google da custodire e una con un certificato Apple da
 * rinnovare. Expo le tiene entrambe dietro un unico indirizzo e un unico
 * formato, e per un prodotto che ha una app sola è il rapporto giusto fra
 * lavoro e controllo. Il giorno in cui servisse il controllo diretto — suoni
 * personalizzati per canale, priorità fini — si sostituisce questo modulo e
 * basta: il resto del prodotto chiama `sendPushToUser` e non sa di Expo.
 */

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo accetta fino a 100 messaggi per richiesta. */
const BATCH_SIZE = 100;

export type DeviceRegistration = {
  token: string;
  platform?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;
};

/**
 * Registra (o aggiorna) il dispositivo di una persona.
 *
 * Due conflitti possibili, entrambi normali: lo stesso token che torna a ogni
 * avvio dell'app, e lo stesso telefono che presenta un token nuovo perché è
 * ruotato. Il primo si risolve aggiornando la riga; il secondo cancellando
 * prima la riga vecchia di quel dispositivo, altrimenti resterebbe un
 * indirizzo morto a cui continueremmo a spedire per sempre.
 */
export async function registerDevice(
  userId: number,
  registration: DeviceRegistration
): Promise<void> {
  const now = new Date();

  if (registration.deviceId) {
    await db
      .delete(devicePushTokens)
      .where(
        and(
          eq(devicePushTokens.userId, userId),
          eq(devicePushTokens.deviceId, registration.deviceId)
        )
      );
  }

  await db
    .insert(devicePushTokens)
    .values({
      userId,
      token: registration.token,
      platform: registration.platform ?? null,
      deviceId: registration.deviceId ?? null,
      appVersion: registration.appVersion ?? null,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: devicePushTokens.token,
      set: {
        userId,
        platform: registration.platform ?? null,
        deviceId: registration.deviceId ?? null,
        appVersion: registration.appVersion ?? null,
        lastSeenAt: now,
        updatedAt: now,
      },
    });
}

export async function unregisterDevice(token: string): Promise<void> {
  await db.delete(devicePushTokens).where(eq(devicePushTokens.token, token));
}

/** Un token che il servizio dichiara morto non va tenuto. */
async function dropTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db
    .delete(devicePushTokens)
    .where(inArray(devicePushTokens.token, tokens));
}

type ExpoTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * Manda la notifica a tutti i dispositivi di una persona.
 *
 * Non solleva mai: una notifica è un di più, e non deve far fallire l'azione
 * che l'ha generata — entrare in una stanza, accettare una prenotazione.
 */
export async function sendNativePushToUser(
  userId: number,
  payload: PushPayload
): Promise<void> {
  const devices = await db
    .select({ token: devicePushTokens.token })
    .from(devicePushTokens)
    .where(eq(devicePushTokens.userId, userId));
  if (devices.length === 0) return;

  /*
   * `channelId` esiste solo su Android e decide come suona la notifica: il
   * canale `calls` è dichiarato dall'app con importanza massima e suoneria.
   * Senza, una chiamata arriverebbe con lo stesso tono discreto di un
   * promemoria — tecnicamente consegnata, praticamente persa.
   */
  const isCall = payload.tag?.startsWith('call-') ?? false;

  const messages = devices.map((device) => ({
    to: device.token,
    title: payload.title,
    body: payload.body ?? '',
    data: { url: payload.url ?? '/' },
    sound: 'default' as const,
    channelId: isCall ? 'calls' : 'default',
    priority: isCall ? ('high' as const) : ('default' as const),
    // Raggruppa gli avvisi della stessa chiamata invece di impilarli.
    ...(payload.tag ? { categoryId: payload.tag } : {}),
    ...(payload.vibrate ? { vibrationPattern: payload.vibrate } : {}),
    /*
     * Una chiamata scade: se il telefono è spento e si riaccende venti minuti
     * dopo, la notifica non deve arrivare. Squillare per una chiamata finita
     * è peggio che non squillare.
     */
    ...(isCall ? { ttl: 60 } : {}),
  }));

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        console.error(
          `[push:native] invio fallito (${response.status})`,
          (await response.text().catch(() => '')).slice(0, 300)
        );
        continue;
      }

      const body = (await response.json().catch(() => null)) as {
        data?: ExpoTicket[];
      } | null;

      // I token che il servizio dichiara non più registrati vanno via: sono
      // app disinstallate, e tenerli significa spedire nel vuoto per sempre.
      const dead = (body?.data ?? []).flatMap((ticket, index) =>
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
          ? [batch[index]!.to]
          : []
      );
      await dropTokens(dead);
    } catch (error) {
      console.error('[push:native] invio fallito', error);
    }
  }
}
