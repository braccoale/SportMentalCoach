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
  /** Only the coach card gets the extra split layout + dashboard slot when expanded. */
  splitOnExpand?: boolean;
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
      src: '/atleta.png',
      alt: 'Ritratto di un giovane atleta',
      position: '50% 20%',
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
    image: {
      src: '/famiglia.jpg',
      alt: 'Una famiglia di spalle al tramonto',
      position: '50% 40%',
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
      src: '/allenatore.png',
      alt: 'Ritratto di un allenatore con il cappellino',
      position: '55% 25%',
    },
    splitOnExpand: true,
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
    image: {
      src: '/landing/audience/academy.webp',
      alt: 'Mentor KaiPai Academy con un allievo, lavagna tattica',
      position: '50% 15%',
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
      src: '/squadra.jpg',
      alt: 'Squadra giovanile in cerchio con il proprio tecnico, luci dello stadio',
      position: '50% 30%',
    },
  },
];
