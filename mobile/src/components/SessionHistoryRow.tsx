import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { UpcomingSession } from '../lib/api';
import { Icon, type IconName } from './Icon';
import { useTheme, type Palette } from '../theme';

/**
 * Una seduta passata, nella cronologia.
 *
 * Ogni riga dice tre cose in ordine di importanza: **com'è andata** (lo stato,
 * a colori), **quando**, e cosa resta da fare o sapere. Prima lo stato era una
 * parolina grigia in fondo a una riga di metadati, e un elenco di sedute
 * identiche non raccontava niente.
 *
 * Il colore non è mai da solo: ogni stato ha anche un'icona e una parola,
 * perché rosso e arancione sono lo stesso grigio per molte persone.
 */
type Tone = 'neutral' | 'warn' | 'danger' | 'ok';

const STATUS: Record<
  string,
  { label: string; tone: Tone; icon: IconName; note?: string }
> = {
  cancelled: {
    label: 'SESSIONE ANNULLATA',
    tone: 'danger',
    icon: 'eventBusy',
    note: 'Sessione annullata.',
  },
  declined: {
    label: 'RICHIESTA RIFIUTATA',
    tone: 'danger',
    icon: 'eventBusy',
    note: 'Il coach non ha accettato.',
  },
  expired: {
    label: 'SESSIONE TRASCORSA',
    tone: 'warn',
    icon: 'more',
    note: 'La richiesta è scaduta senza risposta.',
  },
  completed: { label: 'COMPLETATA', tone: 'ok', icon: 'videocam' },
  accepted: { label: 'SESSIONE TRASCORSA', tone: 'warn', icon: 'more' },
  requested: { label: 'RICHIESTA', tone: 'neutral', icon: 'editCalendar' },
};

export function SessionHistoryRow({
  session,
  onMenu,
  onOpen,
}: {
  session: UpcomingSession;
  onMenu: () => void;
  /** Toccare la riga apre la scheda della seduta: com'è andata, cosa resta da fare. */
  onOpen: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const info = STATUS[session.status] ?? STATUS.accepted;
  const color =
    info.tone === 'danger'
      ? theme.red2
      : info.tone === 'warn'
        ? '#e08b2a'
        : info.tone === 'ok'
          ? theme.green
          : theme.mid;

  const when = session.scheduledFor ? new Date(session.scheduledFor) : null;
  const day = when
    ? new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        timeZone: 'Europe/Rome',
      }).format(when)
    : '—';
  const rest = when
    ? new Intl.DateTimeFormat('it-IT', {
        month: 'short',
        year: 'numeric',
        timeZone: 'Europe/Rome',
      }).format(when)
    : '';
  const time = when
    ? new Intl.DateTimeFormat('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Rome',
      }).format(when)
    : '';

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Apri la sessione del ${day} ${rest}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.mark, { backgroundColor: `${color}22` }]}>
        <Icon name={info.icon} size={18} color={color} />
      </View>

      <View style={styles.dateBlock}>
        <Text style={styles.day}>{day}</Text>
        <Text style={styles.rest}>{rest}</Text>
        <Text style={[styles.time, { color }]}>{time}</Text>
      </View>

      <View style={styles.body}>
        <Text style={[styles.label, { color }]}>{info.label}</Text>
        {session.actualMinutes ? (
          <Text style={styles.note}>Durata {session.actualMinutes} min</Text>
        ) : info.note ? (
          <Text style={styles.note}>{info.note}</Text>
        ) : null}
        {session.aiNotes && (
          <Text style={styles.ai}>✦ riepilogo disponibile</Text>
        )}
      </View>

      <Pressable
        onPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel={`Azioni per la sessione del ${day} ${rest}`}
        hitSlop={12}
        style={styles.menu}
      >
        <Icon name="more" size={18} color={theme.mid} />
      </Pressable>
    </Pressable>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: theme.ink2,
      borderRadius: 16,
      padding: 12,
    },
    mark: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateBlock: { width: 46 },
    day: { color: theme.hi, fontSize: 20, fontWeight: '800', lineHeight: 22 },
    rest: { color: theme.low, fontSize: 10, fontWeight: '600' },
    time: { fontSize: 12, fontWeight: '700', marginTop: 2 },
    body: { flex: 1, gap: 2 },
    label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
    note: { color: theme.mid, fontSize: 12, lineHeight: 17 },
    ai: { color: theme.green, fontSize: 11, fontWeight: '700' },
    menu: { padding: 2 },
    rowPressed: { opacity: 0.75 },
  });
