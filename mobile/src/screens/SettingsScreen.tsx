import { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE_URL } from '../lib/config';
import { currentSession, signOut } from '../lib/auth';
import {
  notificationState,
  registerForPushNotifications,
  type NotificationState,
} from '../lib/notifications';
import { useTheme, type Palette, type ThemeMode } from '../theme';

/**
 * Le impostazioni: chi sei, come ti avvisiamo, come si vede l'app.
 *
 * Tre cose sole. Un'app che serve a essere in chiamata non ha bisogno di un
 * pannello di configurazione — ha bisogno che le due o tre scelte che contano
 * siano dove uno le cerca, cioè dietro il proprio nome in alto a destra.
 */
export function SettingsScreen({
  onClose,
  onSignedOut,
}: {
  onClose: () => void;
  onSignedOut: () => void;
}) {
  const { theme, mode, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [email, setEmail] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationState | null>(
    null
  );
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    void currentSession().then((session) => {
      setEmail(session?.user.email ?? null);
    });
    void notificationState().then(setNotifications);
  }, []);

  async function enableNotifications() {
    setAsking(true);
    try {
      await registerForPushNotifications();
      setNotifications(await notificationState());
    } finally {
      setAsking(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Torna alle sessioni"
          hitSlop={12}
        >
          <Text style={styles.back}>← Indietro</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Impostazioni</Text>
      {email && <Text style={styles.email}>{email}</Text>}

      <Text style={styles.section}>Notifiche</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Avvisi di chiamata</Text>
            <Text style={styles.rowHint}>
              {notificationLabel(notifications)}
            </Text>
          </View>
          <Switch
            accessibilityLabel="Avvisi di chiamata"
            value={notifications?.enabled === true}
            onValueChange={enableNotifications}
            // Spegnerle dall'app sarebbe una bugia: il sistema resterebbe
            // convinto del contrario. Si toglie il permesso dalle impostazioni
            // del telefono, ed è li` che si viene mandati.
            disabled={asking || notifications?.enabled === true}
            trackColor={{ true: theme.red, false: theme.line }}
            thumbColor={theme.hi}
          />
        </View>
        {notifications?.enabled === true && (
          <Pressable onPress={() => void Linking.openSettings()} hitSlop={8}>
            <Text style={styles.link}>Disattivale dalle impostazioni →</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.section}>Aspetto</Text>
      <View style={styles.card}>
        {(
          [
            ['system', 'Come il telefono'],
            ['light', 'Chiaro'],
            ['dark', 'Scuro'],
          ] as [ThemeMode, string][]
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setMode(value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: mode === value }}
            accessibilityLabel={label}
            style={({ pressed }) => [styles.option, pressed && styles.pressed]}
          >
            <Text style={styles.optionText}>{label}</Text>
            {mode === value && <Text style={styles.check}>✓</Text>}
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Account</Text>
      <View style={styles.card}>
        <Pressable
          onPress={() => void Linking.openURL(`${API_BASE_URL}/dashboard`)}
          style={({ pressed }) => [styles.option, pressed && styles.pressed]}
        >
          <Text style={styles.optionText}>Apri KaiPai sul web</Text>
        </Pressable>
        <Pressable
          onPress={async () => {
            await signOut();
            onSignedOut();
          }}
          style={({ pressed }) => [styles.option, pressed && styles.pressed]}
        >
          <Text style={styles.signOut}>Esci</Text>
        </Pressable>
      </View>

      <Text style={styles.version}>
        Versione {Constants.expoConfig?.version ?? '—'}
      </Text>
    </ScrollView>
  );
}

/**
 * Perché le notifiche non arrivano, detto per esteso.
 *
 * «Non attive» da solo manda a cercare nel posto sbagliato: il permesso
 * negato si risolve in due tocchi, un dispositivo senza servizio push non si
 * risolve affatto dal telefono. Sono due situazioni diverse e meritano due
 * frasi diverse.
 */
function notificationLabel(state: NotificationState | null): string {
  if (!state) return 'Verifico…';
  if (state.enabled) return 'Il telefono squilla quando una sessione inizia.';
  if (!state.permissionGranted) {
    return 'Permesso non concesso: tocca per consentirle.';
  }
  return (
    state.reason ??
    'Non disponibili su questo dispositivo: il servizio di notifica non risponde.'
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.ink },
    content: { padding: 20, paddingBottom: 60, gap: 8 },
    header: { marginBottom: 8 },
    back: { color: theme.mid, fontSize: 15 },
    title: { color: theme.hi, fontSize: 28, fontWeight: '800' },
    email: { color: theme.mid, fontSize: 14, marginBottom: 12 },
    section: {
      color: theme.mid,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 20,
      marginBottom: 8,
    },
    card: {
      backgroundColor: theme.ink2,
      borderColor: theme.line,
      borderWidth: 1,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      gap: 12,
    },
    rowText: { flex: 1, gap: 2 },
    rowTitle: { color: theme.hi, fontSize: 16, fontWeight: '600' },
    rowHint: { color: theme.mid, fontSize: 13, lineHeight: 18 },
    link: { color: theme.red2, fontSize: 13, paddingBottom: 14 },
    option: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
    },
    optionText: { color: theme.hi, fontSize: 16 },
    check: { color: theme.red2, fontSize: 16, fontWeight: '800' },
    signOut: { color: theme.red2, fontSize: 16 },
    pressed: { opacity: 0.7 },
    version: { color: theme.low, fontSize: 12, textAlign: 'center', marginTop: 28 },
  });
