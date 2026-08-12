import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from '@livekit/react-native';
import { ConnectionState, Track } from 'livekit-client';
import {
  ApiError,
  ROOM_ERROR_TEXT,
  createGuestInvite,
  fetchRoomCredentials,
  type RoomCredentials,
  type UpcomingSession,
} from '../lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AiNotesConsentPanel } from '../components/AiNotesConsentPanel';
import { SessionExitStep } from '../components/SessionExitStep';
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
  const [choices, setChoices] = useState<{ audio: boolean; video: boolean } | null>(null);
  const [enterWithMic, setEnterWithMic] = useState(true);
  const [enterWithCam, setEnterWithCam] = useState(true);
  const [left, setLeft] = useState(false);
  // Prima che le credenziali arrivino non si conosce ancora il nome vero.
  const otherLabel = credentials?.otherName ?? session.otherName;

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

  /*
   * Indietro, durante la chiamata, deve valere «Chiudi» — non «torna
   * all'elenco».
   *
   * `App` ha gia` un gestore che riporta all'elenco; questo, registrato dopo,
   * viene consultato per primo, e passa dall'uscita normale. Senza, il tasto
   * Indietro saltava la schermata d'uscita e con essa la nota a caldo: il
   * gesto piu` comune su Android sarebbe stato anche quello che fa perdere il
   * pezzo di lavoro piu` deperibile.
   */
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (left) return false;
        setLeft(true);
        return true;
      }
    );
    return () => subscription.remove();
  }, [left]);

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

  /*
   * Prima di entrare si decide come entrare.
   *
   * Finora si veniva scaraventati in stanza con microfono e telecamera accesi
   * d'ufficio: si scopriva di essere in onda **dopo** esserci finiti. In una
   * seduta di mental coaching non e` un dettaglio — si arriva da una giornata,
   * da un allenamento, da una stanza con qualcuno dentro, e decidere in che
   * stato presentarsi fa parte della seduta.
   *
   * Le due scelte finiscono direttamente nelle prop di `LiveKitRoom`, quindi
   * non c'e` un momento in cui la traccia esiste contro la volonta` di chi
   * l'ha spenta.
   */
  if (!choices) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <View style={styles.prejoin}>
          <Text style={styles.prejoinTitle}>Sessione con {otherLabel}</Text>
          <Text style={styles.prejoinBody}>
            Scegli come entrare. Potrai cambiare in qualsiasi momento.
          </Text>

          <Pressable
            onPress={() => setEnterWithMic((value) => !value)}
            accessibilityRole="switch"
            accessibilityState={{ checked: enterWithMic }}
            accessibilityLabel="Entra con il microfono acceso"
            style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
          >
            <Text style={styles.choiceText}>Microfono</Text>
            <Text style={enterWithMic ? styles.choiceOn : styles.choiceOff}>
              {enterWithMic ? 'Acceso' : 'Spento'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setEnterWithCam((value) => !value)}
            accessibilityRole="switch"
            accessibilityState={{ checked: enterWithCam }}
            accessibilityLabel="Entra con la telecamera accesa"
            style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
          >
            <Text style={styles.choiceText}>Telecamera</Text>
            <Text style={enterWithCam ? styles.choiceOn : styles.choiceOff}>
              {enterWithCam ? 'Accesa' : 'Spenta'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() =>
              setChoices({ audio: enterWithMic, video: enterWithCam })
            }
            accessibilityRole="button"
            style={({ pressed }) => [styles.enter, pressed && styles.pressed]}
          >
            <Text style={styles.enterText}>Entra nella stanza</Text>
          </Pressable>

          <Pressable onPress={onLeave} hitSlop={10}>
            <Text style={styles.prejoinBack}>Non ora</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /*
   * Uscendo, `LiveKitRoom` viene smontato **prima** che compaia la schermata
   * d'uscita: e` cosi` che la stanza si chiude davvero e microfono e
   * telecamera tornano al sistema. Tenere la stanza viva dietro una schermata
   * di commiato significherebbe restare in chiamata a insaputa di chi crede di
   * aver chiuso.
   */
  if (left) {
    return (
      <SessionExitStep
        bookingId={session.bookingId}
        viewerIsCoach={credentials.viewerIsCoach}
        onDone={onLeave}
      />
    );
  }

  return (
    <LiveKitRoom
      serverUrl={credentials.url}
      token={credentials.token}
      connect
      audio={choices.audio}
      video={choices.video}
      onDisconnected={() => setLeft(true)}
    >
      <RoomStage
        otherName={credentials.otherName}
        onLeave={() => setLeft(true)}
        bookingId={session.bookingId}
        viewerIsCoach={credentials.viewerIsCoach}
        coachIdentity={credentials.coachIdentity}
      />
    </LiveKitRoom>
  );
}

