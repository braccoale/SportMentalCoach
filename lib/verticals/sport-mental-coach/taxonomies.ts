import type { TaxonomyItem } from '@/lib/core/config/types';

/**
 * Sports offered as listing categories. Keys are stable and persisted on
 * `provider_profiles.categories` / `client_profiles.category`. Labels are
 * Italian (the Phase 1 locale).
 */
export const sports: TaxonomyItem[] = [
  { key: 'football', label: 'Calcio' },
  { key: 'basketball', label: 'Basket' },
  { key: 'volleyball', label: 'Pallavolo' },
  { key: 'tennis', label: 'Tennis' },
  { key: 'swimming', label: 'Nuoto' },
  { key: 'athletics', label: 'Atletica' },
  { key: 'cycling', label: 'Ciclismo' },
  { key: 'martial_arts', label: 'Arti marziali' },
  { key: 'golf', label: 'Golf' },
  { key: 'skiing', label: 'Sci' },
  { key: 'rugby', label: 'Rugby' },
  { key: 'motorsport', label: 'Motori' },
  { key: 'other', label: 'Altro' },
];

/**
 * Mental-coaching focus areas. Keys are persisted on
 * `provider_profiles.specialties`.
 */
export const specialties: TaxonomyItem[] = [
  {
    key: 'performance_anxiety',
    label: 'Ansia da prestazione',
    description: 'Gestione dello stress e dell’ansia prima e durante la gara.',
  },
  {
    key: 'focus_concentration',
    label: 'Focus e concentrazione',
    description: 'Tecniche per mantenere l’attenzione sotto pressione.',
  },
  {
    key: 'motivation',
    label: 'Motivazione',
    description: 'Costruzione e mantenimento della motivazione a lungo termine.',
  },
  {
    key: 'confidence',
    label: 'Autostima e fiducia',
    description: 'Rafforzamento della fiducia nelle proprie capacità.',
  },
  {
    key: 'goal_setting',
    label: 'Definizione degli obiettivi',
    description: 'Pianificazione di obiettivi sportivi misurabili.',
  },
  {
    key: 'injury_recovery',
    label: 'Recupero da infortunio',
    description: 'Supporto mentale nel percorso di riabilitazione.',
  },
  {
    key: 'team_dynamics',
    label: 'Dinamiche di squadra',
    description: 'Comunicazione, ruoli e coesione del gruppo.',
  },
  {
    key: 'pre_competition_routine',
    label: 'Routine pre-gara',
    description: 'Costruzione di routine mentali efficaci.',
  },
  {
    key: 'resilience',
    label: 'Resilienza',
    description: 'Gestione di sconfitte, errori e momenti difficili.',
  },
];

/** Athlete experience levels. Keys are persisted on `client_profiles.level`. */
export const levels: TaxonomyItem[] = [
  { key: 'amateur', label: 'Amatoriale' },
  { key: 'semi_pro', label: 'Semi-professionista' },
  { key: 'pro', label: 'Professionista' },
  { key: 'youth', label: 'Settore giovanile' },
];
