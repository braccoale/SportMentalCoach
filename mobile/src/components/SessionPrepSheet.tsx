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
  type SessionPrepGoal,
  type SessionPrepLastSession,
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
  /** `null` e' «non ancora caricato», vuoto e' «non c'e' niente»: due stati diversi. */
  const [brief, setBrief] = useState<{
    points: SessionPrepPoint[];
    goals: SessionPrepGoal[];
    lastSession: SessionPrepLastSession | null;
    emptyReason: 'no_sessions' | 'nothing_to_carry' | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setBrief(null);
    setError(null);
    return fetchSessionPrep(session.bookingId)
      .then((data) => {
        // Un'app aggiornata puo' parlare con un server che non lo e' ancora:
        // i campi mancanti diventano vuoti, non uno schianto.
        setBrief({
          points: data.points ?? [],
          goals: data.goals ?? [],
          lastSession: data.lastSession ?? null,
          emptyReason: data.emptyReason ?? null,
        });
      })
      .catch(() => setError('Non riesco a caricare gli spunti.'));
  }, [session.bookingId]);

  const isEmpty =
    brief !== null &&
    brief.points.length === 0 &&
    brief.goals.length === 0 &&
    brief.lastSession === null;

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
          ) : brief === null ? (
            <View style={styles.state}>
              <ActivityIndicator color={theme.mid} />
              <Text style={styles.stateText}>
                Cerco cosa avete lasciato aperto…
              </Text>
            </View>
          ) : isEmpty ? (
            /*
             * Il vuoto si dichiara, non si riempie.
             *
             * Questa sintesi non genera testo: monta quello che il coach ha
             * gia' scritto o validato. Quando non c'e' materiale la risposta
             * onesta e' dire perche', e le due ragioni non sono la stessa
             * cosa — al primo incontro con un atleta «niente da riprendere»
             * suonerebbe come un guasto.
             */
            <View style={styles.state}>
              {brief.emptyReason === 'nothing_to_carry' ? (
                <>
                  <Text style={styles.emptyTitle}>
                    Niente rimasto in sospeso.
                  </Text>
                  <Text style={styles.stateText}>
                    Le sedute precedenti hanno un riepilogo, ma non hanno
                    lasciato impegni aperti ne' punti da riprendere. Quello che
                    segni durante questa chiamata comparira' qui la prossima
                    volta.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>
                    Non ci sono ancora sedute con un riepilogo.
                  </Text>
                  <Text style={styles.stateText}>
                    Questa sintesi mette insieme gli obiettivi del percorso, il
                    riepilogo dell'ultima seduta e i momenti che segni durante
                    la chiamata. Finche' non c'e' quel materiale non viene
                    inventato niente: dopo la prima seduta registrata, qui
                    trovi cosa portare alla successiva.
                  </Text>
                </>
              )}
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Dove state andando. Prima di tutto: e' la cornice che rende
                  leggibile tutto il resto. */}
              {brief.goals.length > 0 ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Dove siete</Text>
                  {brief.goals.map((goal) => (
                    <View key={goal.id} style={styles.goal}>
                      <Text style={styles.goalTitle} numberOfLines={2}>
                        {goal.isPrimary ? '★ ' : ''}
                        {goal.title}
                      </Text>
                      <Text style={styles.goalStatus}>{goal.statusLabel}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Dove eravate rimasti. Tutto materiale gia' scritto o validato
                  dal coach: la sintesi che ha approvato, la nota che l'AI non
                  tocca, i momenti che ha marcato lui dal vivo. */}
              {brief.lastSession ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>
                    {brief.lastSession.date
                      ? `L'ultima seduta · ${dayTitle(brief.lastSession.date)}`
                      : "L'ultima seduta"}
                  </Text>
                  {brief.lastSession.summary ? (
                    <Text style={styles.recap}>{brief.lastSession.summary}</Text>
                  ) : null}
                  {brief.lastSession.coachNote ? (
                    <View style={styles.note}>
                      <Text style={styles.noteLabel}>La tua nota</Text>
                      <Text style={styles.noteText}>
                        {brief.lastSession.coachNote}
                      </Text>
                    </View>
                  ) : null}
                  {brief.lastSession.bookmarks.map((bookmark) => (
                    <View key={bookmark.id} style={styles.bookmark}>
                      <Text style={styles.bookmarkMinute}>{bookmark.minute}′</Text>
                      <Text style={styles.bookmarkNote} numberOfLines={2}>
                        {bookmark.note ?? 'Momento segnato durante la seduta'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {brief.points.length > 0 ? (
                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Da riprendere</Text>
                  {brief.points.map((point) => (
                    <View key={point.id} style={styles.point}>
                      <Text style={styles.pointText}>{point.text}</Text>
                      <View style={styles.pointMeta}>
                        <Text style={styles.pointSource}>{point.sourceLabel}</Text>
                        {/*
                          Un punto preso da una bozza non e' sbagliato, ma
                          nessuno l'ha ancora letto — e da qui diventa il piano
                          della seduta. La differenza va detta dove la si usa.
                        */}
                        {point.fromDraft ? (
                          <Text style={styles.draft}>Da validare</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
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
    // Con tre blocchi il foglio e' piu' alto di prima, ma resta un foglio:
    // oltre questa altezza si mangia la videochiamata sotto.
    list: { maxHeight: 420 },
    listContent: { gap: 18, paddingVertical: 2 },
    // Un blocco e' un titolo e le sue righe. Niente riquadro attorno: sarebbero
    // schede dentro una scheda dentro un foglio, e il contenuto sparirebbe
    // sotto i bordi.
    block: { gap: 8 },
    blockTitle: {
      color: theme.low,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    goal: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    goalTitle: { color: theme.hi, fontSize: 15, lineHeight: 21, flexShrink: 1 },
    goalStatus: { color: theme.low, fontSize: 12, flexShrink: 0 },
    recap: { color: theme.hi, fontSize: 15, lineHeight: 21 },
    // La nota del coach e' l'unica cosa qui dentro scritta da lui e non
    // dall'AI: la barra a lato lo dice senza doverlo spiegare a parole.
    note: {
      borderLeftWidth: 2,
      borderLeftColor: theme.mid,
      paddingLeft: 10,
      gap: 2,
    },
    noteLabel: {
      color: theme.low,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    noteText: { color: theme.hi, fontSize: 14, lineHeight: 20 },
    bookmark: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    bookmarkMinute: {
      color: theme.mid,
      fontSize: 13,
      fontWeight: '700',
      minWidth: 34,
    },
    bookmarkNote: { color: theme.hi, fontSize: 14, lineHeight: 20, flexShrink: 1 },
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
