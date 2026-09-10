import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerGlobals } from '@livekit/react-native';
import { LoginScreen } from './src/screens/LoginScreen';
import { SessionsScreen } from './src/screens/SessionsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { CallScreen } from './src/screens/CallScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { ThemeProvider, useTheme } from './src/theme';
import { API_BASE_URL, IS_TEST_ENV } from './src/lib/config';
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
   * Quale delle due schermate di base si vede.
   *
   * **Non e' una rotta.** Tenerla fuori da `route` e' quello che salva la
   * chiamata: `CallScreen` vive come sovrapposizione, e una chiamata ridotta
   * deve poter restare viva mentre sotto si passa da «Oggi» all'elenco. Se il
   * cambio di scheda passasse dallo stesso stato della chiamata, cambiare
   * scheda la smonterebbe — cioe' riaggancerebbe la stanza LiveKit a meta'
   * seduta.
   *
   * Ed e' anche il motivo per cui qui non entra una libreria di navigazione:
   * per due schede non serve, e ognuna porterebbe con se' il proprio ciclo di
   * vita da conciliare con quello della chiamata.
   */
  const [baseTab, setBaseTab] = useState<'today' | 'sessions'>('sessions');
  /** `null` finche' il server non lo dice: la barra non si mostra a indovinare. */
  const [isCoach, setIsCoach] = useState<boolean | null>(null);

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
    setBaseTab('sessions');
    setIsCoach(null);
    // Il permesso si chiede a persona riconosciuta, non all'ignoto che apre
    // l'app per la prima volta.
    void registerForPushNotifications().then((token) => {
      pushToken.current = token;
    });
  }, []);

  const signedOut = useCallback(() => {
    void unregisterPushNotifications(pushToken.current);
    pushToken.current = null;
    setIsCoach(null);
    setBaseTab('sessions');
    setRoute({ name: 'login' });
  }, []);

  /*
   * Il ruolo arriva una volta sola, e l'atleta apre su «Oggi».
   *
   * E' la schermata per cui l'app esiste fra due sedute; il coach invece apre
   * l'app per la seduta, e per lui la barra non compare affatto.
   */
  const learnRole = useCallback((coach: boolean) => {
    setIsCoach((current) => {
      if (current === coach) return current;
      if (!coach) setBaseTab('today');
      return coach;
    });
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
        {/*
          L'indicatore d'ambiente, sempre in cima, sopra ogni schermata.

          Non e' un dettaglio estetico: e' l'unica cosa che impedisce a chi sta
          collaudando di scambiare un dato di prova per uno vero, o viceversa.
          Compare solo quando `EXPO_PUBLIC_ENV=test` — l'app di produzione non
          lo mostra mai, e non lo mostrera' mai per errore, perche' il valore
          di default di `ENV` e` `'production'`.
        */}
        {IS_TEST_ENV ? <TestEnvironmentBanner /> : null}
        <Chrome
          route={route}
          onSignedIn={signedIn}
          onSignedOut={signedOut}
          onOpenCall={openCall}
          onOpenSettings={() => setRoute({ name: 'settings' })}
          onBack={() => setRoute({ name: 'sessions' })}
          onMinimize={setMinimized}
          baseTab={baseTab}
          onBaseTab={setBaseTab}
          isCoach={isCoach}
          onRole={learnRole}
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
  baseTab,
  onBaseTab,
  isCoach,
  onRole,
}: {
  route: Route;
  onSignedIn: () => void;
  onSignedOut: () => void;
  onOpenCall: (session: UpcomingSession) => void;
  onOpenSettings: () => void;
  onBack: () => void;
  onMinimize: (minimized: boolean) => void;
  baseTab: 'today' | 'sessions';
  onBaseTab: (tab: 'today' | 'sessions') => void;
  isCoach: boolean | null;
  onRole: (isCoach: boolean) => void;
}) {
  const { resolved, theme } = useTheme();

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
        <>
          {/*
            Le due schermate di base restano **entrambe montate**, e si nasconde
            quella che non serve.

            Smontarle a ogni cambio di scheda vorrebbe dire ricaricare da capo:
            elenco vuoto, rotella, e — se la richiesta non tornasse — niente. E'
            lo stesso motivo per cui le impostazioni si sovrappongono all'elenco
            invece di sostituirlo. `display: none` toglie dallo schermo senza
            toccare lo stato di chi c'e' dentro.

            L'elenco e' montato sempre, anche per l'atleta che apre su «Oggi»:
            e' lui a chiedere al server il ruolo, ed e' da quella risposta che
            dipende la barra.
          */}
          {isCoach === false ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                baseTab === 'today' ? null : styles.hidden,
              ]}
              pointerEvents={baseTab === 'today' ? 'auto' : 'none'}
            >
              <TodayScreen
                onOpenSettings={onOpenSettings}
                onOpenCall={onOpenCall}
              />
            </View>
          ) : null}

          <View
            style={[
              StyleSheet.absoluteFill,
              isCoach === false && baseTab === 'today' ? styles.hidden : null,
            ]}
            pointerEvents={
              isCoach === false && baseTab === 'today' ? 'none' : 'auto'
            }
          >
            <SessionsScreen
              onOpenCall={onOpenCall}
              onOpenSettings={onOpenSettings}
              onRole={onRole}
            />
          </View>

          {/*
            La barra compare **solo all'atleta**, e solo quando il server ha
            detto il ruolo: mostrarla mentre si indovina significherebbe farla
            comparire e sparire sotto il dito. Il coach apre l'app per la
            seduta, e «Oggi» non e' una schermata sua.

            Non compare nemmeno sopra una chiamata ridotta: li' la barra della
            chiamata ha la precedenza, ed e' l'unica cosa che deve stare in
            fondo allo schermo.
          */}
          {isCoach === false && route.name !== 'call' ? (
            <View
              style={[
                styles.tabs,
                { backgroundColor: theme.ink2, borderTopColor: theme.line },
              ]}
            >
              {(
                [
                  ['today', 'Oggi'],
                  ['sessions', 'Sessioni'],
                ] as const
              ).map(([key, label]) => (
                <Pressable
                  key={key}
                  accessibilityRole="tab"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: baseTab === key }}
                  onPress={() => onBaseTab(key)}
                  style={styles.tab}
                >
                  <Text
                    style={{
                      color: baseTab === key ? theme.hi : theme.low,
                      fontSize: 13,
                      fontWeight: baseTab === key ? '700' : '500',
                    }}
                  >
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
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

/**
 * L'indicatore d'ambiente.
 *
 * Mostra l'host a cui l'app sta parlando, non solo la scritta «test»: due
 * ambienti di prova diversi (il backend isolato di oggi, quello di domani)
 * si distinguono a colpo d'occhio, invece di doversi fidare di un'etichetta
 * uguale per entrambi.
 */
function TestEnvironmentBanner() {
  const host = API_BASE_URL.replace(/^https?:\/\//, '');
  return (
    <View style={testBannerStyles.bar} pointerEvents="none">
      <Text style={testBannerStyles.text} numberOfLines={1}>
        AMBIENTE DI TEST · {host}
      </Text>
    </View>
  );
}

const testBannerStyles = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    // Sopra tutto il resto, comprese le schermate di chiamata: se un giorno
    // qualcuno testasse LiveKit con questa build, deve continuare a vederlo.
    zIndex: 1000,
    backgroundColor: '#7a1fa2',
    paddingTop: 44,
    paddingBottom: 6,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

const styles = StyleSheet.create({
  tabs: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    // Sopra la tacca dei telefoni senza tasto: la barra non e' cliccabile
    // fin sul bordo, e le due voci restano lontane dal gesto di sistema.
    paddingBottom: 22,
    paddingTop: 10,
  },
  /*
   * Nascosta, non smontata: lo stato della schermata sotto resta dov'era, e
   * tornarci non fa ripartire nessuna richiesta.
   */
  hidden: { display: 'none' },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
