import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import {
  ApiError,
  ROOM_ERROR_TEXT,
  fetchRoomCredentials,
  type RoomCredentials,
  type UpcomingSession,
} from '../lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AiNotesConsentPanel } from '../components/AiNotesConsentPanel';
import { useTheme, type Palette } from '../theme';

/**
 * La schermata chiamata: il motivo per cui questa app esiste.
 *
 * Il token non lo costruisce l'app — lo chiede al server, che applica gli
 * stessi controlli della pagina web (partecipazione, stato della
 * prenotazione, tutela dei minori, finestra oraria). Un client non deve mai
 * poter decidere da solo di entrare in una stanza.
 */
export function CallScreen({
  session,
  onLeave,
}: {
  session: UpcomingSession;
  onLeave: () => void;
}) {
  const [credentials, setCredentials] = useState<RoomCredentials | null>(null);
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // La sessione audio va avviata prima di entrare e chiusa all'uscita:
    // senza, su Android l'audio esce dall'altoparlante sbagliato.
    void AudioSession.startAudioSession();
    (async () => {
      try {
        const data = await fetchRoomCredentials(session.bookingId);
        if (!cancelled) setCredentials(data);
      } catch (err) {
        if (cancelled) return;
        const code = err instanceof ApiError ? err.code : '';
        setError(ROOM_ERROR_TEXT[code] ?? 'Non riesco ad aprire la stanza.');
      }
    })();
    return () => {
      cancelled = true;
      void AudioSession.stopAudioSession();
    };
  }, [session.bookingId]);

  if (error) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text style={styles.error}>{error}</Text>
        <Pressable onPress={onLeave} style={styles.secondary}>
          <Text style={styles.secondaryText}>Torna indietro</Text>
        </Pressable>
      </View>
    );
  }

  if (!credentials) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={theme.red} />
        <Text style={styles.connecting}>Apro la stanza…</Text>
      </View>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={credentials.url}
      token={credentials.token}
      connect
      audio
      video
      onDisconnected={onLeave}
    >
      <RoomStage
        otherName={credentials.otherName}
        onLeave={onLeave}
        bookingId={session.bookingId}
        viewerIsCoach={credentials.viewerIsCoach}
      />
    </LiveKitRoom>
  );
}

