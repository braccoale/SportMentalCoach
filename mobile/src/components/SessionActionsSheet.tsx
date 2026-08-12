import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  athleteCallLink,
  cancelBooking,
  rescheduleBooking,
  type UpcomingSession,
} from '../lib/api';
import { dayKey, dayTitle, romeInstant, timeLabel } from '../lib/day-grouping';
import { useTheme, type Palette } from '../theme';

/**
 * Le azioni su una sessione, dietro i tre puntini.
 *
 * Stanno in un foglio e non sulla scheda perché sono tre gesti rari e uno di
 * essi è distruttivo: metterli in vista su ogni riga significherebbe avere
 * «Annulla» sotto il pollice in un elenco che si scorre.
 *
 * Chi può fare cosa non si decide qui. Annullare e spostare passano dalle
 * stesse funzioni del web, che verificano ruolo, stato della prenotazione e
 * conflitti di calendario: l'app mostra le voci e racconta l'esito.
 */
const RESCHEDULE_DAYS = 14;
const SLOT_HOURS = [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21];

export function SessionActionsSheet({
  session,
  past,
  visible,
  onClose,
  onChanged,
}: {
  session: UpcomingSession;
  /** Una seduta gia` trascorsa non si sposta e non si annulla. */
  past: boolean;
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'menu' | 'reschedule' | 'confirmCancel'>('menu');
  const [day, setDay] = useState<Date | null>(null);

  const isOpen =
    session.status === 'requested' || session.status === 'accepted';
  // Spostare e annullare: solo su una sessione aperta e non trascorsa.
  const canAct = isOpen && !past;
  // Il collegamento serve a chi deve ancora entrare, quindi solo a stanza
  // aperta e solo al coach: l`atleta non manda un link a nome proprio.
  const canShareLink =
    session.status === 'accepted' &&
    !past &&
    session.viewerIsCoach &&
    session.canJoinNow !== false;
  const closedReason =
    session.status === 'cancelled'
      ? 'Questa sessione è stata annullata: non c’è più niente da modificare.'
      : session.status === 'declined'
        ? 'Questa richiesta è stata rifiutata.'
        : 'La sessione è già trascorsa: si può solo consultarla su KaiPai.'

  function close() {
    setMode('menu');
    setError(null);
    setDay(null);
    onClose();
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      close();
    } catch (err) {
      setError(
        err instanceof Error && err.message !== 'request_failed'
          ? err.message
          : 'Non è stato possibile completare l’operazione.'
      );
    } finally {
      setBusy(false);
    }
  }

  const days = Array.from({ length: RESCHEDULE_DAYS }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />

          {mode === 'menu' && (
            <>
              <Text style={styles.title}>{session.otherName}</Text>
              <Text style={styles.subtitle}>
                {dayTitle(session.scheduledFor)} alle{' '}
                {timeLabel(session.scheduledFor)}
              </Text>

              {/*
                * Le azioni seguono lo stato, come sul web.
                *
                * Li` una sessione si annulla e si sposta solo finche` e`
                * aperta e non ancora trascorsa (`isOpen && !alreadyHappened`).
                * Qui le voci comparivano sempre: su una seduta annullata
                * offrivamo «Annulla», e su una gia` fatta «Modifica giorno e
                * ora» — gesti che il server avrebbe rifiutato, dopo aver
                * fatto credere che fossero possibili.
                */}
              {canAct && (
                <Item
                  icon="edit-calendar"
                  label="Modifica giorno e ora"
                  onPress={() => setMode('reschedule')}
                />
              )}
              {canShareLink && (
              <Item
                icon="link"
                label="Link per l’atleta"
                hint="Da rimandare se non riesce a entrare"
                onPress={() =>
                  void run(async () => {
                    const { url } = await athleteCallLink(session.bookingId);
                    await Share.share({
                      message: `Ecco il link per la nostra sessione KaiPai: ${url}`,
                    });
                  })
                }
              />
              )}
              {canAct && (
                <Item
                  icon="event-busy"
                  label="Annulla la sessione"
                  destructive
                  onPress={() => setMode('confirmCancel')}
                />
              )}
              {!canAct && !canShareLink && (
                <Text style={styles.subtitle}>
                  {closedReason}
                </Text>
              )}
            </>
          )}

          {mode === 'confirmCancel' && (
            /*
             * Annullare avvisa l'altra persona e libera lo slot: è
             * irreversibile, quindi si chiede una seconda volta. La conferma
             * non è un doppio clic sullo stesso pulsante — dice cosa succede.
             */
            <>
              <Text style={styles.title}>Annullare la sessione?</Text>
              <Text style={styles.subtitle}>
                {session.otherName} riceverà un avviso e l’orario tornerà
                libero. Non si può annullare l’annullamento.
              </Text>
              <Pressable
                onPress={() => void run(() => cancelBooking(session.bookingId))}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [styles.danger, pressed && styles.pressed]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.dangerText}>Sì, annulla</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setMode('menu')} hitSlop={10}>
                <Text style={styles.back}>Torna indietro</Text>
              </Pressable>
            </>
          )}

          {mode === 'reschedule' && (
            <>
              <Text style={styles.title}>Sposta la sessione</Text>
              <Text style={styles.subtitle}>
                Scegli il giorno, poi l’ora. Se l’orario non è libero te lo dico.
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chips}>
                  {days.map((d) => {
                    const selected = day?.toDateString() === d.toDateString();
                    return (
                      <Pressable
                        key={d.toISOString()}
                        onPress={() => setDay(d)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[styles.chip, selected && styles.chipOn]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextOn]}>
                          {dayTitle(d.toISOString())}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {day && (
                <View style={styles.slots}>
                  {SLOT_HOURS.map((hour) => (
                    <Pressable
                      key={hour}
                      disabled={busy}
                      onPress={() => {
                        // Ora italiana, come ovunque nell'app.
                        const when = romeInstant(dayKey(day.toISOString()), hour);
                        void run(() =>
                          rescheduleBooking(
                            session.bookingId,
                            when.toISOString(),
                            session.durationMin
                          )
                        );
                      }}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.slot,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.slotText}>{hour}:00</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <Pressable onPress={() => setMode('menu')} hitSlop={10}>
                <Text style={styles.back}>Torna indietro</Text>
              </Pressable>
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Item({
  icon,
  label,
  hint,
  destructive,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  hint?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
    >
      <MaterialIcons
        name={icon}
        size={22}
        color={destructive ? theme.red2 : theme.hi}
      />
      <View style={styles.itemText}>
        <Text style={[styles.itemLabel, destructive && styles.itemDanger]}>
          {label}
        </Text>
        {hint && <Text style={styles.itemHint}>{hint}</Text>}
      </View>
    </Pressable>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: {
      backgroundColor: theme.ink2,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 34,
      gap: 4,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.line,
      marginBottom: 14,
    },
    title: { color: theme.hi, fontSize: 19, fontWeight: '700' },
    subtitle: { color: theme.mid, fontSize: 13, lineHeight: 19, marginBottom: 10 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 56,
      paddingVertical: 6,
    },
    itemText: { flex: 1 },
    itemLabel: { color: theme.hi, fontSize: 16 },
    itemDanger: { color: theme.red2 },
    itemHint: { color: theme.low, fontSize: 12, marginTop: 2 },
    chips: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
    chip: {
      paddingHorizontal: 14,
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: theme.surface,
    },
    chipOn: { backgroundColor: theme.red },
    chipText: { color: theme.hi, fontSize: 13 },
    chipTextOn: { color: '#fff', fontWeight: '700' },
    slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
    slot: {
      minWidth: 72,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: theme.surface,
    },
    slotText: { color: theme.hi, fontSize: 15 },
    danger: {
      backgroundColor: theme.red,
      borderRadius: 999,
      minHeight: 50,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    dangerText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    back: { color: theme.mid, fontSize: 15, textAlign: 'center', paddingVertical: 16 },
    error: { color: theme.red2, fontSize: 13, marginTop: 8 },
    pressed: { opacity: 0.8 },
  });
