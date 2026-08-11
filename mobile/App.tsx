import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerGlobals } from '@livekit/react-native';
import { LoginScreen } from './src/screens/LoginScreen';
import { SessionsScreen } from './src/screens/SessionsScreen';
import { CallScreen } from './src/screens/CallScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ThemeProvider, useTheme } from './src/theme';
import {
  onNotificationTap,
  registerForPushNotifications,
  unregisterPushNotifications,
} from './src/lib/notifications';
import { fetchSessions, type UpcomingSession } from './src/lib/api';

/*
 * WebRTC deve esistere prima di qualunque componente LiveKit: `registerGlobals`
 * installa le implementazioni native al posto di quelle del browser, che su
 * React Native non ci sono. Va chiamata una volta sola, al caricamento del
 * modulo — non dentro un effetto, o il primo render la troverebbe assente.
 */
registerGlobals();

type Route =
  | { name: 'login' }
  | { name: 'sessions' }
  | { name: 'settings' }
  | { name: 'call'; session: UpcomingSession };

/** `/dashboard/video/171` → 171. Il resto non ci interessa. */
function bookingIdFromUrl(url: string): number | null {
  const match = url.match(/\/dashboard\/video\/(\d+)/);
  const id = match ? Number(match[1]) : NaN;
  return Number.isInteger(id) ? id : null;
}

/**
 * Un'app sola per coach e atleta, con la navigazione ridotta a quattro
 * schermate.
 *
 * Niente libreria di routing: quattro stati e una transizione per ciascuno. Una
 * dipendenza in più andrebbe giustificata da uno scenario che qui non c'è, e
 * il giorno in cui le schermate saranno otto si aggiunge allora — con in mano
 * i percorsi veri invece che quelli immaginati.
 */
export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'login' });
  const pushToken = useRef<string | null>(null);

  const openCall = useCallback(
    (session: UpcomingSession) => setRoute({ name: 'call', session }),
    []
  );

  const signedIn = useCallback(() => {
    setRoute({ name: 'sessions' });
    // Il permesso si chiede a persona riconosciuta, non all'ignoto che apre
    // l'app per la prima volta.
    void registerForPushNotifications().then((token) => {
      pushToken.current = token;
    });
  }, []);

  const signedOut = useCallback(() => {
    void unregisterPushNotifications(pushToken.current);
    pushToken.current = null;
    setRoute({ name: 'login' });
  }, []);

  /*
   * Il tasto Indietro di Android.
   *
   * Senza questo, il gesto piu` usato del sistema **chiudeva l'app**: premuto
   * durante una chiamata usciva dalla stanza uccidendo l'applicazione, e dalle
   * impostazioni non tornava all'elenco. Un router scritto a mano non ha un
   * concetto di «indietro» finche` non glielo si da`.
   *
   * Restituire `true` dice ad Android che il gesto e` stato gestito qui. Sulla
   * schermata d'accesso e sull'elenco si restituisce `false`: li` «indietro»
   * significa davvero uscire dall'app, ed e` il comportamento che ci si
   * aspetta.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (route.name === 'settings') {
          setRoute({ name: 'sessions' });
          return true;
        }
        if (route.name === 'call') {
          // La chiamata si chiude passando dall'uscita normale, cosi` la
          // stanza viene lasciata invece di restare aperta a nome nostro.
          setRoute({ name: 'sessions' });
          return true;
        }
        return false;
      }
    );
    return () => subscription.remove();
  }, [route.name]);

  /*
   * Toccare la notifica di una chiamata deve portare dentro la stanza, non
   * alla lista. È tutta la differenza fra «il telefono ha suonato» e «sono in
   * chiamata»: il percorso arriva dal server dentro la notifica, e qui si
   * traduce nella sessione corrispondente.
   */
  useEffect(() => {
    return onNotificationTap(async (url) => {
      const bookingId = bookingIdFromUrl(url);
      if (!bookingId) return;
      try {
        const { sessions } = await fetchSessions();
        const session = sessions.find((s) => s.bookingId === bookingId);
        // Se la sessione non è nell'elenco (finita, o non ancora aperta) si
        // resta dove si è: meglio della schermata chiamata che fallisce.
        if (session) setRoute({ name: 'call', session });
      } catch {
        // Senza rete non si apre nulla: la lista resta il punto di partenza.
      }
    });
  }, []);

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <Chrome
          route={route}
          onSignedIn={signedIn}
          onSignedOut={signedOut}
          onOpenCall={openCall}
          onOpenSettings={() => setRoute({ name: 'settings' })}
          onBack={() => setRoute({ name: 'sessions' })}
        />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

/**
 * Separato da `App` per una ragione sola: la barra di stato deve sapere che
 * tema è in uso, e `useTheme` funziona solo dentro il provider.
 */
function Chrome({
  route,
  onSignedIn,
  onSignedOut,
  onOpenCall,
  onOpenSettings,
  onBack,
}: {
  route: Route;
  onSignedIn: () => void;
  onSignedOut: () => void;
  onOpenCall: (session: UpcomingSession) => void;
  onOpenSettings: () => void;
  onBack: () => void;
}) {
  const { resolved } = useTheme();

  return (
    <>
      {/* Su fondo chiaro le icone di sistema vanno scure, o spariscono. */}
      <StatusBar style={resolved === 'light' ? 'dark' : 'light'} />
      {route.name === 'login' && <LoginScreen onSignedIn={onSignedIn} />}
      {route.name === 'sessions' && (
        <SessionsScreen onOpenCall={onOpenCall} onOpenSettings={onOpenSettings} />
      )}
      {route.name === 'settings' && (
        <SettingsScreen onClose={onBack} onSignedOut={onSignedOut} />
      )}
      {route.name === 'call' && (
        <CallScreen session={route.session} onLeave={onBack} />
      )}
    </>
  );
}
