import { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
      accessibilityLabel={`Apri la sessione con ${session.otherName} del ${day} ${rest}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      {/*
        * Il volto al posto del simbolo.
        *
        * Qui c'era un riquadro con l'icona dello stato — che però lo stato lo
        * dice già la riga accanto, a parole e a colori: era la terza volta
        * che la stessa informazione veniva ripetuta, nel posto dove si guarda
        * per primo. Con la foto la cronologia si scorre riconoscendo le
        * persone invece di leggendo, e il pallino colorato tiene lo stato
        * senza rubare il posto.
        */}
      <View style={styles.face}>
        {session.otherAvatarUrl ? (
          <Image source={{ uri: session.otherAvatarUrl }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoEmpty]}>
            <Text style={styles.initial}>
              {session.otherName.trim().slice(0, 1).toUpperCase() || '·'}
            </Text>
          </View>
        )}
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Icon name={info.icon} size={9} color={theme.ink2} />
        </View>
      </View>

      <View style={styles.dateBlock}>
        <Text style={styles.day}>{day}</Text>
        <Text style={styles.rest}>{rest}</Text>
        <Text style={[styles.time, { color }]}>{time}</Text>
      </View>

      <View style={styles.body}>
        {/* Chi c'era, per primo.
            Guardando indietro la domanda e' «con chi», non «di che stato»: un
            elenco di sedute senza nome costringe ad aprirle una per una per
            ricordarselo. Il nome e' il titolo della riga, lo stato la spiega. */}
        <Text style={styles.who} numberOfLines={1}>
          {session.otherName}
        </Text>
        <View style={styles.statusLine}>
          <Text style={[styles.label, { color }]}>{info.label}</Text>
          {session.actualMinutes ? (
            <Text style={styles.note}>{session.actualMinutes} min</Text>
          ) : null}
        </View>
        {!session.actualMinutes && info.note ? (
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
    face: { width: 42, height: 42 },
    photo: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.surface },
    photoEmpty: { alignItems: 'center', justifyContent: 'center' },
    initial: { color: theme.mid, fontSize: 17, fontWeight: '700' },
    /*
     * Il pallino di stato sta sul bordo della foto, con un anello del colore
     * dello sfondo che lo stacca: senza, su una foto chiara sparisce.
     */
    badge: {
      position: 'absolute',
      right: -1,
      bottom: -1,
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: theme.ink2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateBlock: { width: 46 },
    day: { color: theme.hi, fontSize: 20, fontWeight: '800', lineHeight: 22 },
    rest: { color: theme.low, fontSize: 10, fontWeight: '600' },
    time: { fontSize: 12, fontWeight: '700', marginTop: 2 },
    body: { flex: 1, gap: 2 },
    who: { color: theme.hi, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
    statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
    note: { color: theme.mid, fontSize: 12, lineHeight: 17 },
    ai: { color: theme.green, fontSize: 11, fontWeight: '700' },
    menu: { padding: 2 },
    rowPressed: { opacity: 0.75 },
  });
