import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ApiError,
  editAttempt,
  newRequestId,
  recordAttempt,
  type TodayAction,
  type TodayAttempt,
} from '../lib/api';
import { useTheme, type Palette } from '../theme';

/**
 * Segnare una prova, o correggerne una.
 *
 * **Che cosa non fa.** Non chiude l'azione. Il testo sotto il pulsante lo dice
 * a chi salva, perche' e' la cosa che con ogni probabilita' si aspetta di
 * sbagliato: «Provata» somiglia a «fatto», e per una routine mentale non lo e'.
 * La routine resta aperta, e sabato si ritrova dov'era.
 *
 * **Il testo non si perde.** Un errore di rete lascia tutto nei campi e dice
 * cosa fare: su un telefono, perdere due righe scritte a fatica dopo un
 * allenamento e' il modo piu' veloce per non farle riscrivere mai piu'.
 *
 * **Un doppio tocco non crea due prove.** L'identificativo della richiesta si
 * genera una volta sola all'apertura del foglio, non a ogni invio: un
 * ritentativo dopo un timeout ricade sulla riga gia' scritta.
 */
const OUTCOMES = [
  { key: 'provata', label: 'Provata' },
  { key: 'non_ancora', label: 'Non ancora' },
  { key: 'non_adatta', label: 'Non era adatta al momento' },
] as const;

type Outcome = (typeof OUTCOMES)[number]['key'];

/**
 * «Oggi» e «Ieri» come giorni di calendario italiani.
 *
 * Il server confronta testo con testo, «AAAA-MM-GG», proprio per non dover
 * indovinare un fuso: qui si produce la stessa forma, in ora italiana, cosi'
 * una prova segnata alle 23:30 resta del giorno in cui e' stata fatta.
 */
function calendarDay(offsetDays: number): string {
  const shifted = new Date(Date.now() - offsetDays * 86_400_000);
  return shifted.toLocaleDateString('en-CA', { timeZone: 'Europe/Rome' });
}

