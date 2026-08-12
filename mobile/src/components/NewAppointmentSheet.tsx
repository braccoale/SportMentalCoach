import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  createAppointment,
  newAppointmentOptions,
  type AppointmentOptions,
} from '../lib/api';
import { dayKey, dayTitle, romeInstant } from '../lib/day-grouping';
import { useTheme, type Palette } from '../theme';

/**
 * Un nuovo appuntamento, senza uscire dall'app.
 *
 * Prima il «+» apriva il browser. Sul telefono passare a Chrome, rifare
 * l'accesso e tornare indietro per una cosa che dura dieci secondi è un modo
 * gentile di dire «questa app non basta».
 *
 * Le scelte sono tre e in quest'ordine: chi, cosa, quando. È l'ordine in cui
 * si pensa — «devo vedere Marco» viene prima di «giovedì» — e ognuna riduce le
 * successive: scelto il servizio, la durata è già decisa.
 *
 * L'elenco degli atleti sono quelli con cui il coach ha già lavorato. Un
 * telefono non è il posto per cercare fra tutti: si sceglie fra pochi nomi
 * noti, e chi è nuovo passa comunque dal percorso completo sul web.
 */
const DAYS = 14;
const HOURS = [8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21];

export function NewAppointmentSheet({
  visible,
  isCoach,
  onClose,
  onCreated,
}: {
  visible: boolean;
  isCoach: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [options, setOptions] = useState<AppointmentOptions | null>(null);
  const [athlete, setAthlete] = useState<number | null>(null);
  const [service, setService] = useState<number | null>(null);
  const [day, setDay] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    void newAppointmentOptions()
      .then((data) => {
        setOptions(data);
        /*
         * Quando la scelta è una sola, non è una scelta.
         *
         * Con un atleta e un servizio, «inizia adesso» era sepolto sotto due
         * tocchi che non decidevano nulla — e chi cerca una sessione immediata
         * la cerca perché ha fretta. Preselezionare non toglie niente: restano
         * entrambi visibili e cambiabili.
         */
        if (data.athletes.length === 1) setAthlete(data.athletes[0].userId);
        if (data.services.length === 1) setService(data.services[0].id);
      })
      .catch(() => setError('Non riesco a caricare atleti e servizi.'));
  }, [visible]);

  function close() {
    setAthlete(null);
    setService(null);
    setDay(null);
    setError(null);
    onClose();
  }

  async function create(hour: number) {
    if (!athlete || !service || !day) return;
    // L'ora scelta e' quella italiana, non quella del fuso del telefono.
    const when = romeInstant(dayKey(day.toISOString()), hour);
    const chosen = options?.services.find((s) => s.id === service);
    setBusy(true);
    setError(null);
    try {
      await createAppointment({
        clientUserId: athlete,
        serviceId: service,
        durationMin: chosen?.durationMin,
        scheduledFor: when.toISOString(),
      });
      onCreated();
      close();
    } catch (err) {
      setError(
        err instanceof Error && err.message !== 'request_failed'
          ? err.message
          : 'Non è stato possibile creare l’appuntamento.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function createNow() {
    if (!athlete || !service) return;
    const chosen = options?.services.find((s) => s.id === service);
    setBusy(true);
    setError(null);
    try {
      await createAppointment({
        clientUserId: athlete,
        serviceId: service,
        durationMin: chosen?.durationMin,
        startingNow: true,
      });
      onCreated();
      close();
    } catch (err) {
      setError(
        err instanceof Error && err.message !== 'request_failed'
          ? err.message
          : 'Non e stato possibile iniziare la sessione.'
      );
    } finally {
      setBusy(false);
    }
  }

  const days = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Nuovo appuntamento</Text>

          {!isCoach ? (
            /*
             * L'atleta non crea appuntamenti: li chiede, e la richiesta parte
             * dal profilo di un coach. Dirlo è meglio che mostrare un modulo
             * che al momento dell'invio verrebbe rifiutato.
             */
            <Text style={styles.subtitle}>
              Le sessioni si prenotano dal profilo del tuo coach, su KaiPai.
            </Text>
          ) : !options ? (
            <ActivityIndicator color={theme.red} style={styles.loader} />
          ) : (
            <ScrollView style={styles.body}>
              <Text style={styles.step}>Con chi</Text>
              <View style={styles.chips}>
                {options.athletes.map((a) => (
                  <Chip
                    key={a.userId}
                    label={a.name}
                    selected={athlete === a.userId}
                    onPress={() => setAthlete(a.userId)}
                  />
                ))}
                {options.athletes.length === 0 && (
                  <Text style={styles.subtitle}>
                    Non hai ancora atleti con cui hai lavorato.
                  </Text>
                )}
              </View>

              {athlete !== null && (
                <>
                  <Text style={styles.step}>Che sessione</Text>
                  <View style={styles.chips}>
                    {options.services.map((s) => (
                      <Chip
                        key={s.id}
                        label={`${s.title} · ${s.durationMin} min`}
                        selected={service === s.id}
                        onPress={() => setService(s.id)}
                      />
                    ))}
                  </View>
                </>
              )}

              {service !== null && (
                <>
                  {/*
                    * «Adesso» prima di «quando».
                    *
                    * È il caso più frequente e il più urgente: l'atleta è già
                    * al telefono, o è appena successo qualcosa e serve
                    * parlarne. Nasce già accettata, perché chiedere conferma a
                    * chi ti sta aspettando in stanza non ha senso.
                    */}
                  <Text style={styles.step}>Subito</Text>
                  <Pressable
                    onPress={() => void createNow()}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel="Inizia una sessione adesso"
                    style={({ pressed }) => [styles.now, pressed && styles.pressed]}
                  >
                    <Text style={styles.nowText}>Inizia adesso</Text>
                  </Pressable>

                  <Text style={styles.step}>Oppure quando</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chips}>
                      {days.map((d) => (
                        <Chip
                          key={d.toISOString()}
                          label={dayTitle(d.toISOString())}
                          selected={day?.toDateString() === d.toDateString()}
                          onPress={() => setDay(d)}
                        />
                      ))}
                    </View>
                  </ScrollView>
                </>
              )}

              {day && (
                <View style={styles.slots}>
                  {/*
                    * Gli orari gia` passati non si propongono.
                    *
                    * Oggi alle 13 non ha senso offrire le 8: il server
                    * rifiuterebbe comunque, ma offrire e poi negare fa
                    * sembrare rotta l'app invece che sbagliata la scelta.
                    */}
                  {HOURS.filter((hour) => {
                    const when = romeInstant(dayKey(day.toISOString()), hour);
                    return when.getTime() > Date.now();
                  }).map((hour) => (
                    <Pressable
                      key={hour}
                      disabled={busy}
                      onPress={() => void create(hour)}
                      accessibilityRole="button"
                      accessibilityLabel={`Crea alle ${hour}:00`}
                      style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
                    >
                      <Text style={styles.slotText}>{hour}:00</Text>
                    </Pressable>
                  ))}
                  {HOURS.every((hour) => {
                    const when = romeInstant(dayKey(day.toISOString()), hour);
                    return when.getTime() <= Date.now();
                  }) && (
                    <Text style={styles.subtitle}>
                      Per oggi non ci sono più orari disponibili.
                    </Text>
                  )}
                </View>
              )}

              {busy && <ActivityIndicator color={theme.red} style={styles.loader} />}
            </ScrollView>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipOn,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: {
      maxHeight: '85%',
      backgroundColor: theme.ink2,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 30,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.line,
      marginBottom: 14,
    },
    title: { color: theme.hi, fontSize: 20, fontWeight: '700', marginBottom: 6 },
    subtitle: { color: theme.mid, fontSize: 14, lineHeight: 20, paddingVertical: 8 },
    body: { marginTop: 6 },
    step: {
      color: theme.mid,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 16,
      marginBottom: 8,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14,
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: 999,
      backgroundColor: theme.surface,
    },
    chipOn: { backgroundColor: theme.red },
    chipText: { color: theme.hi, fontSize: 14 },
    chipTextOn: { color: '#fff', fontWeight: '700' },
    slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
    slot: {
      minWidth: 72,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: theme.surface,
    },
    slotText: { color: theme.hi, fontSize: 15 },
    now: {
      minHeight: 48,
      borderRadius: 999,
      backgroundColor: theme.green,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nowText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    loader: { marginVertical: 20 },
    error: { color: theme.red2, fontSize: 13, marginTop: 10 },
    pressed: { opacity: 0.8 },
  });
