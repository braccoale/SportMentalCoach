import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  fetchSessionDetail,
  type SessionDetail,
  type UpcomingSession,
} from '../lib/api';
import { Icon } from './Icon';
import { SessionShare } from './SessionShare';
import { SessionTrend } from './SessionTrend';
import { useTheme, type Palette } from '../theme';

/**
 * Una seduta passata, a schermo intero.
 *
 * Era un foglio che copriva mezzo schermo, e mezzo schermo per un testo che si
 * legge è la peggiore delle due cose: né una lista da scorrere né un documento
 * da leggere. Qui la seduta occupa tutto, con una sola via d'uscita in alto a
 * sinistra — la ✕ — perché a schermo intero il gesto di chiusura deve essere
 * visibile, non indovinato.
 *
 * L'ordine risponde a come si guarda indietro a una seduta: **com'è andata**
 * (la sintesi), **che forma ha avuto** (l'andamento e chi ha parlato), **cosa
 * è successo** (i momenti), **cosa resta da fare** (gli impegni). Chi si ferma
 * al primo blocco ha già la risposta che cercava.
 *
 * Trascrizione, mappa della conversazione, confronto fra sedute e validazione
 * restano sul web: si leggono da fermi. Approvare un resoconto scorrendo un
 * telefono significherebbe approvarlo senza averlo letto.
 */
