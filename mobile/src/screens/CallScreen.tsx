import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { theme } from '../theme';

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
      <RoomStage otherName={credentials.otherName} onLeave={onLeave} />
    </LiveKitRoom>
  );
}

function RoomStage({
  otherName,
  onLeave,
}: {
  otherName: string;
  onLeave: () => void;
}) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();
  const [sharing, setSharing] = useState(false);

  /*
   * La condivisione schermo è il motivo tecnico per cui questa app esiste:
   * nel browser su telefono non è ottenibile, qui sì. Su Android non serve
   * nemmeno un selettore — si chiede, e il sistema mostra la sua richiesta di
   * conferma.
   */
  async function toggleScreenShare() {
    const next = !sharing;
    try {
      await localParticipant.setScreenShareEnabled(next);
      setSharing(next);
    } catch {
      // Rifiutata dall'utente o non disponibile: si resta com'era.
      setSharing(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.stage}>
        {tracks.map((track) => (
          <View key={track.publication.trackSid} style={styles.tile}>
            <VideoTrack trackRef={track} style={styles.video} />
          </View>
        ))}
        {tracks.length === 0 && (
          <Text style={styles.waiting}>In attesa di {otherName}…</Text>
        )}
      </View>

      <View style={styles.bar}>
        <Control
          label={isMicrophoneEnabled ? 'Microfono' : 'Muto'}
          active={isMicrophoneEnabled}
          onPress={() =>
            localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
          }
        />
        <Control
          label={isCameraEnabled ? 'Video' : 'Video off'}
          active={isCameraEnabled}
          onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        />
        <Control
          label={sharing ? 'Interrompi' : 'Condividi'}
          active={sharing}
          onPress={toggleScreenShare}
        />
        <Pressable onPress={onLeave} style={styles.leave}>
          <Text style={styles.leaveText}>Chiudi</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Control({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        active && styles.controlActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.controlText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  waiting: { color: theme.mid, textAlign: 'center' },
  bar: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    paddingBottom: 28,
    borderTopColor: theme.line,
    borderTopWidth: 1,
  },
  control: {
    flex: 1,
    backgroundColor: theme.surface,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  controlActive: { backgroundColor: theme.line },
  controlText: { color: theme.hi, fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  leave: {
    flex: 1,
    backgroundColor: theme.red,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
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
