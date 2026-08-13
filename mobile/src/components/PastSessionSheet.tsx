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
import {
  fetchSessionDetail,
  type SessionDetail,
  type UpcomingSession,
} from '../lib/api';
import { useTheme, type Palette } from '../theme';

/**
 * Una seduta passata, aperta dal telefono.
 *
 * Non è il Session Compass in miniatura. Questa schermata si apre in un momento
 * solo e molto preciso — i due minuti prima della sessione successiva, spesso
 * in piedi, spesso già in ritardo — e risponde a una domanda sola: **a che
 * punto siamo con questa persona?**
 *
 * Quindi tre cose, in quest'ordine: cosa è successo, cosa è emerso, cosa resta
 * da fare. Trascrizione, mappa della conversazione, grafici, confronto fra
 * sedute e validazione restano sul web: si leggono da fermi, con una tastiera.
 * Approvare un report scorrendo un telefono significherebbe approvarlo senza
 * averlo letto.
 *
 * L'atleta il riepilogo non lo vede — è il server a deciderlo, non questa
 * schermata: un resoconto interpretativo di una seduta non è materiale da
 * leggere per conto proprio.
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />

          {/* Chi, quando, e quanto è durata davvero: la durata dice se è stata
              una seduta piena o interrotta, e non è scritta altrove. */}
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
              {detail?.actualMinutes ? (
                <Text style={styles.meta}>Durata {detail.actualMinutes} min</Text>
              ) : null}
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            {error ? (
              <Text style={styles.empty}>{error}</Text>
            ) : !detail ? (
              <ActivityIndicator color={theme.green} style={styles.loader} />
            ) : detail.report ? (
              <>
                {/*
                  * Una bozza va letta come una bozza.
                  *
                  * È testo generato che il coach non ha ancora confermato:
                  * leggerlo come definitivo è peggio che non averlo, e sul
                  * telefono manca il contesto per accorgersene da soli.
                  */}
                {!detail.report.approved && (
                  <View style={styles.draft}>
                    <Text style={styles.draftText}>
                      Bozza — non ancora validata da te
                    </Text>
                  </View>
                )}

                <Text style={styles.section}>In sintesi</Text>
                <Text style={styles.prose}>{detail.report.summary}</Text>

                {detail.report.themes.length > 0 && (
                  <>
                    <Text style={styles.section}>Cosa è emerso</Text>
                    {detail.report.themes.map((theme_, index) => (
                      <View key={index} style={styles.bulletRow}>
                        <Text style={styles.bullet}>·</Text>
                        <Text style={styles.prose}>{theme_}</Text>
                      </View>
                    ))}
                  </>
                )}

                {detail.report.commitments.length > 0 && (
                  <>
                    {/* L'unica parte operativa: in una seduta di coaching è
                        quello che si controlla per primo. */}
                    <Text style={styles.section}>Cosa resta da fare</Text>
                    {detail.report.commitments.map((commitment, index) => (
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
               * Un vuoto deve dire perché è vuoto.
               *
               * «Nessun riepilogo» manderebbe a cercare un guasto: le ragioni
               * sono diverse e chiedono cose diverse — attivare gli appunti,
               * aspettare, o niente.
               */
              <Text style={styles.empty}>{emptyReason(detail)}</Text>
            )}
          </ScrollView>

          {/* L'unica azione che ha senso qui: la seduta è passata, ma la
              prossima si decide spesso proprio guardando questa. */}
          <Pressable
            onPress={onBookAgain}
            accessibilityRole="button"
            accessibilityLabel={`Prenota un'altra sessione con ${session.otherName}`}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>Prenota di nuovo</Text>
          </Pressable>
        </Pressable>
      </Pressable>
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
    backdrop: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
    sheet: {
      maxHeight: '86%',
      backgroundColor: theme.ink2,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 28,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.line,
      marginBottom: 14,
    },
    head: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    photo: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.surface },
    photoEmpty: { alignItems: 'center', justifyContent: 'center' },
    photoInitial: { color: theme.mid, fontSize: 20, fontWeight: '700' },
    headText: { flex: 1, gap: 2 },
    name: { color: theme.hi, fontSize: 18, fontWeight: '800' },
    meta: { color: theme.mid, fontSize: 13 },
    body: { paddingVertical: 16, gap: 8 },
    loader: { marginTop: 30 },
    draft: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: '#e08b2a22',
      marginBottom: 4,
    },
    draftText: { color: '#e08b2a', fontSize: 12, fontWeight: '700' },
    section: {
      color: theme.mid,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: 14,
      marginBottom: 4,
    },
    prose: { color: theme.hi, fontSize: 15, lineHeight: 22, flex: 1 },
    bulletRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    bullet: { color: theme.green, fontSize: 15, lineHeight: 22 },
    commitment: { flex: 1, gap: 2 },
    owner: { color: theme.low, fontSize: 12 },
    webHint: {
      color: theme.low,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 22,
      fontStyle: 'italic',
    },
    empty: { color: theme.mid, fontSize: 15, lineHeight: 22, marginTop: 10 },
    primary: {
      minHeight: 50,
      borderRadius: 999,
      backgroundColor: theme.green,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
    },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    pressed: { opacity: 0.85 },
  });
