import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  closeAthletePath,
  fetchToday,
  reopenAthletePath,
  setCommitmentPause,
  type TodayAction,
  type TodayAttempt,
  type TodayPayload,
  type UpcomingSession,
} from '../lib/api';
import { currentSession } from '../lib/auth';
import { dayTitle, timeLabel } from '../lib/day-grouping';
import { AttemptSheet } from '../components/AttemptSheet';
import { useTheme, type Palette } from '../theme';

/**
 * «Oggi»: la schermata dell'atleta fra due sedute.
 *
 * **Chi, e per cosa.** L'atleta, quando apre l'app in un momento qualunque
 * della settimana. Lo scopo non e' usare l'app: e' arrivare alla prossima
 * seduta avendo provato qualcosa e avendo qualcosa da raccontare. L'azione
 * primaria e' una sola — rispondere all'azione in corso — e prende il
 * trattamento piu' evidente; tutto il resto sta sotto e non compete.
 *
 * **Lo stato lo decide il server.** Sette situazioni, e questa schermata non ne
 * sceglie nessuna: riceve quale mostrare, con quale titolo e quale spiegazione.
 * Ricalcolarle qui vorrebbe dire un secondo insieme di condizioni da tenere
 * allineato, ed e' la cosa che in questo prodotto e' gia' costata due volte —
 * sugli orari prenotabili e sullo stato delle richieste.
 *
 * **I vuoti dicono perche' sono vuoti** e non propongono mai un esercizio
 * inventato: il testo arriva da `todayCopy`, che ha un test dedicato proprio a
 * questo.
 */
