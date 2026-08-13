import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { decideBooking, fetchSessions, type UpcomingSession } from '../lib/api';
import { currentSession } from '../lib/auth';
import { SessionActionsSheet } from '../components/SessionActionsSheet';
import { NewAppointmentSheet } from '../components/NewAppointmentSheet';
import { SessionHeroCard } from '../components/SessionHeroCard';
import { SessionHistoryRow } from '../components/SessionHistoryRow';
import { Icon } from '../components/Icon';
import { useTheme, type Palette } from '../theme';

/**
 * L'elenco delle sessioni: cosa sta per succedere, e cosa è già successo.
 *
 * Due parti con due compiti diversi. In alto **i prossimi appuntamenti**, in
 * schede grandi con la foto e l'azione principale: è la cosa per cui si apre
 * l'app, e deve rispondere alla domanda «e adesso?» senza far scorrere niente.
 * Quando ce n'è più di uno si scorrono di lato, così la cronologia sotto non
 * viene spinta fuori schermo dal numero di appuntamenti.
 *
 * Sotto **la cronologia**, con i filtri: uno storico che cresce all'infinito
 * senza un modo di restringerlo diventa illeggibile dopo il primo mese.
 */
type Filter = 'tutte' | 'completate' | 'trascorse' | 'annullate';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'tutte', label: 'Tutte' },
  { key: 'completate', label: 'Completate' },
  { key: 'trascorse', label: 'Trascorse' },
  { key: 'annullate', label: 'Annullate' },
];

