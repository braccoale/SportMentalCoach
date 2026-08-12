import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Linking } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../lib/config';
import { fetchSessions, type UpcomingSession } from '../lib/api';
import {
  countdownLabel,
  dayKey,
  dayTitle,
  timeLabel,
} from '../lib/day-grouping';
import { currentSession } from '../lib/auth';
import { useTheme, type Palette } from '../theme';

/** «Oggi alle 18:40», «domani alle 9:00», o la data per il resto. */
function whenLabel(iso: string | null): string {
  if (!iso) return 'Senza orario';
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(date);

  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  if (sameDay(date, today)) return `Oggi alle ${time}`;
  if (sameDay(date, tomorrow)) return `Domani alle ${time}`;
  return `${new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  }).format(date)} alle ${time}`;
}


type Row =
  | { kind: 'header'; title: string }
  | {
      kind: 'session';
      session: UpcomingSession;
      past: boolean;
      hero?: boolean;
      /** Sotto un'intestazione di giorno basta l'ora; nelle passate serve la data. */
      timeOnly?: boolean;
    };

/**
 * L'elenco delle prossime sessioni: l'unica schermata fra l'accesso e la
 * chiamata.
 *
 * Deliberatamente povera. L'app non è la dashboard in tasca — è il modo per
 * essere in chiamata dal telefono. Tutto ciò che si legge con calma (storico,
 * riepiloghi, chat, prenotazioni) resta sul web, dove c'è lo spazio per farlo.
 */
