import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  closeAiNotes,
  fetchAiNotes,
  saveClosingNote,
  type AiNotesSession,
} from '../lib/api';
import { useTheme, type Palette } from '../theme';

/**
 * Il momento subito dopo la chiamata, per il coach.
 *
 * È il momento giusto per due ragioni, le stesse del web. Il coach ha ancora
 * tutto in mente e sta per dimenticarlo — un'osservazione a caldo vale più di
 * mezz'ora di ricostruzione la sera. E il microfono è finalmente libero:
 * durante la sessione appartiene a LiveKit, e contenderglielo romperebbe
 * entrambe le cose.
 *
 * Chiudere la sessione è distinto dall'interrompere la registrazione: quello è
 * una pausa e si può riprendere, questo è definitivo e fa partire il riepilogo.
 * Per questo la chiusura è una scelta esplicita e non una conseguenza
 * dell'uscire dalla stanza — si esce da una videochiamata per mille motivi,
 * anche perché è caduta la linea.
 *
 * Per chi non è coach, o quando non esiste una sessione di appunti, questa
 * schermata non compare affatto: non c'è niente da chiedere.
 */
export function SessionExitStep({
  bookingId,
  viewerIsCoach,
  onDone,
}: {
  bookingId: number;
  viewerIsCoach: boolean;
  onDone: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [session, setSession] = useState<AiNotesSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!viewerIsCoach) {
      onDone();
      return;
    }
    void fetchAiNotes(bookingId)
      .then((data) => {
        if (cancelled) return;
        // Nessuna sessione di appunti: non c'è niente da chiudere né da
        // annotare, e trattenere qualcuno su una schermata vuota è peggio che
        // non mostrarla.
        if (!data.session) {
          onDone();
          return;
        }
        setSession(data.session);
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) onDone();
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, viewerIsCoach, onDone]);

  if (!checked || !session) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={theme.red} />
      </View>
    );
  }

  async function finish(alsoClose: boolean) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = note.trim();
      if (trimmed) await saveClosingNote(session.id, trimmed);
      if (alsoClose) await closeAiNotes(session.id);
      onDone();
    } catch {
      setError('Non sono riuscito a salvare. Riprova.');
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.body}>
        <Text style={styles.title}>Com’è andata?</Text>
        <Text style={styles.hint}>
          Un’osservazione a caldo, finché ce l’hai in mente. Finisce nel
          riepilogo della sessione.
        </Text>

        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          placeholder="Cosa ti resta di questa sessione…"
          placeholderTextColor={theme.low}
          style={styles.input}
          accessibilityLabel="Nota sulla sessione"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        {/*
          * Chiudere fa partire il riepilogo ed è definitivo, quindi è una
          * scelta esplicita — non la conseguenza dell'essere usciti dalla
          * stanza, che capita anche quando cade la linea.
          */}
        <Pressable
          onPress={() => finish(true)}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Chiudi la sessione</Text>
          )}
        </Pressable>

        <Pressable onPress={() => finish(false)} disabled={busy} hitSlop={10}>
          <Text style={styles.secondary}>
            {note.trim() ? 'Salva e continua dopo' : 'Continua dopo'}
          </Text>
        </Pressable>

        <Text style={styles.footnote}>
          Chiudendo, la sessione non registra più e il riepilogo viene
          preparato. «Continua dopo» la lascia aperta.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.ink },
    centered: { alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 10 },
    title: { color: theme.hi, fontSize: 28, fontWeight: '800' },
    hint: { color: theme.mid, fontSize: 14, lineHeight: 20, marginBottom: 8 },
    input: {
      minHeight: 120,
      backgroundColor: theme.surface,
      borderColor: theme.line,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
      color: theme.hi,
      fontSize: 16,
      lineHeight: 22,
    },
    primary: {
      backgroundColor: theme.red,
      borderRadius: 999,
      minHeight: 52,
      marginTop: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    secondary: {
      color: theme.mid,
      fontSize: 15,
      textAlign: 'center',
      paddingVertical: 14,
    },
    footnote: { color: theme.low, fontSize: 12, lineHeight: 17, textAlign: 'center' },
    error: { color: theme.red2, fontSize: 13 },
    pressed: { opacity: 0.85 },
  });