export function TodayScreen({
  onOpenSettings,
  onOpenCall,
}: {
  onOpenSettings: () => void;
  /** Entrare in chiamata dalla scheda, quando la stanza e' aperta adesso. */
  onOpenCall: (session: UpcomingSession) => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [today, setToday] = useState<TodayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetFor, setSheetFor] = useState<TodayAction | null>(null);
  const [editing, setEditing] = useState<TodayAttempt | null>(null);
  const [pausing, setPausing] = useState<number | null>(null);
  const [closingPath, setClosingPath] = useState<number | null>(null);
  const [reopeningPath, setReopeningPath] = useState<number | null>(null);
  /** L'iniziale nel cerchio: la stessa porta per le impostazioni dell'elenco. */
  const [initial, setInitial] = useState('·');

  useEffect(() => {
    void currentSession().then((session) => {
      const email = session?.user.email ?? '';
      if (email) setInitial(email.slice(0, 1).toUpperCase());
    });
  }, []);

  const load = useCallback(async () => {
    try {
      setToday(await fetchToday());
      setError(null);
    } catch {
      // L'ultimo caricamento resta a schermo: svuotare la schermata per un
      // errore di rete toglie anche quello che si era gia' letto.
      setError('Non riesco a caricare. Riprova.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Al ritorno in primo piano si ricarica.
   *
   * Lo stato dipende dal minuto — la stanza apre cinque minuti prima — e una
   * schermata rimasta aperta in tasca per un'ora direbbe una cosa falsa.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void load();
    });
    return () => subscription.remove();
  }, [load]);

  const togglePause = async (action: TodayAction) => {
    setPausing(action.commitmentId);
    try {
      await setCommitmentPause({
        commitmentId: action.commitmentId,
        paused: action.pausedAt === null,
      });
      await load();
    } catch {
      Alert.alert(
        'Non ha funzionato',
        'Non sono riuscito a cambiare lo stato di questa routine. Riprova.'
      );
    } finally {
      setPausing(null);
    }
  };

  const confirmClosePath = (pathId: number, coachName: string) => {
    Alert.alert(
      'Chiudere questo percorso?',
      `Non riceverai più nuove azioni da ${coachName} su questo percorso, finché non lo riapri tu (o non lo riapre chi lo chiude). Le sessioni già prenotate e tutto ciò che vi siete scritti restano visibili.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Chiudi il percorso',
          style: 'destructive',
          onPress: () => void closePathNow(pathId),
        },
      ]
    );
  };

  const closePathNow = async (pathId: number) => {
    setClosingPath(pathId);
    try {
      await closeAthletePath(pathId);
      await load();
    } catch {
      Alert.alert('Non ha funzionato', 'Non sono riuscito a chiudere il percorso. Riprova.');
    } finally {
      setClosingPath(null);
    }
  };

  const reopenPathNow = async (pathId: number) => {
    setReopeningPath(pathId);
    try {
      await reopenAthletePath(pathId);
      await load();
    } catch {
      Alert.alert('Non ha funzionato', 'Non sono riuscito a riaprire il percorso. Riprova.');
    } finally {
      setReopeningPath(null);
    }
  };

  if (loading && !today) {
    return (
      <View style={[styles.screen, styles.centre]}>
        <ActivityIndicator color={theme.mid} />
      </View>
    );
  }

  const canJoin = today?.canJoinNow && today.nextBooking;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 96 },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={theme.mid}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Oggi</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Impostazioni"
            hitSlop={12}
            onPress={onOpenSettings}
            style={styles.avatar}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </Pressable>
        </View>

        {error ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={styles.errorBar}
          >
            <Text style={styles.errorText}>{error}</Text>
          </Pressable>
        ) : null}

        {today ? (
          <>
            {/* La zona principale: una cosa sola, con il titolo e la sua
                spiegazione, entrambi decisi dal server. */}
            <View style={styles.hero}>
              {today.state === 'action' && today.action ? (
                <Text style={styles.heroLabel}>
                  LA TUA ROUTINE · con {today.action.coachName}
                </Text>
              ) : null}
              <Text style={styles.heroTitle}>{today.title}</Text>
              {today.body ? (
                <Text style={styles.heroBody}>{today.body}</Text>
              ) : null}

              {today.action ? (
                <>
                  {today.action.attempts.length > 0 ? (
                    <View style={styles.attempts}>
                      {today.action.attempts.map((attempt) => (
                        <Pressable
                          key={attempt.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Correggi la prova del ${attempt.occurredOn}`}
                          onPress={() => {
                            setEditing(attempt);
                            setSheetFor(today.action);
                          }}
                          style={styles.attemptRow}
                        >
                          <Text style={styles.attemptDay}>
                            {calendarDayLabel(attempt.occurredOn)}
                          </Text>
                          <Text style={styles.attemptOutcome} numberOfLines={1}>
                            {attempt.outcomeLabel}
                            {attempt.edited ? ' · Modificato' : ''}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setEditing(null);
                      setSheetFor(today.action);
                    }}
                    style={styles.primary}
                  >
                    <Text style={styles.primaryText}>Segna una prova</Text>
                  </Pressable>

                  {/*
                    Pausa e ripresa: due gesti espliciti, secondari per
                    trattamento. Mettere in pausa non conclude niente — non lo
                    stato dell'azione, non l'obiettivo del percorso.
                  */}
                  <Pressable
                    accessibilityRole="button"
                    disabled={pausing === today.action.commitmentId}
                    onPress={() => void togglePause(today.action as TodayAction)}
                    style={styles.secondary}
                  >
                    <Text style={styles.secondaryText}>
                      {pausing === today.action.commitmentId
                        ? '…'
                        : 'Metti in pausa'}
                    </Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Chiudi il percorso con questo coach"
                    disabled={closingPath === today.action.pathId}
                    onPress={() =>
                      confirmClosePath(
                        today.action!.pathId,
                        today.action!.coachName
                      )
                    }
                    style={styles.tertiary}
                  >
                    <Text style={styles.tertiaryText}>
                      {closingPath === today.action.pathId
                        ? '…'
                        : 'Chiudi il percorso'}
                    </Text>
                  </Pressable>
                </>
              ) : null}

              {today.state === 'no_active_path' &&
              today.closedPath?.closedByRole === 'athlete' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Riapri il percorso"
                  disabled={reopeningPath === today.closedPath.pathId}
                  onPress={() => void reopenPathNow(today.closedPath!.pathId)}
                  style={styles.primary}
                >
                  <Text style={styles.primaryText}>
                    {reopeningPath === today.closedPath.pathId
                      ? '…'
                      : 'Riapri il percorso'}
                  </Text>
                </Pressable>
              ) : null}

              {canJoin && today.nextBooking ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    onOpenCall({
                      bookingId: today.nextBooking!.bookingId,
                      scheduledFor: today.nextBooking!.scheduledFor,
                      durationMin: today.nextBooking!.durationMin ?? 40,
                      title: 'Sessione di mental coaching',
                      status: 'accepted',
                      canJoinNow: true,
                      viewerIsCoach: false,
                      otherName: today.nextBooking!.coachName,
                    })
                  }
                  style={styles.primary}
                >
                  <Text style={styles.primaryText}>Entra</Text>
                </Pressable>
              ) : null}
            </View>

            {/*
              Le altre azioni restano raggiungibili: con due coach, un elenco
              che ne mostra una sola nasconde l'altra invece di gerarchizzarla.
              Le azioni in pausa sono qui, con il pulsante per riprenderle.
            */}
            {today.otherActions.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>
                  Le tue azioni ({today.openActionCount})
                </Text>
                {today.otherActions.map((other) => (
                  <View key={other.commitmentId} style={styles.otherAction}>
                    <Text style={styles.otherTitle} numberOfLines={2}>
                      {other.title}
                    </Text>
                    <Text style={styles.otherMeta}>
                      con {other.coachName}
                      {other.pausedAt ? ' · In pausa' : ''}
                      {other.attemptCount > 0
                        ? ` · ${other.attemptCount} ${
                            other.attemptCount === 1 ? 'prova' : 'prove'
                          }`
                        : ''}
                    </Text>
                    <View style={styles.otherActions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setEditing(null);
                          setSheetFor(other);
                        }}
                        style={styles.smallButton}
                      >
                        <Text style={styles.smallButtonText}>
                          Segna una prova
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={pausing === other.commitmentId}
                        onPress={() => void togglePause(other)}
                        style={styles.smallButton}
                      >
                        <Text style={styles.smallButtonText}>
                          {other.pausedAt ? 'Riprendi' : 'Metti in pausa'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {today.nextBooking && !canJoin ? (
              <View style={styles.block}>
                <Text style={styles.blockTitle}>Prossima sessione</Text>
                <Text style={styles.nextText}>
                  {today.nextBooking.scheduledFor
                    ? `${dayTitle(today.nextBooking.scheduledFor)} · ${timeLabel(
                        today.nextBooking.scheduledFor
                      )}`
                    : 'Da fissare'}{' '}
                  · {today.nextBooking.coachName}
                </Text>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <AttemptSheet
        visible={sheetFor !== null}
        action={sheetFor}
        editing={editing}
        onClose={() => {
          setSheetFor(null);
          setEditing(null);
        }}
        onSaved={() => void load()}
      />
    </View>
  );
}

/**
 * «2026-09-13» → «13 set».
 *
 * Il giorno di una prova e' una data di calendario dichiarata dall'atleta, non
 * un istante: si fissa mezzogiorno prima di formattarla, dove nessun fuso puo'
 * spostarla di un giorno.
 */
function calendarDayLabel(value: string): string {
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.ink },
    centre: { alignItems: 'center', justifyContent: 'center' },
    content: { paddingHorizontal: 20, gap: 16 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    screenTitle: { color: theme.hi, fontSize: 28, fontWeight: '800' },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.line,
      backgroundColor: theme.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: theme.hi, fontSize: 15, fontWeight: '700' },
    errorBar: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 14,
    },
    errorText: { color: theme.red2, fontSize: 14 },
    hero: {
      backgroundColor: theme.ink2,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.line,
      padding: 20,
      gap: 10,
    },
    heroLabel: {
      color: theme.mid,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
    },
    heroTitle: {
      color: theme.hi,
      fontSize: 20,
      lineHeight: 27,
      fontWeight: '700',
    },
    heroBody: { color: theme.mid, fontSize: 15, lineHeight: 22 },
    attempts: { gap: 6, marginTop: 4 },
    attemptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 44,
    },
    attemptDay: { color: theme.mid, fontSize: 13, fontWeight: '700', width: 64 },
    attemptOutcome: { color: theme.hi, fontSize: 14, flexShrink: 1 },
    primary: {
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: theme.red,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    secondary: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { color: theme.mid, fontSize: 14, fontWeight: '600' },
    tertiary: {
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tertiaryText: { color: theme.red2, fontSize: 13, fontWeight: '600' },
    block: {
      backgroundColor: theme.ink2,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.line,
      padding: 16,
      gap: 10,
    },
    blockTitle: {
      color: theme.mid,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    otherAction: { gap: 4 },
    otherTitle: { color: theme.hi, fontSize: 15, lineHeight: 21 },
    otherMeta: { color: theme.mid, fontSize: 13 },
    otherActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
    smallButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.line,
    },
    smallButtonText: { color: theme.hi, fontSize: 13, fontWeight: '600' },
    nextText: { color: theme.hi, fontSize: 15 },
  });
}
