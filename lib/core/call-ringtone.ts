/**
 * La suoneria della chiamata in arrivo.
 *
 * È sintetizzata con Web Audio invece di essere un file: un mp3 andrebbe
 * scaricato prima di poter suonare, e il momento in cui serve è esattamente
 * quello in cui non c'è tempo. Due toni alternati, la cadenza del telefono
 * di casa — si riconosce senza doverla imparare.
 *
 * Il vincolo vero non è il suono, è il permesso: i browser tengono
 * l'`AudioContext` sospeso finché la persona non ha interagito con la pagina,
 * quindi la riproduzione può essere legittimamente rifiutata. Qui il rifiuto
 * è un esito previsto e silenzioso, non un errore: il popup resta comunque
 * visibile e la chiamata si può accettare lo stesso.
 */

/** Le due frequenze del doppio tono, in hertz. */
const TONE_HZ = [440, 480] as const;

/** Squillo, pausa: la cadenza che rende un suono «una chiamata». */
const RING_MS = 1_400;
const PAUSE_MS = 2_600;

/** Volume di picco: presente ma non aggressivo, ci si lavora dentro. */
const PEAK_GAIN = 0.18;

/** Vibrazione su mobile, in coppia con lo squillo. */
const VIBRATION_PATTERN = [500, 300, 500, 2_300];

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export type Ringtone = {
  /** Ferma il suono e la vibrazione. Chiamabile più volte senza danno. */
  stop: () => void;
};

/**
 * Fa partire la suoneria finché non si chiama `stop()`.
 *
 * Restituisce sempre un oggetto valido: se l'audio non è disponibile o è
 * bloccato, `stop()` esiste comunque e non fa nulla. Chi chiama non deve
 * gestire il caso «niente suono» con un ramo a parte.
 */
export function startRingtone(): Ringtone {
  const Ctor = audioContextCtor();
  let stopped = false;
  let context: AudioContext | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stopVibration = () => {
    try {
      navigator.vibrate?.(0);
    } catch {
      // Vibrazione non supportata: non è un problema da riportare.
    }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    stopVibration();
    // `close()` interrompe qualunque nodo ancora in coda, senza doverli
    // rincorrere uno per uno.
    context?.close().catch(() => {});
    context = null;
  };

  if (!Ctor) return { stop };

  try {
    context = new Ctor();
  } catch {
    return { stop };
  }

  const ringOnce = () => {
    if (stopped || !context) return;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.connect(context.destination);
    // Attacco e rilascio morbidi: un'onda che parte e finisce di netto
    // produce un click, che è il rumore che fa sembrare rotta una web app.
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, now + 0.05);
    gain.gain.setValueAtTime(PEAK_GAIN, now + RING_MS / 1000 - 0.08);
    gain.gain.linearRampToValueAtTime(0, now + RING_MS / 1000);

    for (const hz of TONE_HZ) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(hz, now);
      oscillator.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + RING_MS / 1000);
    }

    try {
      navigator.vibrate?.(VIBRATION_PATTERN);
    } catch {
      // Come sopra: opzionale per definizione.
    }

    timer = setTimeout(ringOnce, RING_MS + PAUSE_MS);
  };

  // Il contesto nasce sospeso finché non c'è stata un'interazione. Si prova a
  // riprenderlo; se il browser dice di no, resta il popup e basta.
  const begin = () => {
    if (stopped || !context) return;
    ringOnce();
  };

  if (context.state === 'suspended') {
    context.resume().then(begin, () => {
      /* audio bloccato: la chiamata resta visibile, e va bene così */
    });
  } else {
    begin();
  }

  return { stop };
}
