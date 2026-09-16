import { useEffect, useMemo, useState } from 'react';
import { AppState, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AudioSession } from '@livekit/react-native';
import { Icon, type IconName } from './Icon';
import { useTheme, type Palette } from '../theme';
import { ensureBluetoothAudioPermission } from '../lib/call-audio';

/**
 * Da dove esce l'audio: altoparlante, orecchio, cuffie, Bluetooth.
 *
 * Serve a metà sessione, non prima: si comincia in vivavoce e si passa alle
 * cuffie perché è entrato qualcuno nella stanza — ed è esattamente il momento
 * in cui non si può armeggiare nelle impostazioni del telefono. Senza questo
 * comando l'unica via era uscire dall'app.
 *
 * L'elenco lo dà il sistema e cambia mentre si parla: infilare le cuffie
 * aggiunge una voce, toglierle la fa sparire. Per questo si rilegge a ogni
 * apertura invece di tenerlo in memoria.
 */

/**
 * I nomi tecnici del sistema, detti come li direbbe una persona.
 *
 * `earpiece` è la capsula sopra lo schermo, quella che si usa tenendo il
 * telefono all'orecchio: chiamarla «auricolare» la confonderebbe con le
 * cuffie, che sono un'altra voce dello stesso elenco.
 */
const LABELS: Record<string, { label: string; icon: IconName }> = {
  speaker: { label: 'Altoparlante', icon: 'volumeUp' },
  earpiece: { label: 'Telefono all’orecchio', icon: 'phone' },
  headset: { label: 'Cuffie', icon: 'headset' },
  bluetooth: { label: 'Bluetooth', icon: 'bluetooth' },
  default: { label: 'Predefinito', icon: 'volumeUp' },
  force_speaker: { label: 'Altoparlante', icon: 'volumeUp' },
};

export function AudioOutputPicker({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [outputs, setOutputs] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [bluetoothDenied, setBluetoothDenied] = useState(false);

  async function refreshOutputs(requestPermission = false) {
    setFailed(false);
    try {
      if (requestPermission) {
        const granted = await ensureBluetoothAudioPermission();
        setBluetoothDenied(!granted);
      }
      setOutputs(await AudioSession.getAudioOutputs());
    } catch {
      setFailed(true);
    }
  }

  useEffect(() => {
    if (!visible) return;
    void refreshOutputs();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshOutputs();
    });
    const timer = setInterval(() => void refreshOutputs(), 3_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [visible]);

  async function choose(deviceId: string) {
    try {
      await AudioSession.selectAudioOutput(deviceId);
      onClose();
    } catch {
      // Un'uscita può sparire fra l'elenco e la scelta — cuffie sfilate un
      // istante prima. Si resta aperti e si dice che non è andata, invece di
      // chiudere lasciando credere che l'audio sia cambiato.
      setFailed(true);
    }
  }

  async function showSystemRoutes() {
    try {
      // Un override esplicito dell'altoparlante impedisce a iOS di migrare
      // verso AirPods/Bluetooth anche se la persona li sceglie nel pannello.
      await AudioSession.selectAudioOutput('default');
      onClose();
      setTimeout(() => void AudioSession.showAudioRoutePicker(), 300);
    } catch {
      setFailed(true);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Audio</Text>

          {failed ? (
            <Text style={styles.hint}>
              Non riesco a cambiare l’uscita audio da qui. Puoi farlo dai
              comandi del volume del telefono.
            </Text>
          ) : !outputs ? (
            <Text style={styles.hint}>Cerco i dispositivi…</Text>
          ) : (
            outputs.map((deviceId) => {
              const info = LABELS[deviceId] ?? {
                label: deviceId,
                icon: 'volumeUp' as IconName,
              };
              return (
                <Pressable
                  key={deviceId}
                  onPress={() => void choose(deviceId)}
                  accessibilityRole="button"
                  accessibilityLabel={info.label}
                  style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                >
                  <Icon name={info.icon} size={22} color={theme.hi} />
                  <Text style={styles.itemText}>{info.label}</Text>
                </Pressable>
              );
            })
          )}

          {Platform.OS === 'android' && outputs && !outputs.includes('bluetooth') && (
            <Pressable
              onPress={() => void refreshOutputs(true)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Icon name="bluetooth" size={22} color={theme.hi} />
              <Text style={styles.itemText}>
                {bluetoothDenied
                  ? 'Consenti dispositivi nelle vicinanze'
                  : 'Aggiorna dispositivi Bluetooth'}
              </Text>
            </Pressable>
          )}

          {/* Su iPhone AirPods e Bluetooth sono nel selettore audio di sistema. */}
          {Platform.OS === 'ios' && (
            <Pressable
              onPress={() => void showSystemRoutes()}
              accessibilityRole="button"
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <Icon name="headset" size={22} color={theme.hi} />
              <Text style={styles.itemText}>Altri dispositivi…</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: theme.ink2,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
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
      marginBottom: 12,
    },
    title: {
      color: theme.mid,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 6,
    },
    hint: { color: theme.mid, fontSize: 14, paddingVertical: 12, lineHeight: 20 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      minHeight: 52,
    },
    itemText: { color: theme.hi, fontSize: 16, flex: 1 },
    pressed: { opacity: 0.7 },
  });
