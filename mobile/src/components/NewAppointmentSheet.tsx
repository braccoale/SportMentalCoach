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
  type BookableSlot,
} from '../lib/api';
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
/*
 * Gli orari li decide il coach, non questo file.
 *
 * Qui c'era un elenco fisso di ore piene: 8, 9, 10, 11. Non guardava la
 * disponibilita' settimanale del coach, ne' gli appuntamenti gia' presi. Dal
 * telefono si poteva proporre un orario in cui il coach non lavora — e sul web
 * lo stesso coach vedeva le 10:10, cioe' il primo posto davvero libero, mentre
 * l'app diceva 11:00.
 *
 * Ora la lista arriva dal server, calcolata dalla stessa funzione della
 * dashboard e gia' espressa in ora italiana.
 */

export function NewAppointmentSheet({
  visible,
  isCoach,
  withAthleteUserId,
  onClose,
  onCreated,
}: {
  visible: boolean;
  isCoach: boolean;
  /**
   * Con chi, quando lo si sa gia'.
   *
   * «Prenota di nuovo» parte dalla scheda di una seduta con una persona
   * precisa: chiedere di ripescarla da un elenco e' far ripetere una scelta
   * gia' fatta un attimo prima.
   */
  withAthleteUserId?: number | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [options, setOptions] = useState<AppointmentOptions | null>(null);
  const [athlete, setAthlete] = useState<number | null>(null);
  const [service, setService] = useState<number | null>(null);
  /** Il giorno scelto, come lo chiama il server: «AAAA-MM-GG» in ora italiana. */
  const [day, setDay] = useState<string | null>(null);
  /**
   * La durata di **questa** sessione, non quella del servizio.
   *
   * Lo stesso percorso dura trenta minuti con un atleta e un'ora con un
   * altro, ed e` la lunghezza della seduta — non quella del listino — a
   * decidere quali orari ci stanno ancora. Parte dalla durata del servizio,
   * che e` la risposta giusta quasi sempre.
   */
  const [duration, setDuration] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosenService = options?.services.find((s) => s.id === service);

  /*
   * Le opzioni si richiedono anche quando cambia il servizio.
   *
   * Non e` uno spreco: quali orari siano proponibili **dipende dalla durata**.
   * Alle 10:30, con una sessione alle 11, mezz'ora ci sta e quaranta minuti
   * no — ed e` il server a saperlo, con la stessa regola del web.
   */
  useEffect(() => {
    if (!visible) return;
    setError(null);
    void newAppointmentOptions(duration ?? undefined)
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
        const known =
          withAthleteUserId != null &&
          data.athletes.some((a) => a.userId === withAthleteUserId)
            ? withAthleteUserId
            : data.athletes.length === 1
              ? data.athletes[0].userId
              : null;

        if (known !== null) {
          setAthlete(known);
          // Con l'atleta arriva il servizio dell'ultima volta: e` la risposta
          // giusta quasi sempre, e resta cambiabile.
          const last = data.lastServiceByAthlete?.[known];
          if (last !== undefined) {
            setService(last);
            setDuration(
              (d) => d ?? data.services.find((s) => s.id === last)?.durationMin ?? null
            );
          }
        }

        if (data.services.length === 1) {
          setService(data.services[0].id);
          setDuration((d) => d ?? data.services[0].durationMin);
        }
      })
      .catch(() => setError('Non riesco a caricare atleti e servizi.'));
  }, [visible, duration, withAthleteUserId]);

  /** Sceglie l'atleta e, con lui, il servizio dell'ultima volta. */
  function pickAthlete(userId: number) {
    setAthlete(userId);
    const last = options?.lastServiceByAthlete?.[userId];
    if (last === undefined) return;
    setService(last);
    setDuration(options?.services.find((s) => s.id === last)?.durationMin ?? null);
  }

  function pickService(id: number) {
    setService(id);
    setDuration(options?.services.find((s) => s.id === id)?.durationMin ?? null);
  }

  function close() {
    setAthlete(null);
    setService(null);
    setDuration(null);
    setDay(null);
    setError(null);
    onClose();
  }

  async function create(slot: BookableSlot) {
    if (!athlete || !service || !day) return;
    setBusy(true);
    setError(null);
    try {
      await createAppointment({
        clientUserId: athlete,
        serviceId: service,
        /*
         * Su un orario stretto vale la durata che ci sta, non quella del
         * servizio: e` la stessa scelta del web — proporre le 10:30 e poi
         * rifiutarla perche' i quaranta minuti non entrano sarebbe offrire e
         * negare nello stesso gesto.
         */
        durationMin: slot.fitsDurationMin ?? duration ?? chosenService?.durationMin,
        // Ora italiana, nella stessa forma che manda il web: e` il server a
        // trasformarla in un istante, con una regola sola per i due client.
        scheduledFor: `${day}T${slot.time}`,
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
        durationMin: duration ?? chosen?.durationMin,
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

  const days = options?.bookableDays ?? [];
  const selectedDay = days.find((d) => d.value === day);

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
                    onPress={() => pickAthlete(a.userId)}
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
                        onPress={() => pickService(s.id)}
                      />
                    ))}
                  </View>

                  {service !== null && (options.durationOptions?.length ?? 0) > 0 && (
                    <>
                      <Text style={styles.step}>Quanto dura</Text>
                      <View style={styles.chips}>
                        {options.durationOptions?.map((minutes) => (
                          <Chip
                            key={minutes}
                            label={`${minutes} min`}
                            selected={duration === minutes}
                            onPress={() => setDuration(minutes)}
                          />
                        ))}
                      </View>
                    </>
                  )}
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
                  {days.length === 0 ? (
                    /*
                     * Un elenco vuoto deve dire perche' e` vuoto.
                     *
                     * Qui succede per una ragione sola e risolvibile: il coach
                     * non ha ancora dichiarato in che ore lavora. Senza
                     * spiegazione sembrerebbe l'app rotta.
                     */
                    <Text style={styles.subtitle}>
                      Non hai ancora indicato in che orari lavori: impostali sul
                      web e qui compariranno i giorni prenotabili.
                    </Text>
                  ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.chips}>
                        {days.map((d) => (
                          <Chip
                            key={d.value}
                            label={d.label}
                            selected={day === d.value}
                            onPress={() => setDay(d.value)}
                          />
                        ))}
                      </View>
                    </ScrollView>
                  )}
                </>
              )}

              {selectedDay && (
                <View style={styles.slots}>
                  {selectedDay.slots.map((slot) => (
                    <Pressable
                      key={slot.time}
                      disabled={busy || !slot.selectable}
                      onPress={() => void create(slot)}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !slot.selectable }}
                      accessibilityLabel={`Crea alle ${slot.time}${slot.suffix}`}
                      style={({ pressed }) => [
                        styles.slot,
                        slot.tone === 'occupied' && styles.slotOff,
                        slot.tone === 'tight' && styles.slotTight,
                        pressed && styles.pressed,
                      ]}
                    >
                      {/*
                        * Il colore non basta da solo: accanto all'ora resta
                        * scritto perche', «Occupato» o «Solo 30 min». Rosso e
                        * arancione sono lo stesso grigio per molte persone.
                        */}
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
                  {selectedDay.slots.length === 0 && (
                    <Text style={styles.subtitle}>
                      Per questo giorno non restano orari liberi.
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
    slotOff: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.line },
    slotTextOff: { color: theme.low },
    // Stretto: ci si sta, accorciando. E` una scelta, non un divieto.
    slotTight: { borderWidth: 1, borderColor: '#e08b2a55' },
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
