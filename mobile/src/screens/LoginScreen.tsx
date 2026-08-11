import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { API_BASE_URL } from '../lib/config';
import {
  biometricSupport,
  confirmIdentity,
  currentSession,
  signInWithPassword,
} from '../lib/auth';
import { theme } from '../theme';

/**
 * Accesso all'app.
 *
 * Due strade, e l'ordine non è casuale. Se una sessione è già salvata nel
 * portachiavi, si chiede la biometria e si entra: è il caso normale, quello
 * di tutti i giorni. Le credenziali si scrivono una volta sola, il primo
 * giorno — o quando la sessione scade davvero.
 *
 * La biometria qui **non sostituisce la password**: autorizza a riusare una
 * sessione già ottenuta con la password. È una distinzione che conta, perché
 * significa che nessun volto e nessuna impronta viaggia mai verso di noi:
 * resta sul dispositivo, e noi riceviamo solo un sì o un no.
 */
export function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biometricLabel, setBiometricLabel] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const passwordRef = useRef<TextInput>(null);

  // All'avvio: c'è già una sessione? Allora la porta si apre col volto.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await currentSession();
        const support = await biometricSupport();
        if (cancelled) return;

        if (!session) {
          setCheckingSession(false);
          return;
        }
        if (!support.available) {
          // Nessuna biometria configurata: la sessione salvata resta valida,
          // ma senza una verifica non si entra da soli.
          setCheckingSession(false);
          setBiometricLabel(null);
          return;
        }
        setBiometricLabel(support.label);
        const ok = await confirmIdentity(`Accedi a KaiPai con ${support.label}`);
        if (cancelled) return;
        if (ok) {
          onSignedIn();
          return;
        }
        setCheckingSession(false);
      } catch {
        if (!cancelled) setCheckingSession(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onSignedIn]);

  async function unlockWithBiometrics() {
    const support = await biometricSupport();
    if (!support.available) return;
    const ok = await confirmIdentity(`Accedi a KaiPai con ${support.label}`);
    if (ok) onSignedIn();
  }

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await signInWithPassword(email, password);
      onSignedIn();
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(
        /invalid/i.test(message)
          ? 'Email o password non corretti.'
          : 'Accesso non riuscito. Riprova.'
      );
    } finally {
      setPending(false);
    }
  }

  if (checkingSession) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={theme.red} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.body}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          // Il marchio non è informazione: chi usa lo screen reader sente già
          // «KaiPai» dal titolo qui sotto, e sentirlo due volte è rumore.
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
        <Text style={styles.brand}>KaiPai</Text>
        <Text style={styles.subtitle}>
          Entra per raggiungere le tue sessioni.
        </Text>

        {biometricLabel && (
          <Pressable
            onPress={unlockWithBiometrics}
            style={({ pressed }) => [
              styles.biometricButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.biometricText}>Sblocca con {biometricLabel}</Text>
          </Pressable>
        )}

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="nome@esempio.it"
          placeholderTextColor={theme.low}
          style={styles.input}
          /*
           * Il telefono non ha il tasto Tab: il passaggio da un campo all'altro
           * lo fa il tasto d'invio, che qui diventa «Avanti» e porta il fuoco
           * sulla password. Senza `blurOnSubmit={false}` la tastiera si
           * chiuderebbe un istante prima di riaprirsi, con un salto visibile.
           */
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => passwordRef.current?.focus()}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          ref={passwordRef}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          placeholder="La tua password"
          placeholderTextColor={theme.low}
          style={styles.input}
          // Ultimo campo: l'invio manda, non sposta.
          returnKeyType="go"
          onSubmitEditing={() => {
            if (email && password && !pending) void submit();
          }}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          onPress={submit}
          disabled={pending || !email || !password}
          style={({ pressed }) => [
            styles.primary,
            (pending || !email || !password) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {pending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Accedi</Text>
          )}
        </Pressable>

        {/*
         * I testi legali vivono sul sito e non dentro l'app, di proposito: sono
         * gli stessi documenti, con la stessa versione, e duplicarli qui
         * significherebbe averne due che prima o poi divergono. Si aprono nel
         * browser di sistema.
         */}
        <View style={styles.legal}>
          <LegalLink label="Privacy" path="/privacy" />
          <Text style={styles.legalDot}>·</Text>
          <LegalLink label="Termini" path="/terms" />
          <Text style={styles.legalDot}>·</Text>
          <LegalLink label="Cookie" path="/cookie" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function LegalLink({ label, path }: { label: string; path: string }) {
  return (
    <Pressable
      onPress={() => {
        void Linking.openURL(`${API_BASE_URL}${path}`);
      }}
      accessibilityRole="link"
      // Il bersaglio del dito è più grande del testo: una riga di 11 punti
      // sarebbe impossibile da centrare.
      hitSlop={12}
    >
      <Text style={styles.legalLink}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  centered: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
  logo: { width: 64, height: 64, borderRadius: 16, marginBottom: 12 },
  brand: {
    color: theme.hi,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
  },
  legal: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  legalLink: { color: theme.mid, fontSize: 12, textDecorationLine: 'underline' },
  legalDot: { color: theme.low, fontSize: 12 },
  subtitle: { color: theme.mid, fontSize: 15, marginBottom: 24 },
  label: { color: theme.mid, fontSize: 13, marginTop: 12 },
  input: {
    backgroundColor: theme.surface,
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: 14,
    color: theme.hi,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primary: {
    backgroundColor: theme.red,
    borderRadius: 999,
    marginTop: 28,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  biometricButton: {
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  biometricText: { color: theme.hi, fontSize: 15, fontWeight: '600' },
  error: { color: theme.red2, fontSize: 13, marginTop: 12 },
});
