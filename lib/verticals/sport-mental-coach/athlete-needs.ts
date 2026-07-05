export type AthleteNeed = {
  id:
    | 'anxiety'
    | 'injury-return'
    | 'focus'
    | 'motivation'
    | 'pre-game-routine'
    | 'self-confidence';
  title: string;
  description: string;
  selectedTitle: string;
  selectedSubtitle: string;
  iconName:
    | 'pulse'
    | 'shield'
    | 'target'
    | 'flame'
    | 'timer'
    | 'spark';
  specialtyKeys: string[];
};

export const athleteNeeds: AthleteNeed[] = [
  {
    id: 'anxiety',
    title: "Gestire l'ansia",
    description:
      'Per affrontare pressione, paura di sbagliare e tensione prima della gara.',
    selectedTitle: "Coach per gestire l'ansia sportiva",
    selectedSubtitle:
      "Percorsi pensati per atleti che vogliono trasformare pressione, paura dell'errore e tensione pre-gara in lucidita e presenza.",
    iconName: 'pulse',
    specialtyKeys: [
      'performance_anxiety',
      'resilience',
      'pre_competition_routine',
    ],
  },
  {
    id: 'injury-return',
    title: 'Tornare dopo un infortunio',
    description:
      'Per ritrovare fiducia, continuita e sicurezza dopo uno stop.',
    selectedTitle: 'Coach per il rientro dopo un infortunio',
    selectedSubtitle:
      'Supporto mentale per ritrovare fiducia, continuita e sicurezza nel ritorno alla performance.',
    iconName: 'shield',
    specialtyKeys: ['injury_recovery', 'confidence', 'resilience'],
  },
  {
    id: 'focus',
    title: 'Piu concentrazione',
    description:
      'Per restare lucido nei momenti decisivi e migliorare il focus.',
    selectedTitle: 'Coach per migliorare concentrazione e focus',
    selectedSubtitle:
      'Percorsi per atleti che vogliono restare presenti nei momenti chiave e dare continuita alla propria attenzione.',
    iconName: 'target',
    specialtyKeys: ['focus_concentration', 'pre_competition_routine'],
  },
  {
    id: 'motivation',
    title: 'Motivazione',
    description:
      "Per recuperare energia, costanza e voglia di allenarti.",
    selectedTitle: 'Coach per ritrovare motivazione e continuita',
    selectedSubtitle:
      "Un supporto concreto per riaccendere energia mentale, disciplina quotidiana e voglia di crescere nell'allenamento.",
    iconName: 'flame',
    specialtyKeys: ['motivation', 'goal_setting', 'resilience'],
  },
  {
    id: 'pre-game-routine',
    title: 'Routine pre-gara',
    description:
      'Per arrivare alla competizione con una preparazione mentale chiara.',
    selectedTitle: 'Coach per costruire la tua routine pre-gara',
    selectedSubtitle:
      'Lavori mirati per arrivare alla competizione con una preparazione mentale stabile, riconoscibile e ripetibile.',
    iconName: 'timer',
    specialtyKeys: [
      'pre_competition_routine',
      'performance_anxiety',
      'focus_concentration',
    ],
  },
  {
    id: 'self-confidence',
    title: 'Fiducia in me stesso',
    description:
      'Per superare blocchi, insicurezze e paura del giudizio.',
    selectedTitle: 'Coach per rafforzare fiducia e sicurezza',
    selectedSubtitle:
      'Percorsi per superare blocchi interiori, ritrovare sicurezza e giocare con piu presenza nelle proprie qualita.',
    iconName: 'spark',
    specialtyKeys: ['confidence', 'resilience', 'performance_anxiety'],
  },
];
