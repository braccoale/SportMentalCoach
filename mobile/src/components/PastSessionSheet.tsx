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
  updateCommitmentStatus,
  type SessionDetail,
  type UpcomingSession,
} from '../lib/api';
import { Icon } from './Icon';
import { SessionMetrics } from './SessionMetrics';
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
  /** L'impegno che sta cambiando stato: uno per volta, e si vede quale. */
  const [saving, setSaving] = useState<number | null>(null);
  const [commitmentError, setCommitmentError] = useState<string | null>(null);

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

  /*
   * I campi nuovi si leggono con la rete tesa.
   *
   * L'app aggiornata puo` parlare con un server che non lo e` ancora — e con
   * `report.metrics` assente, `metrics.length` non e` un campo vuoto: e` la
   * scheda che si schianta. Le liste mancanti diventano liste vuote.
   */
  const report = detail?.report
    ? {
        ...detail.report,
        prep: detail.report.prep ?? [],
        followUps: detail.report.followUps ?? [],
        metrics: detail.report.metrics ?? [],
        themes: detail.report.themes ?? [],
        keyMoments: detail.report.keyMoments ?? [],
        commitments: detail.report.commitments ?? [],
        emotionalTrend: detail.report.emotionalTrend ?? [],
        throughLine: detail.report.throughLine ?? null,
        tone: detail.report.tone ?? null,
        emergingResource: detail.report.emergingResource ?? null,
        coachNote: detail.report.coachNote ?? null,
        coverageNotice: detail.report.coverageNotice ?? null,
      }
    : null;

  /*
   * Segnare fatto: l'unica cosa che si *fa* da questa scheda, invece di
   * leggerla. Il segno appare subito e torna indietro se il server rifiuta —
   * su una rete mobile aspettare la risposta per vedere una spunta significa
   * toccarla due volte.
   */
  async function toggleCommitment(trackedId: number, done: boolean) {
    const sessionId = detail?.aiNotesSessionId;
    if (!sessionId) return;
    const next = done ? 'pending' : 'completed';
    setSaving(trackedId);
    setCommitmentError(null);
    setDetail((current) => withCommitmentStatus(current, trackedId, next));
    try {
      await updateCommitmentStatus({
        aiNotesSessionId: sessionId,
        commitmentId: trackedId,
        status: next,
      });
    } catch {
      setDetail((current) =>
        withCommitmentStatus(current, trackedId, done ? 'completed' : 'pending')
      );
      setCommitmentError('Non sono riuscito a salvare. Riprova.');
    } finally {
      setSaving(null);
    }
  }

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
              {/* Prima di tutto il resto: se manca parte dell'audio, ogni
                  numero qui sotto va letto sapendolo. */}
              {report.coverageNotice ? (
                <View style={styles.coverage}>
                  <Text style={styles.coverageText}>{report.coverageNotice}</Text>
                </View>
              ) : null}

              {!report.approved && (
                <View style={styles.draft}>
                  <Text style={styles.draftText}>
                    Bozza — non ancora validata da te
                  </Text>
                </View>
              )}

              <Text style={styles.section}>In sintesi</Text>
              <Text style={styles.prose}>{report.summary}</Text>

              {/* Il filo con le sedute precedenti: una riga, ed è quella che
                  colloca la seduta in un percorso invece che nel vuoto. */}
              {report.throughLine ? (
                <View style={styles.thread}>
                  <Text style={styles.threadText}>{report.throughLine}</Text>
                </View>
              ) : null}

              {/* La nota del coach prima di tutto ciò che ha scritto l'AI: è
                  l'unica parte di cui è lui l'autore, e la riconosce come
                  sua. Marcata, non mescolata. */}
              {report.coachNote ? (
                <View style={styles.coachNote}>
                  <Text style={styles.coachNoteLabel}>La tua nota</Text>
                  <Text style={styles.prose}>{report.coachNote}</Text>
                </View>
              ) : null}

              {/* Una riga sola, e dice cosa usare la volta dopo: sta con la
                  preparazione, non fra i temi da sapere. */}
              {report.emergingResource ? (
                <>
                  <Text style={styles.section}>La leva</Text>
                  <Text style={styles.prose}>{report.emergingResource}</Text>
                </>
              ) : null}

              {/*
                * Cosa fare la prossima volta, subito dopo la sintesi.
                *
                * È il motivo per cui questa scheda si apre da un telefono —
                * i due minuti prima della seduta successiva — e stava in fondo,
                * dopo grafici e momenti, quando non ci stava affatto.
                */}
              {(report.prep.length > 0 || report.followUps.length > 0) && (
                <>
                  <Text style={styles.section}>Per la prossima volta</Text>
                  {report.prep.map((text, index) => (
                    <View key={`prep-${index}`} style={styles.bulletRow}>
                      <Text style={styles.bullet}>·</Text>
                      <Text style={styles.prose}>{text}</Text>
                    </View>
                  ))}
                  {/*
                    * Le domande rimaste aperte, sotto la loro intestazione.
                    *
                    * Qui c'era un «?» verde al posto del punto elenco: un segno
                    * da decifrare al posto di una parola che si legge. Se serve
                    * spiegare cosa vuol dire un simbolo, il simbolo ha gia'
                    * fallito.
                    */}
                  {report.followUps.length > 0 && (
                    <>
                      <Text style={styles.subsection}>Domande da riprendere</Text>
                      {report.followUps.map((text, index) => (
                        <View key={`follow-${index}`} style={styles.bulletRow}>
                          <Text style={styles.bullet}>·</Text>
                          <Text style={styles.prose}>{text}</Text>
                        </View>
                      ))}
                    </>
                  )}
                </>
              )}

              {report.commitments.length > 0 && (
                <>
                  {/* L'unica parte operativa: in una seduta di coaching è
                      quello che si controlla per primo. */}
                  <Text style={styles.section}>Cosa resta da fare</Text>
                  {report.commitments.map((commitment, index) => {
                    const done = commitment.status === 'completed';
                    const meta = `${commitment.owner === 'coach' ? 'Coach' : 'Atleta'}${
                      commitment.dueDate ? ` · entro ${commitment.dueDate}` : ''
                    }`;

                    /*
                     * Finché il report è una bozza l'impegno vive solo dentro
                     * il documento: non ha uno stato da cambiare, e una spunta
                     * che non salva niente sarebbe una bugia. Si legge.
                     */
                    if (commitment.trackedId === null) {
                      return (
                        <View key={index} style={styles.bulletRow}>
                          <Text style={styles.bullet}>·</Text>
                          <View style={styles.commitment}>
                            <Text style={styles.prose}>{commitment.text}</Text>
                            <Text style={styles.owner}>{meta}</Text>
                          </View>
                        </View>
                      );
                    }

                    return (
                      <Pressable
                        key={index}
                        onPress={() =>
                          void toggleCommitment(commitment.trackedId!, done)
                        }
                        disabled={saving === commitment.trackedId}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: done }}
                        accessibilityLabel={commitment.text}
                        style={({ pressed }) => [
                          styles.todo,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.box, done && styles.boxOn]}>
                          {done ? (
                            <Icon name="check" size={15} color="#fff" />
                          ) : null}
                        </View>
                        <View style={styles.commitment}>
                          <Text style={[styles.prose, done && styles.doneText]}>
                            {commitment.text}
                          </Text>
                          <Text style={styles.owner}>{meta}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                  {commitmentError ? (
                    <Text style={styles.saveError}>{commitmentError}</Text>
                  ) : null}
                </>
              )}

              {report.emotionalTrend.length >= 2 && (
                <>
                  <Text style={styles.section}>Come è andata</Text>
                  <SessionTrend points={report.emotionalTrend} />
                </>
              )}

              {report.metrics.length > 0 && (
                <>
                  <Text style={styles.section}>Come si è presentato</Text>
                  <SessionMetrics metrics={report.metrics} />
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
                  {/* Il tono sta qui e non in una sezione propria: è un'altra
                      cosa sullo stesso argomento, come ha parlato. */}
                  {report.tone && (
                    <Text style={styles.tone}>
                      <Text style={styles.toneKey}>
                        {TONE_LABELS[report.tone.key] ?? report.tone.key}
                      </Text>
                      {` — ${report.tone.description}`}
                      {report.tone.confidence === 'low' ? ' (stima incerta)' : ''}
                    </Text>
                  )}
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
                      <View style={styles.momentHead}>
                        <Text style={styles.momentTitle}>{moment.title}</Text>
                        {typeof moment.minute === 'number' && (
                          <Text style={styles.minute}>{moment.minute}′</Text>
                        )}
                      </View>
                      <Text style={styles.momentBody}>{moment.explanation}</Text>
                      {/* La frase da cui nasce, con a fianco chi l'ha detta:
                          è l'ancora del momento, non un ornamento. */}
                      {moment.quote ? (
                        <View style={styles.quote}>
                          <Text style={styles.quoteText}>«{moment.quote}»</Text>
                          <Text style={styles.quoteWho}>
                            {moment.speaker === 'coach' ? 'tu' : 'lui/lei'}
                          </Text>
                        </View>
                      ) : null}
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

/**
 * Le etichette del tono, in italiano.
 *
 * Descrivono il linguaggio dell'atleta in quella seduta — non la sua voce, non
 * il suo carattere: «sulle difensive» è come ha parlato oggi, non chi è.
 */
const TONE_LABELS: Record<string, string> = {
  enthusiastic: 'Entusiasta',
  open: 'Aperto',
  reflective: 'Riflessivo',
  hesitant: 'Esitante',
  guarded: 'Sulle difensive',
  frustrated: 'Frustrato',
  neutral: 'Neutro',
};

/** Lo stesso dettaglio con un impegno in uno stato diverso. */
function withCommitmentStatus(
  detail: SessionDetail | null,
  trackedId: number,
  status: string
): SessionDetail | null {
  if (!detail?.report) return detail;
  return {
    ...detail,
    report: {
      ...detail.report,
      commitments: detail.report.commitments.map((commitment) =>
        commitment.trackedId === trackedId ? { ...commitment, status } : commitment
      ),
    },
  };
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
  /*
   * Pronto ma non arrivato non e' «non c'e'».
   *
   * Con gli appunti in stato di riepilogo pronto e nessun documento in mano, il
   * riepilogo esiste e non si e' potuto leggere: dirlo assente e' la bugia che
   * ha fatto cercare il problema dalla parte sbagliata.
   */
  if (detail.notes === 'ready_for_review' || detail.notes === 'approved') {
    return 'Il riepilogo c’è, ma non si è potuto caricare. Riprova fra poco, oppure aprilo su KaiPai web.';
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
    subsection: {
      color: theme.low,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 14,
      marginBottom: 2,
    },
    prose: { color: theme.hi, fontSize: 15, lineHeight: 23, flex: 1 },
    // Arancione come l'avviso in chiamata: è la stessa notizia, vista dopo.
    coverage: {
      backgroundColor: '#e08b2a1f',
      borderLeftWidth: 2,
      borderLeftColor: '#e08b2a',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 18,
    },
    coverageText: { color: '#e08b2a', fontSize: 13, lineHeight: 19, fontWeight: '600' },
    coachNote: {
      backgroundColor: theme.ink2,
      borderRadius: 14,
      padding: 14,
      marginTop: 18,
      gap: 6,
    },
    coachNoteLabel: {
      color: theme.low,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    tone: { color: theme.mid, fontSize: 13, lineHeight: 20, marginTop: 12 },
    toneKey: { color: theme.hi, fontWeight: '700' },
    bulletRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    bullet: { color: theme.green, fontSize: 15, lineHeight: 23 },
    moment: {
      backgroundColor: theme.ink2,
      borderRadius: 14,
      padding: 14,
      marginTop: 8,
      gap: 4,
    },
    momentHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 10,
    },
    momentTitle: { color: theme.hi, fontSize: 15, fontWeight: '700', flex: 1 },
    // Il minuto: dove riascoltare, quando si torna sul web.
    minute: { color: theme.low, fontSize: 12, fontWeight: '700' },
    momentBody: { color: theme.mid, fontSize: 14, lineHeight: 20 },
    quote: {
      borderLeftWidth: 2,
      borderLeftColor: theme.line,
      paddingLeft: 10,
      marginTop: 8,
      gap: 3,
    },
    quoteText: { color: theme.hi, fontSize: 14, lineHeight: 21, fontStyle: 'italic' },
    quoteWho: { color: theme.low, fontSize: 11 },
    commitment: { flex: 1, gap: 2 },
    owner: { color: theme.low, fontSize: 12 },
    // Il filo con le sedute precedenti: staccato dalla sintesi da una linea,
    // non da un riquadro — è la stessa voce, non un altro blocco.
    thread: {
      borderLeftWidth: 2,
      borderLeftColor: theme.green,
      paddingLeft: 12,
      marginTop: 12,
    },
    threadText: { color: theme.mid, fontSize: 14, lineHeight: 21 },
    // Tutta la riga è il bersaglio: 44pt di altezza minima, non solo il
    // quadratino.
    todo: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'flex-start',
      minHeight: 44,
      paddingVertical: 8,
    },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.line,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    boxOn: { backgroundColor: theme.green, borderColor: theme.green },
    // Fatto: resta leggibile, ma smette di chiedere attenzione.
    doneText: { color: theme.mid, textDecorationLine: 'line-through' },
    saveError: { color: theme.red2, fontSize: 13, marginTop: 8 },
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