export function SessionsScreen({
  onOpenCall,
  onOpenSettings,
}: {
  onOpenCall: (session: UpcomingSession) => void;
  onOpenSettings: () => void;
}) {
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [past, setPast] = useState<UpcomingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [initial, setInitial] = useState('\u00b7');
  // Il conto alla rovescia va aggiornato, non calcolato una volta sola: una
  // schermata aperta che dice \u00abfra 12 minuti\u00bb per mezz'ora sta mentendo.
  const [now, setNow] = useState(() => Date.now());
  // Il ruolo serve solo allo stato vuoto, e lo si sa da una sessione qualsiasi.
  const isCoach = sessions[0]?.viewerIsCoach ?? past[0]?.viewerIsCoach ?? false;

  const load = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data.sessions);
      setPast(data.past ?? []);
      setError(null);
    } catch {
      setError('Non riesco a caricare le sessioni.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // L’iniziale al posto di una foto: non abbiamo un’immagine del profilo, e un
  // segnaposto generico non direbbe di chi è questo spazio.
  useEffect(() => {
    void currentSession().then((session) => {
      const email = session?.user.email ?? '';
      if (email) setInitial(email.slice(0, 1).toUpperCase());
    });
  }, []);

  /*
   * Ricarica quando l'app torna in primo piano, e ogni minuto mentre è aperta.
   *
   * Non è tempo reale — per quello serve che il server sappia avvisare, ed è
   * un'altra cosa. È il rimedio al caso concreto: una sessione creata dal web
   * mentre il telefono era in tasca, e un elenco che restava fermo a com'era
   * al momento dell'accesso finché non lo si trascinava a mano.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load();
    });
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      setNow(Date.now());
      void load();
    }, 60_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [load]);

  /*
   * Una lista sola con due intestazioni, invece di due liste.
   *
   * Le passate non hanno un elenco proprio perché non sono una destinazione:
   * si scorre in fondo alle prossime e ci si trova dentro. Con poche sessioni
   * — il caso normale — due schede separate sarebbero due schermate quasi
   * vuote.
   */
  const rows: Row[] = [];

  /*
   * Le prossime, raggruppate per giorno.
   *
   * La prima resta diversa dalle altre: prima erano tutte schede identiche,
   * quindi quella fra dieci minuti pesava quanto quella di giovedì, e «Entra
   * nella stanza» si ripeteva su ognuna — cinque inviti identici sono rumore,
   * non cinque inviti. Ora la prossima è alta e ha l'unico pulsante pieno
   * della schermata; le altre sono righe compatte, toccabili per intero.
   */
  let lastDay: string | null = null;
  sessions.forEach((session, index) => {
    const key = dayKey(session.scheduledFor);
    if (key !== lastDay) {
      rows.push({ kind: 'header', title: dayTitle(session.scheduledFor) });
      lastDay = key;
    }
    rows.push({
      kind: 'session',
      session,
      past: false,
      hero: index === 0 && session.status !== 'requested',
      timeOnly: true,
    });
  });

  /*
   * Le passate non si raggruppano per giorno: si estendono su mesi, e una
   * intestazione per ciascuno darebbe più titoli che righe. Lì la data resta
   * sulla riga, dove serve.
   */
  if (past.length) {
    rows.push({ kind: 'header', title: 'Passate' });
    past.forEach((session) => {
      rows.push({ kind: 'session', session, past: true });
    });
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Le tue sessioni</Text>
        {/*
          * Il proprio nome in alto a destra, non «Esci».
          *
          * «Esci» era l'unica cosa raggiungibile da qui, ed era anche la piu`
          * distruttiva: un tocco sbagliato e si ricominciava dall'accesso. Ora
          * il tocco porta dove uno si aspetta di trovare le proprie cose, e
          * l'uscita e` una voce dentro, dove va chiesta apposta.
          */}
        <Pressable
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="Impostazioni"
          hitSlop={12}
          style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
        >
          <Text style={styles.avatarText}>{initial}</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.red} style={styles.loader} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) =>
            item.kind === 'header' ? item.title : String(item.session.bookingId)
          }
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={load}
              tintColor={theme.mid}
            />
          }
          ListEmptyComponent={
            /*
             * Uno stato vuoto che dice solo «niente» lascia fermi.
             *
             * Deve dire **perché** è vuoto e cosa lo riempirebbe — e la
             * risposta non è la stessa per tutti: un atleta senza sessioni ne
             * deve prenotare una, un coach ne aspetta una. Stessa schermata,
             * due situazioni diverse.
             */
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>
                {error ?? 'Nessuna sessione in programma'}
              </Text>
              {!error && (
                <Text style={styles.empty}>
                  {isCoach
                    ? 'Quando un atleta prenota, la sessione compare qui.'
                    : 'Prenota una sessione con il tuo coach su KaiPai, e la trovi qui.'}
                </Text>
              )}
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === 'header') {
              return <Text style={styles.section}>{item.title}</Text>;
            }
            const session = item.session;
            const waiting = session.status === 'requested';
            const openable = !item.past && !waiting;
            const countdown = item.hero
              ? countdownLabel(session.scheduledFor, now)
              : null;

            return (
              <Pressable
                // Una sessione passata o ancora da accettare non ha una stanza
                // da aprire: la scheda resta leggibile ma non porta da nessuna
                // parte, invece di portare a un errore.
                onPress={openable ? () => onOpenCall(session) : undefined}
                disabled={!openable}
                accessibilityRole={openable ? 'button' : undefined}
                accessibilityLabel={
                  openable
                    ? `Sessione con ${session.otherName}, ${whenLabel(session.scheduledFor)}. Entra nella stanza.`
                    : undefined
                }
                style={({ pressed }) => [
                  item.hero ? styles.hero : styles.row,
                  item.past && styles.rowPast,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.when,
                    // Il rosso resta alla sola sessione imminente: se ogni
                    // riga grida, non si sente piu` niente.
                    item.hero ? styles.whenHero : styles.whenQuiet,
                  ]}
                >
                  {countdown ??
                    (item.timeOnly
                      ? timeLabel(session.scheduledFor)
                      : whenLabel(session.scheduledFor))}
                </Text>
                <Text style={item.hero ? styles.whoHero : styles.who}>
                  {session.otherName}
                </Text>
                <Text style={styles.meta}>
                  {session.title} · {session.durationMin} min
                </Text>

                {waiting && (
                  /*
                   * La stessa riga dice due cose opposte a seconda di chi
                   * guarda: per l'atleta è un'attesa, per il coach è una cosa
                   * da fare. Una formula sola — «in attesa» — lascerebbe il
                   * coach a pensare che tocchi a qualcun altro.
                   */
                  <Text style={waiting && isCoach ? styles.todo : styles.waiting}>
                    {isCoach
                      ? 'Ti ha chiesto una sessione · rispondi dal web'
                      : 'In attesa che il coach accetti'}
                  </Text>
                )}
                {item.hero && (
                  <View style={styles.enterButton}>
                    <Text style={styles.enterButtonText}>Entra nella stanza</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}

      {/*
        * Il «+» apre la prenotazione sul web.
        *
        * Creare un appuntamento vuol dire scegliere persona, servizio,
        * durata e slot fra le disponibilita`: un flusso intero, che sul
        * telefono va progettato, non compresso. Finche` non esiste, il
        * pulsante porta dove la cosa si fa davvero invece di aprire una
        * versione mutilata — o peggio, di non esserci e lasciare che uno
        * lo cerchi.
        */}
      <Pressable
        onPress={() => {
          void Linking.openURL(
            `${API_BASE_URL}/dashboard/${isCoach ? 'coach' : 'athlete'}`
          );
        }}
        accessibilityRole="button"
        accessibilityLabel="Nuovo appuntamento"
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 24 },
          pressed && styles.pressed,
        ]}
      >
        <MaterialIcons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { color: theme.hi, fontSize: 26, fontWeight: '800' },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.surface,
    borderColor: theme.line,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: theme.hi, fontSize: 16, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Per il coach non e` un'attesa: e` una cosa da fare, e si vede.
  todo: { color: theme.red2, fontSize: 13, fontWeight: '600', marginTop: 10 },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  hero: {
    backgroundColor: theme.ink2,
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    gap: 4,
  },
  // Le altre non sono schede: senza sfondo né bordo si leggono come un
  // elenco, e la prossima resta l’unica cosa che sporge dalla pagina.
  // Schede anche per le altre, non solo per la prossima: un elenco di sole
  // righe nude su fondo nero sembra un registro, non delle sessioni. La
  // prossima resta distinguibile perche` ha bordo, piu` spazio e il
  // pulsante — non perche` le altre sono spoglie.
  row: {
    backgroundColor: theme.ink2,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 2,
  },
  //
  // Le passate si distinguono col colore, non con l’opacità: opacity
  // schiaccia anche il contrasto del testo, e una riga al 55% scende sotto
  // la soglia di leggibilità — un problema di accessibilità, non una scelta
  // estetica.
  rowPast: { backgroundColor: theme.surface },
  section: {
    color: theme.mid,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 12,
  },
  waiting: { color: theme.mid, fontSize: 13, fontStyle: 'italic', marginTop: 10 },
  pressed: { opacity: 0.85 },
  when: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  whenHero: { color: theme.red2 },
  whenQuiet: { color: theme.mid },
  who: { color: theme.hi, fontSize: 16, fontWeight: '600' },
  whoHero: { color: theme.hi, fontSize: 24, fontWeight: '800', letterSpacing: -0.3 },
  meta: { color: theme.mid, fontSize: 13 },
  enterButton: {
    backgroundColor: theme.red,
    borderRadius: 999,
    minHeight: 48,
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  emptyBox: { marginTop: 48, gap: 8, paddingHorizontal: 8 },
  emptyTitle: { color: theme.hi, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  empty: { color: theme.mid, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
