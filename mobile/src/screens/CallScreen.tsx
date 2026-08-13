import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Image,
  Modal,
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
import { useKeepAwake } from 'expo-keep-awake';
import {
  ApiError,
  ROOM_ERROR_TEXT,
  createGuestInvite,
  fetchRoomCredentials,
  sendSessionHeartbeat,
  type RoomCredentials,
  type UpcomingSession,
} from '../lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AiNotesConsentPanel } from '../components/AiNotesConsentPanel';
import { SessionExitStep } from '../components/SessionExitStep';
import { AudioOutputPicker } from '../components/AudioOutputPicker';
import { Icon, type IconName } from '../components/Icon';
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
  minimized = false,
  onMinimize,
  onExpand,
}: {
  session: UpcomingSession;
  onLeave: () => void;
  /**
   * La chiamata continua, ma occupa solo una barra: sotto c'e` l'app.
   *
   * Serve a guardare il prossimo appuntamento mentre si parla — cosa che
   * prima costringeva a chiudere la stanza e rientrare, cioe` a interrompere
   * la seduta per una domanda di dieci secondi.
   */
  minimized?: boolean;
  onMinimize?: () => void;
  onExpand?: () => void;
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
        /*
         * A stanza aperta, «indietro» riduce: non chiude.
         *
         * Chiudere per sbaglio una sessione in corso e` il danno peggiore che
         * un gesto involontario possa fare qui, e «indietro» e` il gesto piu`
         * frequente su Android. Per uscire davvero c'e` il pulsante rosso, che
         * si preme apposta.
         */
        if (onMinimize && !minimized) {
          onMinimize();
          return true;
        }
        if (minimized) return false;
        setLeft(true);
        return true;
      }
    );
    return () => subscription.remove();
  }, [left, minimized, onMinimize]);

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
        otherAvatarUrl={session.otherAvatarUrl ?? null}
        minimized={minimized}
        onMinimize={onMinimize}
        onExpand={onExpand}
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
  otherAvatarUrl,
  minimized = false,
  onMinimize,
  onExpand,
}: {
  otherName: string;
  onLeave: () => void;
  bookingId: number;
  viewerIsCoach: boolean;
  coachIdentity: string;
  /** La foto di chi si ha davanti, mostrata quando la sua telecamera e` spenta. */
  otherAvatarUrl: string | null;
  minimized?: boolean;
  onMinimize?: () => void;
  onExpand?: () => void;
}) {
  /*
   * Lo schermo non si spegne durante la sessione.
   *
   * Il telefono spegne lo schermo dopo trenta secondi di inattivita`, e in una
   * seduta di mental coaching l'inattivita` **e` il lavoro**: si ascolta, si
   * pensa, si sta in silenzio. Senza questo, chi ascolta viene puntualmente
   * oscurato proprio nei momenti che contano, e deve toccare il vetro per
   * restare presente.
   *
   * Vale solo qui dentro: `useKeepAwake` rilascia il blocco allo smontaggio,
   * quindi uscendo dalla chiamata il telefono torna a comportarsi da telefono.
   */
  useKeepAwake();

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [audioOpen, setAudioOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  // Dopo venti secondi senza collegarsi, si smette di far credere che manchi poco.
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (connection === ConnectionState.Connected) {
      setStuck(false);
      return;
    }
    const timer = setTimeout(() => setStuck(true), 20_000);
    return () => clearTimeout(timer);
  }, [connection]);

  /*
   * Il battito della sessione, come dal web.
   *
   * Dal telefono non lo mandava nessuno, e senza battito il server non sa che
   * la sessione e` davvero cominciata: nella cronologia una seduta tenuta dal
   * telefono non aveva durata reale, e l'elenco non poteva distinguere «e`
   * uscito un attimo fa» da «non c'e` mai entrato».
   *
   * Ogni quindici secondi finche` si e` collegati, come il web. Se una
   * chiamata fallisce si tace: e` una misura, non un comando, e non deve
   * disturbare chi sta parlando.
   */
  useEffect(() => {
    if (connection !== ConnectionState.Connected) return;
    let active = true;
    const ping = () => {
      if (!active) return;
      void sendSessionHeartbeat(bookingId).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [connection, bookingId]);

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
  // Se chi hai davanti e` muto va detto: senza, si parla a qualcuno che non
  // puo` rispondere e non si capisce perche' tace.
  const remoteMuted = participants.some(
    (participant) => !participant.isLocal && !participant.isMicrophoneEnabled
  );

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

  /*
   * La chiamata ridotta: una barra, e sotto l'app.
   *
   * La stanza non viene smontata — e` lo stesso albero di componenti, disegnato
   * in piccolo — quindi audio e video non si interrompono: si continua a
   * parlare mentre si guarda l'elenco degli appuntamenti. Smontare e rimontare
   * avrebbe significato uscire e rientrare, con i suoi secondi di silenzio e
   * la stanza che si chiude a chi resta dentro.
   *
   * Resta il minimo indispensabile: chi c'e`, il microfono (la cosa che si
   * cambia di corsa), il ritorno a schermo pieno, e la chiusura.
   */
  if (minimized) {
    return (
      <Pressable
        onPress={onExpand}
        accessibilityRole="button"
        accessibilityLabel={`Torna alla videochiamata con ${otherName}`}
        style={[styles.miniBar, { bottom: insets.bottom + 12 }]}
      >
        {local ? (
          <View style={styles.miniVideo}>
            <VideoTrack trackRef={local} style={styles.video} />
          </View>
        ) : (
          <View style={[styles.miniVideo, styles.centered]}>
            <Icon name="videocamOff" size={16} color={theme.mid} />
          </View>
        )}

        <View style={styles.miniText}>
          <Text style={styles.miniTitle} numberOfLines={1}>
            {otherName}
          </Text>
          <Text style={styles.miniHint}>
            {connection === ConnectionState.Connected
              ? 'Sessione in corso'
              : 'Mi sto collegando…'}
          </Text>
        </View>

        <Pressable
          onPress={() =>
            void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
          }
          accessibilityRole="button"
          accessibilityLabel={
            isMicrophoneEnabled ? 'Spegni il microfono' : 'Accendi il microfono'
          }
          hitSlop={8}
          style={styles.miniButton}
        >
          <Icon
            name={isMicrophoneEnabled ? 'mic' : 'micOff'}
            size={20}
            color={isMicrophoneEnabled ? theme.hi : theme.red2}
          />
        </Pressable>

        <Pressable
          onPress={onLeave}
          accessibilityRole="button"
          accessibilityLabel="Chiudi la videochiamata"
          hitSlop={8}
          style={[styles.miniButton, styles.miniEnd]}
        >
          <Icon name="callEnd" size={20} color="#fff" />
        </Pressable>
      </Pressable>
    );
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
                ? stuck
                  ? 'Non riesco a stabilire la connessione video. Rete o firewall la stanno bloccando.'
                  : 'Mi sto collegando…'
                : 'Connessione persa.'}
          </Text>
          {/*
            * «Mi sto collegando» che non finisce mai e` peggio di un errore:
            * sembra che stia per riuscire, e si aspetta. Dopo venti secondi si
            * dice che non ce la sta facendo, e si offre di riprovare — perche'
            * restare fermi a guardare non e` un'azione.
            */}
          {stuck && connection === ConnectionState.Connecting && (
            <Pressable onPress={onLeave} hitSlop={10}>
              <Text style={styles.connectionAction}>Esci e riprova</Text>
            </Pressable>
          )}
        </View>
      )}

      {/*
        * Il video occupa tutto. I controlli ci galleggiano sopra.
        *
        * Prima la scena era divisa in due: un riquadro col video e, sotto, una
        * barra opaca con un bordo che si prendeva novanta punti di altezza per
        * sempre. Su un telefono sono tanti, e sono sottratti all'unica cosa per
        * cui si e` aperta l'app — la faccia dell'altra persona.
        */}
      <View style={styles.stage}>
        {remote.length > 0 ? (
          remote.map((track) => (
            <VideoTrack
              key={track.publication!.trackSid}
              trackRef={track}
              style={styles.video}
            />
          ))
        ) : (
          <View style={[styles.video, styles.centered]}>
            {/*
              * Telecamera spenta: un cerchio con l'iniziale, non una frase.
              *
              * Il nero con del testo sopra si legge come un errore. Un cerchio
              * grande col nome dice «questa persona c'e`, semplicemente non si
              * vede», che e` la verita`. La frase resta sotto, piu` piccola,
              * perche' distinguere «non e` ancora entrato» da «e` qui col video
              * spento» serve: chiedono cose opposte.
              */}
            {/*
              * La foto, se c'e`. L'iniziale solo quando non c'e`.
              *
              * A telecamera spenta si guarda comunque quel cerchio per tutta
              * la seduta: un volto tiene compagnia, una lettera no. E chi
              * spegne la telecamera non sta sparendo — sta solo scegliendo di
              * non mostrare la stanza in cui si trova.
              */}
            {otherAvatarUrl ? (
              <Image source={{ uri: otherAvatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {otherName.trim().slice(0, 1).toUpperCase() || '·'}
                </Text>
              </View>
            )}
            <Text style={styles.waiting}>
              {someoneElseHere
                ? `${otherName} ha la telecamera spenta`
                : `In attesa di ${otherName}…`}
            </Text>
          </View>
        )}

        {/* Il nome di chi si sta guardando, e se e` muto. Senza, un riquadro
            non dice chi hai davanti ne` se ti sente. */}
        <View style={[styles.nameTag, { bottom: insets.bottom + 108 }]}>
          <Text style={styles.nameTagText} numberOfLines={1}>
            {otherName}
          </Text>
          {someoneElseHere && remoteMuted && (
            <Text style={styles.nameTagMuted}>muto</Text>
          )}
        </View>

        {/* La propria immagine piccola, in un angolo: serve a controllarsi, non
            a guardarsi. Sotto, mai sopra, la persona con cui si parla. */}
        {local && (
          /*
           * Girare la fotocamera si fa **sulla propria immagine**.
           *
           * Era un pulsante nella testata e una voce nel menu: due posti in cui
           * nessuno lo cerca. Il gesto standard — Meet, WhatsApp, la fotocamera
           * del telefono — e` toccare l'anteprima di se stessi, perche' e` li'
           * che si guarda quando ci si accorge di essere inquadrati male.
           *
           * Il piccolo simbolo nell'angolo dice che si puo' toccare: senza,
           * resterebbe una funzione che si scopre per caso.
           */
          <Pressable
            onPress={() => void flipCamera()}
            accessibilityRole="button"
            accessibilityLabel="Gira la fotocamera"
            style={[styles.selfTile, { bottom: insets.bottom + 108 }]}
          >
            <VideoTrack trackRef={local} style={styles.video} />
            <View style={styles.selfFlip}>
              <Icon name="flip" size={16} color="#fff" />
            </View>
          </Pressable>
        )}
      </View>

      {/*
        * Testata leggera: uscire e il nome della sessione, niente altro.
        * Galleggia sul video invece di occupare una fascia propria.
        */}
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        {/*
          * La freccia riduce, non chiude.
          *
          * Chi tocca «indietro» durante una sessione vuole quasi sempre
          * guardare qualcosa nell'app, non riagganciare — e la chiusura per
          * sbaglio di una seduta in corso e` il danno peggiore possibile qui.
          * Per chiudere c'e` il pulsante rosso, che si preme di proposito.
          */}
        <RoundButton
          icon="back"
          label="Torna all’app, la sessione continua"
          onPress={onMinimize ?? onLeave}
        />
        <View style={styles.titlePill}>
          <Text style={styles.titleText} numberOfLines={1}>
            {otherName}
          </Text>
        </View>
        {/*
          * Da dove esce l'audio, a portata di pollice.
          *
          * Si cambia a meta` sessione — entra qualcuno nella stanza e si passa
          * alle cuffie — cioe` nel momento in cui non si puo` andare a
          * cercarlo nelle impostazioni del telefono. Sta qui, dov'era la
          * rotazione della fotocamera prima che tornasse sulla propria
          * immagine.
          */}
        <RoundButton
          icon="volumeUp"
          label="Da dove esce l’audio"
          onPress={() => setAudioOpen(true)}
        />
      </View>

      <View style={[styles.overlayTop, { top: insets.top + 60 }]}>
        <AiNotesConsentPanel bookingId={bookingId} canActivate={viewerIsCoach} />
        {shareError && (
          <Text style={styles.shareError} accessibilityLiveRegion="polite">
            {shareError}
          </Text>
        )}
      </View>

      {/*
        * Una sola fila di pulsanti tondi, e il rosso separato da un filo.
        *
        * Le icone si riconoscono, le parole si leggono: in chiamata si ha il
        * tempo per la prima cosa e non per la seconda. Il rosso sta dall'altra
        * parte del divisore perche' e` l'unico gesto irreversibile della
        * schermata, e non deve trovarsi sotto il pollice per sbaglio.
        */}
      <View style={[styles.dock, { bottom: insets.bottom + 12 }]}>
        <Control
          icon={isCameraEnabled ? 'videocam' : 'videocamOff'}
          label="Telecamera"
          active={isCameraEnabled}
          onPress={() => localParticipant.setCameraEnabled(!isCameraEnabled)}
        />
        <Control
          icon={isMicrophoneEnabled ? 'mic' : 'micOff'}
          label="Microfono"
          active={isMicrophoneEnabled}
          onPress={() =>
            localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
          }
        />
        <Control
          icon="present"
          label="Condividi lo schermo"
          active={sharing}
          onPress={toggleScreenShare}
        />
        <Control
          icon="more"
          label="Altre azioni"
          active={false}
          onPress={() => setMenuOpen(true)}
        />

        <View style={styles.dockDivider} />

        <Pressable
          onPress={onLeave}
          accessibilityRole="button"
          accessibilityLabel="Chiudi la chiamata"
          style={({ pressed }) => [styles.hangup, pressed && styles.pressed]}
        >
          <Icon name="callEnd" size={24} color="#fff" />
        </Pressable>
      </View>

      {/*
        * Le azioni rare dietro «altro», come fanno tutte le app di chiamata:
        * stanno nella stessa schermata ma non contendono spazio a cio` che si
        * usa di continuo.
        */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                void inviteGuest();
              }}
              accessibilityRole="button"
              style={({ pressed }) => [styles.sheetItem, pressed && styles.pressed]}
            >
              <Icon name="personAdd" size={22} color={theme.hi} />
              <Text style={styles.sheetText}>Invita un ospite</Text>
            </Pressable>
            {/* «Gira la fotocamera» non e` piu` qui: si tocca la propria
                immagine, dov'e` naturale cercarlo. E l'uscita audio sta in
                alto, perche' si cambia mentre si parla. */}
          </View>
        </Pressable>
      </Modal>

      <AudioOutputPicker
        visible={audioOpen}
        onClose={() => setAudioOpen(false)}
      />
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
/**
 * Un controllo della barra.
 *
 * L'icona porta il significato, l'etichetta accessibile porta la parola: chi
 * vede riconosce, chi usa lo screen reader sente una frase intera. Lo stato
 * non e` affidato al solo colore — l'icona stessa cambia (microfono barrato,
 * telecamera barrata), perche' un rosso e un grigio sono lo stesso grigio per
 * molte persone.
 */
function Control({
  icon,
  label,
  active,
  onPress,
}: {
  icon: IconName;
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
      accessibilityHint={
        active ? 'Attivo, tocca per disattivare' : 'Disattivo, tocca per attivare'
      }
      style={({ pressed }) => [
        styles.control,
        !active && styles.controlOff,
        pressed && styles.pressed,
      ]}
    >
      <Icon name={icon} size={22} color={active ? theme.hi : '#fff'} />
    </Pressable>
  );
}

/** Il pulsante tondo della testata: solo icona, su fondo semitrasparente. */
function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
    >
      <Icon name={icon} size={22} color={theme.hi} />
    </Pressable>
  );
}