export function SessionsScreen({
  onOpenCall,
  onOpenSettings,
}: {
  onOpenCall: (session: UpcomingSession) => void;
  onOpenSettings: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [past, setPast] = useState<UpcomingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initial, setInitial] = useState('·');
  const [now, setNow] = useState(() => Date.now());
  const [menuFor, setMenuFor] = useState<UpcomingSession | null>(null);
  const [deciding, setDeciding] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('tutte');

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

  useEffect(() => {
    void currentSession().then((session) => {
      const email = session?.user.email ?? '';
      if (email) setInitial(email.slice(0, 1).toUpperCase());
    });
  }, []);

  /*
   * Ricarica al ritorno in primo piano e ogni minuto mentre è aperta.
   *
   * Non è tempo reale — per quello serve che il server sappia avvisare — ma
   * toglie il caso in cui l'elenco resta fermo a com'era all'accesso mentre
   * qualcosa è cambiato dall'altra parte.
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

  async function respond(session: UpcomingSession, accept: boolean) {
    setDeciding(session.bookingId);
    try {
      await decideBooking(session.bookingId, accept);
      await load();
    } catch {
      setError('Non sono riuscito a rispondere alla richiesta.');
    } finally {
      setDeciding(null);
    }
  }

  const visiblePast = past.filter((session) => {
    if (filter === 'tutte') return true;
    if (filter === 'completate') return session.status === 'completed';
    if (filter === 'annullate')
      return session.status === 'cancelled' || session.status === 'declined';
    return session.status === 'accepted' || session.status === 'expired';
  });

  /*
   * La larghezza del carosello.
   *
   * Le schede si fermano poco prima del bordo, così si intravede la successiva:
   * senza quel bordo visibile, nessuno scopre che si può scorrere.
   */
  const cardWidth = Dimensions.get('window').width - 60;
  const pastIds = new Set(past.map((s) => s.bookingId));

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Le tue sessioni</Text>
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

      {error && !loading && (
        <Text style={styles.banner} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}

      {loading ? (
        <ActivityIndicator color={theme.green} style={styles.loader} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={load} tintColor={theme.mid} />
          }
        >
          <Text style={styles.section}>
            {sessions.length === 1
              ? 'Prossimo appuntamento'
              : `Prossimi appuntamenti${sessions.length ? ` (${sessions.length})` : ''}`}
          </Text>

          {sessions.length === 0 ? (
            /*
             * «Nessuna sessione» solo quando e` vero.
             *
             * Se la richiesta e` fallita non sappiamo cosa c'e`: dirlo lo
             * stesso e` una bugia, e per giunta quella piu` scoraggiante —
             * chi legge pensa di non avere appuntamenti e chiude l'app.
             */
            <View style={styles.emptyBox}>
              {error ? (
                <>
                  <Text style={styles.emptyTitle}>Non ho i tuoi appuntamenti</Text>
                  <Text style={styles.empty}>
                    La connessione non ha risposto. Non vuol dire che non ce ne
                    siano.
                  </Text>
                  <Pressable
                    onPress={() => {
                      setLoading(true);
                      void load();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Riprova a caricare le sessioni"
                    style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
                  >
                    <Text style={styles.retryText}>Riprova</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>
                    Nessuna sessione in programma
                  </Text>
                  <Text style={styles.empty}>
                    {isCoach
                      ? 'Quando un atleta prenota, la sessione compare qui.'
                      : 'Prenota una sessione con il tuo coach, e la trovi qui.'}
                  </Text>
                </>
              )}
            </View>
          ) : sessions.length === 1 ? (
            <SessionHeroCard
              session={sessions[0]}
              now={now}
              deciding={deciding === sessions[0].bookingId}
              onOpenCall={() => onOpenCall(sessions[0])}
              onMenu={() => setMenuFor(sessions[0])}
              onDecide={(accept) => void respond(sessions[0], accept)}
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardWidth + 12}
              decelerationRate="fast"
              contentContainerStyle={styles.carousel}
            >
              {sessions.map((session) => (
                <SessionHeroCard
                  key={session.bookingId}
                  session={session}
                  now={now}
                  wide={cardWidth}
                  deciding={deciding === session.bookingId}
                  onOpenCall={() => onOpenCall(session)}
                  onMenu={() => setMenuFor(session)}
                  onDecide={(accept) => void respond(session, accept)}
                />
              ))}
            </ScrollView>
          )}

          {past.length > 0 && (
            <>
              <Text style={styles.section}>La tua storia</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filters}
              >
                {FILTERS.map((item) => {
                  const on = filter === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      onPress={() => setFilter(item.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={[styles.filter, on && styles.filterOn]}
                    >
                      <Text style={[styles.filterText, on && styles.filterTextOn]}>
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.history}>
                {visiblePast.map((session) => (
                  <SessionHistoryRow
                    key={session.bookingId}
                    session={session}
                    onMenu={() => setMenuFor(session)}
                  />
                ))}
                {visiblePast.length === 0 && (
                  <Text style={styles.empty}>
                    Nessuna sessione in questa categoria.
                  </Text>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}

      <Pressable
        onPress={() => setNewOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Nuovo appuntamento"
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + 24 },
          pressed && styles.pressed,
        ]}
      >
        <Icon name="add" size={26} color="#fff" />
      </Pressable>

      {menuFor && (
        <SessionActionsSheet
          session={menuFor}
          past={pastIds.has(menuFor.bookingId)}
          visible
          onClose={() => setMenuFor(null)}
          onChanged={() => void load()}
        />
      )}

      <NewAppointmentSheet
        visible={newOpen}
        isCoach={isCoach}
        onClose={() => setNewOpen(false)}
        onCreated={() => void load()}
      />
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
      paddingBottom: 12,
    },
    title: { color: theme.hi, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
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
    loader: { marginTop: 40 },
    body: { paddingHorizontal: 20, paddingBottom: 110, gap: 10 },
    section: {
      color: theme.mid,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 14,
    },
    carousel: { gap: 12, paddingRight: 20 },
    filters: { gap: 8, paddingVertical: 4 },
    filter: {
      paddingHorizontal: 16,
      minHeight: 38,
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: theme.surface,
    },
    filterOn: { backgroundColor: theme.green },
    filterText: { color: theme.mid, fontSize: 13, fontWeight: '600' },
    filterTextOn: { color: '#fff', fontWeight: '700' },
    history: { gap: 10, marginTop: 4 },
    emptyBox: { marginTop: 20, gap: 8, alignItems: 'flex-start' },
    retry: {
      marginTop: 8,
      minHeight: 48,
      paddingHorizontal: 24,
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.line,
    },
    retryText: { color: theme.hi, fontSize: 15, fontWeight: '700' },
    emptyTitle: { color: theme.hi, fontSize: 17, fontWeight: '700' },
    empty: { color: theme.mid, fontSize: 14, lineHeight: 20 },
    banner: {
      color: '#fff',
      backgroundColor: theme.red,
      marginHorizontal: 20,
      marginBottom: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      fontSize: 13,
    },
    fab: {
      position: 'absolute',
      right: 20,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: theme.green,
      alignItems: 'center',
      justifyContent: 'center',
      // Disegnato sopra non basta: su Android serve anche per ricevere i tocchi.
      elevation: 8,
      zIndex: 10,
    },
    pressed: { opacity: 0.85 },
  });
