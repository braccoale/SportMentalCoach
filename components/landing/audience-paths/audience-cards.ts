import {
  Award,
  BarChart3,
  CalendarCheck,
  ClipboardList,
  FileText,
  Flame,
  Gauge,
  GraduationCap,
  HeartHandshake,
  LineChart,
  Network,
  Rocket,
  ShieldCheck,
  Sliders,
  Sprout,
  Target,
  TrendingUp,
  UserCheck,
  Users,
  Video,
  type LucideIcon,
} from 'lucide-react';

export type AudienceCta =
  | { kind: 'link'; href: string }
  | { kind: 'contact' };

export type AudienceBenefit = {
  icon: LucideIcon;
  label: string;
};

export type AudienceCard = {
  id: string;
  /** Small uppercase eyebrow, e.g. "PER ATLETI". */
  label: string;
  /** Wordmark shown instead of/above the eyebrow — only the Academy card uses it. */
  brand?: string;
  /** First line of the headline — rendered in the high-contrast tone. */
  headlineLead: string;
  /** Second line — rendered in the red accent. */
  headlineEmphasis: string;
  description: string;
  benefits: AudienceBenefit[];
  ctaLabel: string;
  cta: AudienceCta;
  image: {
    /** Path under /public. Kept separate from copy so it's a one-line swap. */
    src: string;
    alt: string;
    /** CSS object-position for the crop. */
    position: string;
  };
  /** Foto luminosa: velo chiaro e testo scuro, invece del velo scuro. */
  tone?: 'dark' | 'light';
};

/**
 * The five KaiPai audiences. Copy is Italian and hardcoded, matching the rest
 * of `app/(marketing)/page.tsx` (no next-intl catalogue exists for the
 * landing yet — see CLAUDE.md on staying next-intl-ready once one lands).
 *
 * Images are existing on-brand assets in /public — one-line swaps here.
 */
export const AUDIENCE_CARDS: AudienceCard[] = [
  {
    id: 'athletes',
    label: 'PER ATLETI',
    headlineLead: 'Più forte nella testa.',
    headlineEmphasis: 'Più lontano nel tuo sport.',
    description:
      'Lavora su concentrazione, pressione, motivazione e routine pre-gara con il supporto di un mental coach.',
    benefits: [
      { icon: Target, label: 'Più concentrazione' },
      { icon: Gauge, label: 'Gestione della pressione' },
      { icon: Flame, label: 'Maggiore motivazione' },
      { icon: TrendingUp, label: 'Progressi nel tempo' },
    ],
    ctaLabel: 'Trova il tuo coach',
    cta: { kind: 'link', href: '/coaches' },
    image: {
      src: '/landing/audience/percorso-athlete.webp',
      alt: 'Giovane atleta in campo al tramonto, sguardo verso il cielo',
      position: '78% 30%',
    },
  },
  {
    id: 'families',
    label: 'PER FAMIGLIE',
    headlineLead: 'Sostieni il loro talento.',
    headlineEmphasis: 'Con la giusta guida.',
    description:
      'Aiuta i tuoi figli a crescere nello sport con un supporto mentale qualificato, in un ambiente sicuro e adatto alla loro età.',
    benefits: [
      { icon: ShieldCheck, label: 'Coach verificati' },
      { icon: Sprout, label: "Percorso adatto all'età" },
      { icon: HeartHandshake, label: 'Più fiducia e serenità' },
      { icon: Users, label: 'Supporto anche ai genitori' },
    ],
    ctaLabel: 'Scopri di più',
    cta: { kind: 'link', href: '/famiglie' },
    tone: 'light',
    image: {
      src: '/landing/audience/percorso-families.webp',
      alt: 'Madre e figlio sorridenti a bordo campo, luce calda',
      position: '80% 60%',
    },
  },
  {
    id: 'coaches',
    label: 'PER COACH',
    headlineLead: 'Tutto il tuo lavoro,',
    headlineEmphasis: 'in un unico spazio.',
    description:
      'Gestisci atleti, calendario, prenotazioni, videochiamate, note e storico del percorso senza avere il lavoro sparso tra più strumenti.',
    benefits: [
      { icon: CalendarCheck, label: 'Calendario e prenotazioni' },
      { icon: Video, label: 'Videochiamate integrate' },
      { icon: FileText, label: 'Note e report AI' },
      { icon: LineChart, label: 'Monitoraggio dei progressi' },
      { icon: Rocket, label: 'Più visibilità e nuove opportunità' },
    ],
    ctaLabel: 'Unisciti come coach',
    cta: { kind: 'link', href: '/sign-up' },
    image: {
      src: '/landing/audience/percorso-coach.webp',
      alt: 'Allenatore con il cappellino a bordo campo, braccia conserte',
      position: '78% 25%',
    },
  },
  {
    id: 'academy',
    label: 'PER FUTURI COACH E PROFESSIONISTI',
    brand: 'KaiPai Academy',
    headlineLead: 'Formazione che lascia',
    headlineEmphasis: 'il segno.',
    description:
      'Percorsi formativi dedicati al mental coaching sportivo, con contenuti pratici, mentor esperti e una community di professionisti.',
    benefits: [
      { icon: GraduationCap, label: 'Corsi online e in presenza' },
      { icon: Award, label: 'Attestato di completamento' },
      { icon: UserCheck, label: 'Mentor esperti' },
      { icon: Network, label: 'Community e networking' },
    ],
    ctaLabel: "Scopri l'Academy",
    cta: { kind: 'link', href: '#academy' },
    tone: 'light',
    image: {
      src: '/landing/audience/percorso-academy-2.webp',
      alt: 'Scrivania luminosa con laptop, quaderno e borraccia, campo sullo sfondo',
      position: '70% 70%',
    },
  },
  {
    id: 'teams',
    label: 'PER SQUADRE E ACADEMY',
    headlineLead: 'Squadre più unite.',
    headlineEmphasis: 'Obiettivi più grandi.',
    description:
      'Soluzioni dedicate per società sportive, squadre e academy che vogliono investire sulla crescita mentale dei propri atleti.',
    benefits: [
      { icon: Users, label: 'Percorsi per squadre e gruppi' },
      { icon: BarChart3, label: 'Report e analisi dei progressi' },
      { icon: ClipboardList, label: 'Supporto a tecnici e staff' },
      { icon: Sliders, label: 'Programmi su misura' },
    ],
    ctaLabel: 'Richiedi una demo',
    cta: { kind: 'contact' },
    image: {
      src: '/landing/audience/percorso-teams.webp',
      alt: 'Squadra abbracciata in cerchio sotto le luci dello stadio',
      position: '68% 80%',
    },
  },
];