export function AttemptSheet({
  visible,
  action,
  editing,
  onClose,
  onSaved,
}: {
  visible: boolean;
  action: TodayAction | null;
  /** Valorizzato quando si corregge una prova invece di segnarne una nuova. */
  editing?: TodayAttempt | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [day, setDay] = useState(() => calendarDay(0));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * Generato all'apertura, non a ogni invio.
   *
   * E' quello che rende innocuo il ritentativo: se il primo invio e' arrivato
   * ma la risposta si e' persa nei quindici secondi di timeout, il secondo
   * porta lo stesso identificativo e il server restituisce la riga che c'era
   * invece di scriverne un'altra.
   */
  const requestId = useRef(newRequestId());

  useEffect(() => {
    if (!visible) return;
    requestId.current = newRequestId();
    setError(null);
    setSaving(false);
    if (editing) {
      setOutcome(editing.outcome);
      setDay(editing.occurredOn);
      setNote(editing.note ?? '');
    } else {
      setOutcome(null);
      setDay(calendarDay(0));
      setNote('');
    }
  }, [visible, editing]);

  const save = async () => {
    if (!action || !outcome || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await editAttempt({
          attemptId: editing.id,
          version: editing.version,
          outcome,
          occurredOn: day,
          note: note.trim() || undefined,
        });
      } else {
        await recordAttempt({
          commitmentId: action.commitmentId,
          outcome,
          occurredOn: day,
          note: note.trim() || undefined,
          clientRequestId: requestId.current,
        });
      }
      onSaved();
      onClose();
    } catch (cause) {
      /*
       * Un messaggio che dice cosa fare, non «errore».
       *
       * Il conflitto e' il caso interessante: due dispositivi hanno aperto la
       * stessa prova, e il primo ha gia' salvato. Dire «ricaricala» invece di
       * riprovare in silenzio e' quello che impedisce di cancellare senza
       * accorgersene una correzione piu' recente. In nessun caso si toccano
       * `note` e `day`: il testo resta.
       */
      setError(
        cause instanceof ApiError && cause.status === 409
          ? 'Questa prova e’ cambiata da un altro dispositivo. Chiudi, ricaricala e riprova: cosi’ non sovrascrivi la versione piu’ recente.'
          : cause instanceof ApiError && cause.code === 'timeout'
            ? 'La rete non ha risposto. Il testo e’ ancora qui: riprova.'
            : 'Non sono riuscito a salvare. Il testo e’ ancora qui: riprova.'
      );
      setSaving(false);
    }
  };

  if (!action) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.backdrop}
        accessibilityLabel="Chiudi"
        onPress={onClose}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.grabber} />
          <Text style={styles.title}>
            {editing ? 'Correggi la prova' : 'Segna una prova'}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {action.title}
          </Text>

          <ScrollView
            style={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Quando</Text>
            <View style={styles.row}>
              {[
                { label: 'Oggi', value: calendarDay(0) },
                { label: 'Ieri', value: calendarDay(1) },
              ].map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: day === option.value }}
                  onPress={() => setDay(option.value)}
                  style={[styles.chip, day === option.value && styles.chipOn]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      day === option.value && styles.chipTextOn,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Com{'’'}e{'’'} andata</Text>
            {OUTCOMES.map((option) => (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                accessibilityState={{ selected: outcome === option.key }}
                onPress={() => setOutcome(option.key)}
                style={[styles.option, outcome === option.key && styles.optionOn]}
              >
                <Text
                  style={[
                    styles.optionText,
                    outcome === option.key && styles.optionTextOn,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}

            {/*
              La nota e' facoltativa su tutti e tre gli esiti, non solo quando
              e' andata male: «ci ho provato in tre battute su sei» e' la cosa
              che cambia la seduta, e arriva piu' spesso da un esito positivo.
            */}
            <Text style={styles.label}>Vuoi aggiungere qualcosa?</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="Facoltativo"
              placeholderTextColor={theme.low}
              multiline
              maxLength={1000}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {/*
              Il destinatario e' visibile prima di salvare, e non promette una
              lettura entro un momento preciso: dice dove va a finire.
            */}
            <Text style={styles.recipient}>
              Condiviso con {action.coachName}, da riprendere nella prossima
              seduta.
            </Text>
            {editing ? (
              <Text style={styles.warning}>
                La correzione sostituisce il testo. {action.coachName} potrebbe
                aver gia{'’'} letto la versione precedente.
              </Text>
            ) : null}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !outcome || saving }}
            disabled={!outcome || saving}
            onPress={save}
            style={[styles.primary, (!outcome || saving) && styles.primaryOff]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Salva</Text>
            )}
          </Pressable>

          {/* La riga che disinnesca l'equivoco: «Provata» non e' «finita». */}
          <Text style={styles.reassurance}>
            La routine resta aperta: puoi riprovarla quando vuoi.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(theme: Palette) {
  return StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#0009' },
    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: theme.ink2,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 10,
      maxHeight: '90%',
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.line,
      marginBottom: 14,
    },
    title: { color: theme.hi, fontSize: 20, fontWeight: '700' },
    subtitle: { color: theme.mid, fontSize: 14, lineHeight: 20, marginTop: 4 },
    body: { marginTop: 12 },
    label: {
      color: theme.mid,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: 16,
      marginBottom: 8,
    },
    row: { flexDirection: 'row', gap: 8 },
    chip: {
      paddingHorizontal: 16,
      // 44 punti e' il minimo perche' un pollice lo colpisca senza mirare.
      minHeight: 44,
      justifyContent: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.line,
    },
    chipOn: { borderColor: theme.red, backgroundColor: theme.surface },
    chipText: { color: theme.mid, fontSize: 14, fontWeight: '600' },
    chipTextOn: { color: theme.hi },
    option: {
      minHeight: 56,
      justifyContent: 'center',
      paddingHorizontal: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.line,
      marginBottom: 8,
    },
    optionOn: { borderColor: theme.red, backgroundColor: theme.surface },
    optionText: { color: theme.mid, fontSize: 16 },
    optionTextOn: { color: theme.hi, fontWeight: '600' },
    input: {
      minHeight: 88,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.line,
      padding: 14,
      color: theme.hi,
      fontSize: 15,
      textAlignVertical: 'top',
    },
    error: { color: theme.red2, fontSize: 14, lineHeight: 20, marginTop: 12 },
    recipient: { color: theme.mid, fontSize: 13, lineHeight: 19, marginTop: 16 },
    warning: { color: theme.mid, fontSize: 13, lineHeight: 19, marginTop: 8 },
    primary: {
      marginTop: 16,
      minHeight: 52,
      borderRadius: 16,
      backgroundColor: theme.red,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryOff: { opacity: 0.4 },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    reassurance: {
      color: theme.low,
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      marginTop: 10,
    },
  });
}
