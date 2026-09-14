import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  athleteCallLink,
  cancelBooking,
  rescheduleBooking,
  rescheduleOptions,
  type BookableDay,
  type UpcomingSession,
} from '../lib/api';
import { dayTitle, timeLabel } from '../lib/day-grouping';
import { Icon, type IconName } from '../components/Icon';
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
  /** Giorno scelto, come lo chiama il server: «AAAA-MM-GG» in ora italiana. */
  const [day, setDay] = useState<string | null>(null);
  /*
   * Gli orari li decide il coach, non questo file.
   *
   * Qui c'era un elenco fisso di ore piene (8, 9, 10…): lo stesso difetto già
   * corretto per la creazione di un nuovo appuntamento, tornato qui perché
   * nessuno l'aveva ancora toccato. `null` = non ancora richiesti.
   */
  const [rescheduleDays, setRescheduleDays] = useState<BookableDay[] | null>(
    null
  );
  const [loadingOptions, setLoadingOptions] = useState(false);

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
    setRescheduleDays(null);
    onClose();
  }

  /*
   * Richiesti al momento di aprire «Modifica giorno e ora», non prima: sono
   * gli stessi calcoli — disponibilità, occupati, la sessione stessa esclusa
   * — della dashboard e della creazione di un nuovo appuntamento.
   */
  useEffect(() => {
    if (mode !== 'reschedule') return;
    let cancelled = false;
    setLoadingOptions(true);
    setError(null);
    void rescheduleOptions(session.bookingId)
      .then(({ bookableDays }) => {
        if (!cancelled) setRescheduleDays(bookableDays);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Non riesco a caricare gli orari disponibili.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, session.bookingId]);

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

  const selectedRescheduleDay = rescheduleDays?.find((d) => d.value === day);

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
                  icon="editCalendar"
                  label="Modifica giorno e ora"
                  onPress={() => setMode('reschedule')}
                />
              )}
              {session.googleCalendarUrl && (
                /*
                 * Stesso link del web: nessun titolo o orario ricalcolato qui,
                 * solo l'apertura di un URL già pronto. Compare/scompare da
                 * solo con lo stato della sessione, perché è il server a
                 * restituirlo o no — non c'è una seconda condizione da tenere
                 * allineata con `canAct`.
                 */
                <Item
                  icon="add"
                  label="Aggiungi a Google Calendar"
                  onPress={() => void Linking.openURL(session.googleCalendarUrl!)}
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
                  icon="eventBusy"
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
             *
             * Sotto il preavviso minimo l'annullamento resta permesso, ma va
             * detto prima di confermare: il server (stessa regola del web) ha
             * già segnato `cancellationWouldBeLate`, non lo si ricalcola qui.
             */
            <>
              <Text style={styles.title}>Annullare la sessione?</Text>
              <Text style={styles.subtitle}>
                {session.otherName} riceverà un avviso e l’orario tornerà
                libero. Non si può annullare l’annullamento.
                {session.cancellationWouldBeLate
                  ? ' Sei sotto il preavviso minimo: la sessione verrà comunque conteggiata come effettuata.'
                  : ''}
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

              {loadingOptions ? (
                <ActivityIndicator color={theme.red} style={styles.loader} />
              ) : (
                <>
                  {rescheduleDays && rescheduleDays.length === 0 ? (
                    <Text style={styles.subtitle}>
                      Non ci sono orari disponibili in questo periodo.
                    </Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.chips}>
                        {rescheduleDays?.map((d) => (
                          <Pressable
                            key={d.value}
                            onPress={() => setDay(d.value)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: day === d.value }}
                            style={[
                              styles.chip,
                              day === d.value && styles.chipOn,
                            ]}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                day === d.value && styles.chipTextOn,
                              ]}
                            >
                              {d.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </ScrollView>
                  )}

                  {selectedRescheduleDay && (
                    <View style={styles.slots}>
                      {selectedRescheduleDay.slots.map((slot) => (
                        <Pressable
                          key={slot.time}
                          disabled={busy || !slot.selectable}
                          onPress={() =>
                            void run(() =>
                              rescheduleBooking(
                                session.bookingId,
                                `${day}T${slot.time}`,
                                slot.fitsDurationMin ?? session.durationMin
                              )
                            )
                          }
                          accessibilityRole="button"
                          accessibilityState={{ disabled: !slot.selectable }}
                          accessibilityLabel={`Sposta alle ${slot.time}${slot.suffix}`}
                          style={({ pressed }) => [
                            styles.slot,
                            slot.tone === 'occupied' && styles.slotOff,
                            slot.tone === 'tight' && styles.slotTight,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.slotText,
                              slot.tone === 'occupied' && styles.slotTextOff,
                            ]}
                          >
                            {slot.time}
                            {slot.suffix}
                          </Text>
                        </Pressable>
                      ))}
                      {selectedRescheduleDay.slots.length === 0 && (
                        <Text style={styles.subtitle}>
                          Per questo giorno non restano orari liberi.
                        </Text>
                      )}
                    </View>
                  )}
                </>
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
  icon: IconName;
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
      <Icon name={icon} size={22} color={destructive ? theme.red2 : theme.hi} />

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
      // «10:30 · Solo 30 min» non sta in una casella pensata per «11:00».
      paddingHorizontal: 12,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: theme.surface,
    },
    slotText: { color: theme.hi, fontSize: 15 },
    // Dentro un appuntamento: non c'e` niente da fare, e si vede.
    slotOff: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: theme.line,
    },
    slotTextOff: { color: theme.low },
    // Stretto: ci si sta, accorciando. E` una scelta, non un divieto.
    slotTight: { borderWidth: 1, borderColor: '#e08b2a55' },
    loader: { marginVertical: 12 },
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