const createStyles = (theme: Palette) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.ink },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16 },
  connecting: { color: theme.mid },
  error: { color: theme.red2, textAlign: 'center', paddingHorizontal: 32 },
  stage: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },

  video: { flex: 1 },
  waiting: { color: theme.mid, fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  selfTile: {
    position: 'absolute',
    right: 12,
    width: 104,
    height: 150,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    // Su Android un elemento sovrapposto riceve i tocchi solo se e` anche
    // sollevato: senza, il video coprirebbe il gesto.
    elevation: 6,
    zIndex: 6,
  },
  miniBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderRadius: 18,
    backgroundColor: theme.ink2,
    borderWidth: 1,
    borderColor: theme.line,
    // Galleggia sopra l'elenco, e deve anche ricevere i tocchi.
    elevation: 12,
    zIndex: 20,
  },
  miniVideo: {
    width: 46,
    height: 46,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  miniText: { flex: 1, gap: 1 },
  miniTitle: { color: theme.hi, fontSize: 14, fontWeight: '700' },
  miniHint: { color: theme.mid, fontSize: 12 },
  miniButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
  },
  miniEnd: { backgroundColor: theme.red },
  selfFlip: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  nameTag: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.55)',
    maxWidth: 180,
  },
  nameTagText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  avatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: { color: theme.hi, fontSize: 44, fontWeight: '700' },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: theme.ink2,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 10,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 56,
    paddingHorizontal: 22,
  },
  sheetText: { color: theme.hi, fontSize: 16 },
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    backgroundColor: 'rgba(225,29,42,0.92)',
    paddingTop: 44,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  connectionText: { color: '#fff', fontSize: 12, textAlign: 'center', fontWeight: '600' },
  connectionAction: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    textDecorationLine: 'underline',
    paddingTop: 6,
  },
  shareError: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center',
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(225,29,42,0.9)',
  },
  dock: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(20,20,26,0.82)',
    // Vedi SessionsScreen: senza elevation il tocco va a cio' che sta sotto.
    elevation: 8,
    zIndex: 10,
  },
  dockDivider: { width: 1, height: 26, backgroundColor: 'rgba(255,255,255,0.22)', marginHorizontal: 2 },
  topBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    elevation: 8,
    zIndex: 10,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20,20,26,0.72)',
  },
  titlePill: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(20,20,26,0.72)',
  },
  titleText: { color: theme.hi, fontSize: 14, fontWeight: '600' },
  // Sotto la testata e non sopra la barra: in basso si scontrerebbe col
  // riquadro di sé stessi, e un indicatore di registrazione lo si cerca in
  // alto — è lì che il sistema mette i suoi.
  overlayTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    elevation: 6,
    zIndex: 8,
  },
  // 48 di lato: la soglia sotto la quale un bersaglio non si centra col
  // pollice mentre si parla e si guarda altrove.
  control: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  // Spento = riempito, come in tutte le app di chiamata: e` lo stato
  // anomalo, e deve saltare all'occhio piu` di quello normale.
  controlOff: { backgroundColor: '#5b5b66' },
  /*
   * Parole, non icone.
   *
   * Il font delle icone non si disegnava — i controlli erano cerchi vuoti — e
   * dopo due tentativi di caricarlo ho smesso: un'icona invisibile è peggio di
   * una parola corta. «Micro», «Video», «Cond.» si leggono sempre, in
   * qualunque tema e su qualunque dispositivo.
   */
  controlText: { color: theme.hi, fontSize: 12, fontWeight: '700' },
  controlTextOff: { color: '#fff' },
  roundGlyph: { color: theme.hi, fontSize: 20, fontWeight: '700' },
  hangupText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  nameTagMuted: { color: '#fff', fontSize: 11, fontWeight: '700' },
  pressed: { opacity: 0.85 },
  hangup: {
    width: 58,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondary: {
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  secondaryText: { color: theme.hi },
});