export function PastSessionSheet({
  session,
  visible,
  onClose,
  onBookAgain,
}: {
  session: UpcomingSession;
  visible: boolean;
  onClose: () => void;
  /** Guardare una seduta passata è spesso il momento in cui si decide la prossima. */
  onBookAgain: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDetail(null);
    setError(null);
    void fetchSessionDetail(session.bookingId)
      .then(setDetail)
      .catch(() => setError('Non riesco a caricare questa sessione.'));
  }, [visible, session.bookingId]);

  const when = session.scheduledFor ? new Date(session.scheduledFor) : null;
  const day = when
    ? new Intl.DateTimeFormat('it-IT', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'Europe/Rome',
      }).format(when)
    : '—';
  const time = when
    ? new Intl.DateTimeFormat('it-IT', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Rome',
      }).format(when)
    : '';

  const report = detail?.report ?? null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + 6 }]}>
        {/* La via d'uscita, sempre visibile: a schermo intero non c'è un bordo
            da toccare per uscire, e il gesto non si deve indovinare. */}
        <View style={styles.bar}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Chiudi la scheda della sessione"
            hitSlop={14}
            style={({ pressed }) => [styles.close, pressed && styles.pressed]}
          >
            <Icon name="close" size={22} color={theme.hi} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.body,
            { paddingBottom: insets.bottom + 100 },
          ]}
        >
          <View style={styles.head}>
            {session.otherAvatarUrl ? (
              <Image source={{ uri: session.otherAvatarUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoEmpty]}>
                <Text style={styles.photoInitial}>
                  {session.otherName.trim().slice(0, 1).toUpperCase() || '·'}
                </Text>
              </View>
            )}
            <View style={styles.headText}>
              <Text style={styles.name}>{session.otherName}</Text>
              <Text style={styles.meta}>
                {day}
                {time ? ` · ${time}` : ''}
              </Text>
            </View>
          </View>

          {/* La durata reale in grande: dice se è stata una seduta piena o
              interrotta, e non è scritta da nessun'altra parte. */}
          {detail?.actualMinutes ? (
            <View style={styles.duration}>
              <Text style={styles.durationValue}>{detail.actualMinutes}</Text>
              <Text style={styles.durationUnit}>minuti di sessione</Text>
            </View>
          ) : null}

          {error ? (
            <Text style={styles.empty}>{error}</Text>
          ) : !detail ? (
            <ActivityIndicator color={theme.green} style={styles.loader} />
          ) : report ? (
            <>
              {!report.approved && (
                <View style={styles.draft}>
                  <Text style={styles.draftText}>
                    Bozza — non ancora validata da te
                  </Text>
                </View>
              )}

              <Text style={styles.section}>In sintesi</Text>
              <Text style={styles.prose}>{report.summary}</Text>

              {report.emotionalTrend.length >= 2 && (
                <>
                  <Text style={styles.section}>Come è andata</Text>
                  <SessionTrend points={report.emotionalTrend} />
                </>
              )}

              {report.participation && (
                <>
                  <Text style={styles.section}>Chi ha parlato</Text>
                  <SessionShare
                    athleteSharePercent={report.participation.athleteSharePercent}
                    athleteTurns={report.participation.athleteTurns}
                    coachTurns={report.participation.coachTurns}
                    athleteName={session.otherName.split(' ')[0]}
                  />
                </>
              )}

              {report.themes.length > 0 && (
                <>
                  <Text style={styles.section}>Cosa è emerso</Text>
                  {report.themes.map((text, index) => (
                    <View key={index} style={styles.bulletRow}>
                      <Text style={styles.bullet}>·</Text>
                      <Text style={styles.prose}>{text}</Text>
                    </View>
                  ))}
                </>
              )}

              {report.keyMoments.length > 0 && (
                <>
                  <Text style={styles.section}>Momenti</Text>
                  {report.keyMoments.map((moment, index) => (
                    <View key={index} style={styles.moment}>
                      <Text style={styles.momentTitle}>{moment.title}</Text>
                      <Text style={styles.momentBody}>{moment.explanation}</Text>
                    </View>
                  ))}
                </>
              )}

              {report.commitments.length > 0 && (
                <>
                  {/* L'unica parte operativa: in una seduta di coaching è
                      quello che si controlla per primo. */}
                  <Text style={styles.section}>Cosa resta da fare</Text>
                  {report.commitments.map((commitment, index) => (
                    <View key={index} style={styles.bulletRow}>
                      <Text style={styles.bullet}>·</Text>
                      <View style={styles.commitment}>
                        <Text style={styles.prose}>{commitment.text}</Text>
                        <Text style={styles.owner}>
                          {commitment.owner === 'coach' ? 'Coach' : 'Atleta'}
                          {commitment.dueDate ? ` · entro ${commitment.dueDate}` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              <Text style={styles.webHint}>
                Trascrizione, momenti chiave e validazione sono su KaiPai web.
              </Text>
            </>
          ) : (
            /*
             * Un vuoto deve dire perché è vuoto: le ragioni sono diverse e
             * chiedono cose diverse — attivare gli appunti, aspettare, o niente.
             */
            <Text style={styles.empty}>{emptyReason(detail)}</Text>
          )}
        </ScrollView>

        <Pressable
          onPress={onBookAgain}
          accessibilityRole="button"
          accessibilityLabel={`Prenota un'altra sessione con ${session.otherName}`}
          style={({ pressed }) => [
            styles.primary,
            { bottom: insets.bottom + 16 },
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.primaryText}>Prenota di nuovo</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/** Perché non c'è un riepilogo, detto per esteso. */
function emptyReason(detail: SessionDetail): string {
  if (!detail.viewerIsCoach) {
    return 'Il riepilogo della seduta è riservato al coach.';
  }
  if (detail.status === 'cancelled' || detail.status === 'declined') {
    return 'La sessione non si è svolta, quindi non c’è un riepilogo.';
  }
  if (!detail.notes) {
    return 'Gli appunti AI non erano attivi in questa sessione: non c’è una registrazione da riassumere.';
  }
  if (detail.notes === 'processing' || detail.notes === 'active') {
    return 'Il riepilogo è in lavorazione. Di solito è pronto in pochi minuti.';
  }
  if (detail.notes === 'consent_rejected') {
    return 'La registrazione non è stata autorizzata, quindi non c’è un riepilogo.';
  }
  if (
    detail.notes === 'transcription_failed' ||
    detail.notes === 'report_failed'
  ) {
    return 'Il riepilogo non è riuscito. Puoi rigenerarlo da KaiPai web.';
  }
  return 'Per questa sessione non c’è un riepilogo.';
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.ink },
    bar: { paddingHorizontal: 12, paddingBottom: 4 },
    close: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { paddingHorizontal: 20, gap: 8 },
    head: { flexDirection: 'row', gap: 14, alignItems: 'center' },
    photo: { width: 60, height: 60, borderRadius: 30, backgroundColor: theme.surface },
    photoEmpty: { alignItems: 'center', justifyContent: 'center' },
    photoInitial: { color: theme.mid, fontSize: 24, fontWeight: '700' },
    headText: { flex: 1, gap: 3 },
    name: { color: theme.hi, fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
    meta: { color: theme.mid, fontSize: 14 },
    duration: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 18 },
    durationValue: {
      color: theme.green,
      fontSize: 44,
      fontWeight: '800',
      lineHeight: 48,
    },
    durationUnit: { color: theme.mid, fontSize: 14 },
    loader: { marginTop: 40 },
    draft: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: '#e08b2a22',
      marginTop: 16,
    },
    draftText: { color: '#e08b2a', fontSize: 12, fontWeight: '700' },
    section: {
      color: theme.mid,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 26,
      marginBottom: 6,
    },
    prose: { color: theme.hi, fontSize: 15, lineHeight: 23, flex: 1 },
    bulletRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    bullet: { color: theme.green, fontSize: 15, lineHeight: 23 },
    moment: {
      backgroundColor: theme.ink2,
      borderRadius: 14,
      padding: 14,
      marginTop: 8,
      gap: 4,
    },
    momentTitle: { color: theme.hi, fontSize: 15, fontWeight: '700' },
    momentBody: { color: theme.mid, fontSize: 14, lineHeight: 20 },
    commitment: { flex: 1, gap: 2 },
    owner: { color: theme.low, fontSize: 12 },
    webHint: {
      color: theme.low,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 30,
      fontStyle: 'italic',
    },
    empty: { color: theme.mid, fontSize: 15, lineHeight: 23, marginTop: 24 },
    primary: {
      position: 'absolute',
      left: 20,
      right: 20,
      minHeight: 52,
      borderRadius: 999,
      backgroundColor: theme.green,
      alignItems: 'center',
      justifyContent: 'center',
      elevation: 8,
      zIndex: 10,
    },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    pressed: { opacity: 0.85 },
  });
