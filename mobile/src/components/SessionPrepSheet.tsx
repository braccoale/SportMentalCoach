import { useCallback, useEffect, useMemo, useState } from 'react';
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
  fetchSessionPrep,
  type SessionPrepPoint,
  type UpcomingSession,
} from '../lib/api';
import { dayTitle, timeLabel } from '../lib/day-grouping';
import { Icon } from './Icon';
import { useTheme, type Palette } from '../theme';

/**
 * «Da portare in questa seduta», in un foglio.
 *
 * Non e' la scheda dell'atleta in miniatura. Si apre in un momento solo — il
 * quarto d'ora prima della call, spesso in piedi — e risponde a una domanda
 * sola: «cosa devo riprendere oggi?». Quindi i punti e basta: metriche,
 * grafici, storia del percorso e validazione restano sul web, dove si leggono
 * da fermi.
 *
 * Ogni punto porta la sua provenienza. Un elenco di frasi senza da dove
 * vengono e' un elenco da credere sulla parola, e queste frasi diventano il
 * piano della seduta.
 *
 * Il foglio non e' un vicolo cieco: se la stanza e' aperta si entra da qui,
 * perche' prepararsi e cominciare sono lo stesso momento.
 */
export function SessionPrepSheet({
  session,
  visible,
  onClose,
  onOpenCall,
}: {
  session: UpcomingSession;
  visible: boolean;
  onClose: () => void;
  onOpenCall: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  /** `null` e' «non ancora caricato», `[]` e' «non c'e' niente»: due stati diversi. */
  const [points, setPoints] = useState<SessionPrepPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setPoints(null);
    setError(null);
    return fetchSessionPrep(session.bookingId)
      .then((data) => {
        // Un'app aggiornata puo' parlare con un server che non lo e' ancora:
        // la lista mancante diventa una lista vuota, non uno schianto.
        setPoints(data.points ?? []);
      })
      .catch(() => setError('Non riesco a caricare gli spunti.'));
  }, [session.bookingId]);

  useEffect(() => {
    if (!visible) return;
    void load();
  }, [visible, load]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.grabber} />

          <Text style={styles.title}>Da portare in questa seduta</Text>
          {/* Senza orario concordato la data non si scrive: «Senza orario alle
              —» e' peggio del solo nome. */}
          <Text style={styles.subtitle}>
            {session.scheduledFor
              ? `${session.otherName} · ${dayTitle(session.scheduledFor)} alle ${timeLabel(session.scheduledFor)}`
              : session.otherName}
          </Text>

          {error ? (
            <View style={styles.state}>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable
                onPress={() => void load()}
                accessibilityRole="button"
                accessibilityLabel="Riprova a caricare gli spunti"
                style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              >
                <Text style={styles.retryText}>Riprova</Text>
              </Pressable>
            </View>
          ) : points === null ? (
            <View style={styles.state}>
              <ActivityIndicator color={theme.mid} />
              <Text style={styles.stateText}>
                Cerco cosa avete lasciato aperto…
              </Text>
            </View>
          ) : points.length === 0 ? (
            <View style={styles.state}>
              <Text style={styles.emptyTitle}>Niente da riprendere, per ora.</Text>
              <Text style={styles.stateText}>
                Gli spunti nascono dai riepiloghi delle sedute precedenti e dagli
                impegni rimasti aperti. Dopo questa seduta, qui trovi cosa
                portare alla prossima.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {points.map((point) => (
                <View key={point.id} style={styles.point}>
                  <Text style={styles.pointText}>{point.text}</Text>
                  <View style={styles.pointMeta}>
                    <Text style={styles.pointSource}>{point.sourceLabel}</Text>
                    {/*
                      Un punto preso da una bozza non e' sbagliato, ma nessuno
                      l'ha ancora letto — e da qui diventa il piano della
                      seduta. La differenza va detta dove la si usa.
                    */}
                    {point.fromDraft ? (
                      <Text style={styles.draft}>Da validare</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {session.canJoinNow !== false ? (
            <Pressable
              onPress={onOpenCall}
              accessibilityRole="button"
              accessibilityLabel={`Apri la videochiamata con ${session.otherName}`}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            >
              <Icon name="videocam" size={18} color="#fff" />
              <Text style={styles.primaryText}>Apri videochiamata</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
      backgroundColor: theme.ink2,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 34,
      gap: 12,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.line,
      marginBottom: 6,
    },
    title: { color: theme.hi, fontSize: 18, fontWeight: '700' },
    subtitle: { color: theme.mid, fontSize: 13, marginTop: -6 },
    /** Cinque punti lunghi non devono spingere il foglio fuori dallo schermo. */
    list: { maxHeight: 360 },
    listContent: { gap: 10, paddingVertical: 2 },
    point: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 6,
    },
    pointText: { color: theme.hi, fontSize: 15, lineHeight: 21 },
    pointMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    pointSource: { color: theme.low, fontSize: 12, flexShrink: 1 },
    draft: {
      color: theme.mid,
      fontSize: 11,
      fontWeight: '700',
      borderWidth: 1,
      borderColor: theme.line,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    state: { paddingVertical: 18, gap: 10, alignItems: 'flex-start' },
    emptyTitle: { color: theme.hi, fontSize: 15, fontWeight: '700' },
    stateText: { color: theme.mid, fontSize: 14, lineHeight: 20 },
    retry: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 18,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.line,
    },
    retryText: { color: theme.hi, fontSize: 15, fontWeight: '600' },
    primary: {
      flexDirection: 'row',
      gap: 8,
      minHeight: 48,
      borderRadius: 999,
      backgroundColor: theme.green,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    pressed: { opacity: 0.85 },
  });
