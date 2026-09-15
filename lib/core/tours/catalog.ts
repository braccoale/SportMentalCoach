export type TourStep = {
  /** Selettore CSS del bersaglio — `[data-tour="..."]` quasi sempre. */
  target: string;
  title: string;
  body: string;
  /**
   * Questo bersaglio può richiedere più tempo per comparire (es. dietro un
   * flusso di scelta camera/microfono prima di entrare in una
   * videochiamata): non basta un breve tentativo prima di rinunciare. Deve
   * restare `true` solo per i passi il cui bersaglio dipende da un'azione
   * dell'utente esterna al tour stesso — non va impostato "per sicurezza" su
   * altri step, perché fa aspettare fino a 90s prima di rinunciare invece
   * dei ~1.5s normali, anche quando il bersaglio semplicemente non esiste in
   * quella pagina (es. un riepilogo già approvato).
   */
  slowTarget?: boolean;
};

export type TourKey =
  | 'coach_dashboard_intro'
  | 'coach_create_appointment'
  | 'coach_video_call'
  | 'coach_ai_report_review'
  | 'athlete_dashboard_intro'
  | 'athlete_booking'
  | 'athlete_video_call';

export const TOUR_CATALOG: Record<
  TourKey,
  { role: 'coach' | 'athlete'; steps: TourStep[] }
> = {
  coach_dashboard_intro: {
    role: 'coach',
    steps: [
      {
        target: '[data-tour="coach-new-appointment"]',
        title: 'Crea il tuo primo appuntamento',
        body: 'Da qui prenoti una sessione con un atleta che segui già, scegliendo giorno e ora fra quelli che hai reso disponibili.',
      },
      {
        target: '#richieste-in-attesa',
        title: 'Le richieste da valutare',
        body: 'Ogni atleta che ti chiede una sessione compare qui, in attesa che tu accetti o rifiuti.',
      },
    ],
  },
  coach_create_appointment: {
    role: 'coach',
    steps: [
      {
        target: '[data-tour="coach-booking-datetime"]',
        title: 'Scegli giorno e ora',
        body: 'Solo i giorni e gli orari che hai impostato come disponibile compaiono qui — nessun rischio di doppie prenotazioni.',
      },
    ],
  },
  coach_video_call: {
    role: 'coach',
    steps: [
      {
        target: '[data-tour="coach-start-transcription"]',
        title: 'Avvia la trascrizione',
        body: 'Premi qui a inizio sessione per registrare e ottenere il riepilogo automatico da validare dopo la call.',
        slowTarget: true,
      },
    ],
  },
  coach_ai_report_review: {
    role: 'coach',
    steps: [
      {
        target: '[data-tour="approve-report"]',
        title: 'Approva il riepilogo',
        body: "Controlla che il riepilogo generato sia corretto, poi approvalo: solo da qui in poi l'atleta può vederlo.",
      },
      {
        target: '[data-tour="regenerate-report"]',
        title: 'Non ti convince?',
        body: 'Puoi rigenerarlo quante volte vuoi prima di approvarlo.',
      },
    ],
  },
  athlete_dashboard_intro: {
    role: 'athlete',
    steps: [
      {
        target: '[data-tour="find-a-coach"]',
        title: 'Trova il tuo coach',
        body: 'Da qui sfogli i coach disponibili e scegli con chi iniziare il tuo percorso.',
      },
      {
        target: '[data-tour="my-sessions"]',
        title: 'Le tue sessioni',
        body: 'Ogni sessione prenotata, in attesa o già svolta, la trovi qui.',
      },
    ],
  },
  athlete_booking: {
    role: 'athlete',
    steps: [
      {
        target: '[data-tour="athlete-booking-calendar"]',
        title: 'Scegli quando iniziare',
        body: 'Tocca un giorno per vedere gli orari liberi di questo coach, poi scegli quello che preferisci.',
      },
    ],
  },
  athlete_video_call: {
    role: 'athlete',
    steps: [
      {
        target: '.lk-control-bar',
        title: 'Microfono e videocamera',
        body: 'Da qui puoi disattivare temporaneamente audio o video durante la sessione.',
        slowTarget: true,
      },
    ],
  },
};