function RoomStage({
  otherName,
  onLeave,
  bookingId,
  viewerIsCoach,
  coachIdentity,
}: {
  otherName: string;
  onLeave: () => void;
  bookingId: number;
  viewerIsCoach: boolean;
  coachIdentity: string;
}) {
  const tracks = useTracks([Track.Source.Camera, Track.Source.ScreenShare]);
  const participants = useParticipants();
  const connection = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } =
    useLocalParticipant();

  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cameraWasOn = useRef(false);
  const facingFront = useRef(true);
  // Il coach non aspetta se stesso: entra diretto.
  const [admitted, setAdmitted] = useState(viewerIsCoach);
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
   * La sala d'attesa: l'atleta non resta solo in una stanza vuota.
   *
   * Entrare per primo in una videochiamata e parlare al nulla e` una brutta
   * esperienza ovunque; in una seduta di mental coaching e` peggio, perche' la
   * persona sta gia` facendo la fatica di presentarsi. Finche` il coach non
   * c'e`, l'atleta vede una schermata che dice cosa sta succedendo invece di un
   * riquadro nero da interpretare.
   *
   * Una volta ammessi non si torna indietro: se al coach cade la linea per
   * venti secondi, rispedire l'atleta in anticamera sarebbe la cosa piu`
   * sbagliata da fare proprio nel momento peggiore.
   */
  const coachPresent = participants.some(
    (participant) => participant.identity === coachIdentity
  );
  useEffect(() => {
    if (coachPresent) setAdmitted(true);
  }, [coachPresent]);

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

  /*
   * Invitare un ospite — un genitore, un preparatore — a questa sessione.
   *
   * Si usa il foglio di condivisione del sistema, non una copia negli appunti:
   * su un telefono il gesto naturale e` «manda a», e chi condivide sceglie il
   * canale che usa gia`. Copiare e poi cercare dove incollare e` un'abitudine
   * da scrivania.
   *
   * Il collegamento non contiene mai una credenziale della stanza: l'ospite lo
   * scambia per un accesso di breve durata solo a finestra aperta, e a
   * decidere e` il server.
   */
  async function inviteGuest() {
    setShareError(null);
    try {
      const invite = await createGuestInvite(bookingId);
      await Share.share({
        message: `Ti invito alla mia sessione KaiPai: ${invite.url}`,
      });
    } catch (error) {
      setShareError(
        error instanceof ApiError
          ? 'Invito non disponibile per questa sessione.'
          : 'Non sono riuscito a creare l’invito.'
      );
    }
  }

  /*
   * Girare la fotocamera.
   *
   * `restartTrack` con l'altro `facingMode` e` il modo previsto da
   * livekit-client: la traccia pubblicata resta la stessa, quindi chi guarda
   * non vede la connessione cadere e riprendere — vede solo l'inquadratura
   * cambiare, che e` l'unica cosa che ha chiesto.
   */
  async function flipCamera() {
    const publication = localParticipant.getTrackPublication(
      Track.Source.Camera
    );
    const track = publication?.videoTrack;
    if (!track) return;
    const next = facingFront.current ? 'environment' : 'user';
    try {
      await track.restartTrack({ facingMode: next });
      facingFront.current = !facingFront.current;
    } catch {
      // Alcuni dispositivi hanno una sola fotocamera: non e` un errore da
      // raccontare, semplicemente non c'e` niente da girare.
    }
  }

  if (!admitted) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <View style={styles.prejoin}>
          <ActivityIndicator color={theme.red} />
          <Text style={styles.prejoinTitle}>Sei in sala d’attesa</Text>
          <Text style={styles.prejoinBody}>
            {otherName} non è ancora entrato. Appena arriva, la sessione parte
            da sola — puoi lasciare il telefono acceso.
          </Text>
          <Pressable onPress={onLeave} hitSlop={10}>
            <Text style={styles.prejoinBack}>Esci dalla sala d’attesa</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/*
        * Lo stato della connessione, detto solo quando non e` quello normale.
        *
        * Un riquadro fermo e nero non distingue «sta ricollegando» da «e`
        * caduta» da «l'altro ha spento la telecamera»: sono tre cose diverse e
        * senza una parola si finisce a scuotere il telefono. Un banner
        * permanente che dice «connesso» sarebbe invece rumore costante.
        */}
      {connection !== ConnectionState.Connected && (
        <View style={styles.connectionBanner}>
          <Text style={styles.connectionText} accessibilityLiveRegion="polite">
            {connection === ConnectionState.Reconnecting ||
            connection === ConnectionState.SignalReconnecting
              ? 'Connessione instabile, sto riprovando…'
              : connection === ConnectionState.Connecting
                ? 'Mi sto collegando…'
                : 'Connessione persa.'}
          </Text>
        </View>
      )}

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

        {/*
          * Le azioni secondarie stanno su una riga a parte, in testo.
          *
          * Cinque pillole in fila su uno schermo stretto diventano cinque
          * bersagli da sessanta punti con le parole spezzate: nessuno si
          * centra col pollice e nessuna si legge. Microfono, video e
          * condivisione si usano di continuo e restano pulsanti; girare la
          * fotocamera e invitare qualcuno si fanno una volta per sessione.
          */}
        <View style={styles.secondaryRow}>
          {/* Girare la fotocamera ha senso solo se la fotocamera è accesa. */}
          {isCameraEnabled && (
            <Pressable
              onPress={flipCamera}
              accessibilityRole="button"
              accessibilityLabel="Gira la fotocamera"
              hitSlop={10}
            >
              <Text style={styles.secondaryAction}>Gira fotocamera</Text>
            </Pressable>
          )}
          <Pressable
            onPress={inviteGuest}
            accessibilityRole="button"
            accessibilityLabel="Invita un ospite in questa sessione"
            hitSlop={10}
          >
            <Text style={styles.secondaryAction}>Invita un ospite</Text>
          </Pressable>
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
  prejoin: { width: '100%', paddingHorizontal: 24, gap: 10 },
  prejoinTitle: { color: theme.hi, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  prejoinBody: { color: theme.mid, fontSize: 14, textAlign: 'center', marginBottom: 10 },
  prejoinBack: { color: theme.mid, fontSize: 14, textAlign: 'center', paddingVertical: 12 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: theme.ink2,
    borderColor: theme.line,
    borderWidth: 1,
  },
  choiceText: { color: theme.hi, fontSize: 16 },
  choiceOn: { color: theme.red2, fontSize: 14, fontWeight: '700' },
  choiceOff: { color: theme.low, fontSize: 14, fontWeight: '700' },
  enter: {
    backgroundColor: theme.red,
    borderRadius: 999,
    minHeight: 52,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enterText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  connectionBanner: {
    backgroundColor: theme.surface,
    borderBottomColor: theme.line,
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  connectionText: { color: theme.hi, fontSize: 12, textAlign: 'center' },
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
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingVertical: 4,
  },
  secondaryAction: { color: theme.mid, fontSize: 13, paddingVertical: 6 },
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
