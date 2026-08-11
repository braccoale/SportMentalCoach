import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { fetchSessions, type UpcomingSession } from '../lib/api';
import { signOut } from '../lib/auth';
import { theme } from '../theme';

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
  onSignedOut,
}: {
  onOpenCall: (session: UpcomingSession) => void;
  onSignedOut: () => void;
}) {
  const [sessions, setSessions] = useState<UpcomingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchSessions();
      setSessions(data.sessions);
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

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Le tue sessioni</Text>
        <Pressable
          onPress={async () => {
            await signOut();
            onSignedOut();
          }}
        >
          <Text style={styles.signOut}>Esci</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.red} style={styles.loader} />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => String(item.bookingId)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={load}
              tintColor={theme.mid}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {error ?? 'Nessuna sessione in programma.'}
            </Text>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onOpenCall(item)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <Text style={styles.when}>{whenLabel(item.scheduledFor)}</Text>
              <Text style={styles.who}>{item.otherName}</Text>
              <Text style={styles.meta}>
                {item.title} · {item.durationMin} min
              </Text>
              <Text style={styles.enter}>Entra nella stanza →</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { color: theme.hi, fontSize: 26, fontWeight: '800' },
  signOut: { color: theme.mid, fontSize: 14 },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: theme.ink2,
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 4,
  },
  pressed: { opacity: 0.85 },
  when: {
    color: theme.red2,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  who: { color: theme.hi, fontSize: 19, fontWeight: '700' },
  meta: { color: theme.mid, fontSize: 13 },
  enter: { color: theme.hi, fontSize: 14, fontWeight: '600', marginTop: 10 },
  empty: { color: theme.low, textAlign: 'center', marginTop: 40 },
});