function RoomStage({
  otherName,
  onLeave,
  bookingId,
  viewerIsCoach,
}: {
  otherName: string;
  onLeave: () => void;
  bookingId: number;
  viewerIsCoach: boolean;
}) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();

  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cameraWasOn = useRef(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  /*
   * L'app che va in secondo piano durante una sessione.
   *
   * Prima non succedeva niente: la telecamera restava accesa a riprendere una
   * tasca, con il costo di batteria che comporta, e su Android il sistema puo`
   * comunque strappare la fotocamera all'app sospesa lasciando una traccia
   * pubblicata ma morta — l'altra persona vede un fermo immagine e non capisce.
   *
   * Il microfono **non** si tocca: uscire un attimo dall'app per guardare
   * qualcosa non deve zittire chi sta parlando. È la differenza fra mettere
   * giu` il telefono e riagganciare.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        if (localParticipant.isCameraEnabled) {
          cameraWasOn.current = true;
          void localParticipant.setCameraEnabled(false);
        }
        return;
      }
      if (next === 'active' && cameraWasOn.current) {
        cameraWasOn.current = false;
        void localParticipant.setCameraEnabled(true);
      }
    });
    return () => subscription.remove();
  }, [localParticipant]);

  /*
   * `useTracks` non restituisce solo tracce: restituisce anche **segnaposto**
   * per i partecipanti che non hanno ancora pubblicato nulla, e in quel caso
   * `publication` e' `undefined`.
   *
   * Qui prima si leggeva `track.publication.trackSid` su ogni elemento, e
   * bastava che l'altra persona entrasse con la telecamera spenta perche'
   * l'intera scena andasse in eccezione: niente video, niente controlli, un
   * errore al posto della chiamata.
   */
  const published = tracks.filter((track) => track.publication);
  const remote = published.filter((track) => !track.participant.isLocal);
  const local = published.find((track) => track.participant.isLocal);
  // Qualcuno c'e', ma non si vede: e' un'informazione diversa da «sei solo».
  const someoneElseHere = participants.some((participant) => !participant.isLocal);

  /*
   * La condivisione schermo è il motivo tecnico per cui questa app esiste:
   * nel browser su telefono non è ottenibile, qui sì. Su Android non serve
   * nemmeno un selettore — si chiede, e il sistema mostra la sua richiesta di
   * conferma.
   */
  async function toggleScreenShare() {
    const next = !sharing;
    setShareError(null);
    try {
      await localParticipant.setScreenShareEnabled(next);
      setSharing(next);
    } catch (error) {
      /*
       * Prima qui c'era un `catch` muto, e il risultato era il peggiore
       * possibile: si premeva «Condividi» e non succedeva niente. Un pulsante
       * che non fa nulla e non dice nulla e' indistinguibile da un pulsante
       * rotto, e non lascia appiglio per capire perche'.
       *
       * Il rifiuto dell'utente e il guasto tecnico si somigliano ma non sono
       * la stessa cosa: nel primo caso non c'e' niente da dire, nel secondo
       * serve sapere cosa non ha funzionato.
       */
      setSharing(false);
      const message = error instanceof Error ? error.message : '';
      setShareError(
        /permission|denied|cancel/i.test(message)
          ? 'Condivisione annullata.'
          : `Condivisione non riuscita: ${message || 'motivo sconosciuto'}`
      );
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.stage}>
        {remote.length > 0 ? (
          remote.map((track) => (
            <View key={track.publication!.trackSid} style={styles.tile}>
              <VideoTrack trackRef={track} style={styles.video} />
            </View>
          ))
        ) : (
          <View style={[styles.tile, styles.centered]}>
            <Text style={styles.waiting}>
              {/*
                * Due assenze diverse, due frasi diverse. «Non c'è ancora» e «è
                * qui con la telecamera spenta» si vedono uguali — uno schermo
                * nero — ma chiedono cose opposte: aspettare, oppure dirle di
                * accendere. Non distinguerle lascia a guardare il nero senza
                * sapere cosa fare.
                */}
              {someoneElseHere
                ? `${otherName} è in chiamata con la telecamera spenta.`
                : `In attesa di ${otherName}…`}
            </Text>
          </View>
        )}

        {/* La propria immagine piccola, in un angolo: serve a controllarsi, non
            a guardarsi. Sotto, mai sopra, la persona con cui si parla. */}
        {local && (
          <View style={styles.selfTile}>
            <VideoTrack trackRef={local} style={styles.video} />
          </View>
        )}
      </View>

      <AiNotesConsentPanel bookingId={bookingId} canActivate={viewerIsCoach} />

      {shareError && (
        <Text style={styles.shareError} accessibilityLiveRegion="polite">
          {shareError}
        </Text>
      )}

      {/*
        * Etichette **fisse**, e «Chiudi» staccato dagli altri.
        *
        * Prima l'etichetta cambiava da «Video» a «Video off» a ogni tocco: la
        * larghezza del pulsante si muoveva, e i tre controlli ballavano sotto
        * il dito mentre si parla. Ora la parola non cambia mai — lo stato lo
        * dice il colore e un punto, che si leggono senza rileggere.
        *
        * E «Chiudi» ha uno spazio suo: un pulsante distruttivo non sta
        * appiccicato a quello che si preme ogni due minuti.
        */}
      <View style={[styles.bar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.controls}>
          <Control
            label="Microfono"
            active={isMicrophoneEnabled}
            onPress={() =>
              localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
            }
          />
          <Control
            label="Video"
            active={isCameraEnabled}
            onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
          />
          <Control label="Condividi" active={sharing} onPress={toggleScreenShare} />
        </View>
        <Pressable
          onPress={onLeave}
          accessibilityRole="button"
          accessibilityLabel="Chiudi la chiamata"
          style={({ pressed }) => [styles.leave, pressed && styles.pressed]}
        >
          <Text style={styles.leaveText}>Chiudi</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Un controllo della barra.
 *
 * Lo stato si legge in due modi indipendenti — il colore del punto e il testo
 * annunciato allo screen reader — perché il colore da solo non è
 * un'informazione per tutti.
 */
function Control({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: active }}
      accessibilityHint={active ? 'Attivo, tocca per disattivare' : 'Disattivo, tocca per attivare'}
      style={({ pressed }) => [
        styles.control,
        active && styles.controlActive,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.dot, active ? styles.dotOn : styles.dotOff]} />
      <Text style={styles.controlText}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  connecting: { color: theme.mid },
  error: { color: theme.red2, textAlign: 'center', paddingHorizontal: 32 },
  stage: { flex: 1, gap: 8, padding: 8, justifyContent: 'center' },
  tile: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 16,
    overflow: 'hidden',
  },
  video: { flex: 1 },
  waiting: { color: theme.mid, textAlign: 'center', paddingHorizontal: 24 },
  selfTile: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 104,
    height: 148,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: theme.line,
  },
  shareError: {
    color: theme.red2,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  bar: {
    gap: 12,
    padding: 12,
    borderTopColor: theme.line,
    borderTopWidth: 1,
  },
  controls: { flexDirection: 'row', gap: 8 },
  control: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: theme.surface,
    borderRadius: 999,
    // 44 di altezza minima: sotto, il bersaglio non si centra col pollice.
    minHeight: 44,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlActive: { backgroundColor: theme.line },
  controlText: { color: theme.hi, fontSize: 12, fontWeight: '600' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotOn: { backgroundColor: theme.red2 },
  dotOff: { backgroundColor: theme.low },
  pressed: { opacity: 0.85 },
  leave: {
    backgroundColor: theme.red,
    borderRadius: 999,
    minHeight: 48,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  secondary: {
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  secondaryText: { color: theme.hi },
});
