import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { MaterialIcons } from '@expo/vector-icons';
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
  /**
   * In chiamata. `minimized` non e` un'altra schermata: e` la stessa, disegnata
   * come una barra sopra l'elenco — la stanza resta collegata.
   */
  | { name: 'call'; session: UpcomingSession; minimized: boolean };

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

  /*
   * Il carattere delle icone va caricato, non dato per scontato.
   *
   * `@expo/vector-icons` disegna le icone con un font, e finché quel font non
   * è in memoria ogni icona è uno spazio vuoto. Nell'app si vedevano un
   * cerchio rosso senza il «+» dentro e tre puntini invisibili: non icone
   * sbagliate — icone **assenti**, perché non c'era niente da cui disegnarle.
   *
   * Non blocca la partenza: `useFonts` restituisce subito e l'interfaccia si
   * ridisegna quando il font arriva. Il vuoto dura un istante invece che per
   * sempre.
   */
  useFonts(MaterialIcons.font);

  const openCall = useCallback(
    (session: UpcomingSession) =>
      setRoute({ name: 'call', session, minimized: false }),
    []
  );

  const setMinimized = useCallback(
    (minimized: boolean) =>
      setRoute((current) =>
        current.name === 'call' ? { ...current, minimized } : current
      ),
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
        /*
         * Con una chiamata ridotta, «indietro» la riapre: non esce dall'app.
         *
         * Ridotta, la sessione e` viva ma quasi invisibile — una barra in
         * fondo. Lasciare che il gesto piu` frequente di Android chiuda l'app
         * sopra una seduta in corso significherebbe farla proseguire a
         * insaputa di chi crede di averla lasciata. Riaprendola, chi voleva
         * davvero chiudere si trova davanti il pulsante rosso.
         *
         * A schermo pieno non si arriva qui: `CallScreen` registra il proprio
         * gestore dopo, e viene consultato per primo.
         */
        if (route.name === 'call') {
          setRoute((current) =>
            current.name === 'call' ? { ...current, minimized: false } : current
          );
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
        if (session) setRoute({ name: 'call', session, minimized: false });
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
          onMinimize={setMinimized}
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
  onMinimize,
}: {
  route: Route;
  onSignedIn: () => void;
  onSignedOut: () => void;
  onOpenCall: (session: UpcomingSession) => void;
  onOpenSettings: () => void;
  onBack: () => void;
  onMinimize: (minimized: boolean) => void;
}) {
  const { resolved } = useTheme();

  return (
    <>
      {/* Su fondo chiaro le icone di sistema vanno scure, o spariscono. */}
      <StatusBar style={resolved === 'light' ? 'dark' : 'light'} />
      {route.name === 'login' && <LoginScreen onSignedIn={onSignedIn} />}
      {/*
        Le impostazioni stanno **sopra** l'elenco, non al suo posto.

        Prima erano schermate alternative: aprire le impostazioni distruggeva
        l'elenco, e tornare indietro lo ricostruiva da zero — niente dati, e
        una nuova richiesta al server da attendere. Se quella richiesta non
        tornava, restava la rotella a girare su una lista vuota: cambiavi il
        tema, tornavi, e non c'era piu' niente.

        Sovrapporle e' anche il comportamento che ci si aspetta: si va nelle
        impostazioni e si torna dov'eravamo, non si riparte.
      */}
      {(route.name === 'sessions' ||
        route.name === 'settings' ||
        (route.name === 'call' && route.minimized)) && (
        <SessionsScreen onOpenCall={onOpenCall} onOpenSettings={onOpenSettings} />
      )}
      {route.name === 'settings' && (
        // Riempie lo schermo per intero: due fratelli con `flex: 1` se lo
        // dividerebbero a meta`, mostrando entrambe le schermate dimezzate.
        <View style={StyleSheet.absoluteFill}>
          <SettingsScreen onClose={onBack} onSignedOut={onSignedOut} />
        </View>
      )}
      {route.name === 'call' && (
        /*
          A schermo pieno riempie tutto; ridotta, e` una barra che si posiziona
          da se` e non deve rubare spazio all'elenco sotto.
        */
        <View
          style={StyleSheet.absoluteFill}
          /*
            Ridotta, i tocchi devono attraversare: sotto c'e` l'elenco, e solo
            la barra li raccoglie. A schermo pieno se li prende tutti lei.
          */
          pointerEvents={route.minimized ? 'box-none' : 'auto'}
        >
          <CallScreen
            session={route.session}
            onLeave={onBack}
            minimized={route.minimized}
            onMinimize={() => onMinimize(true)}
            onExpand={() => onMinimize(false)}
          />
        </View>
      )}
    </>
  );
}
