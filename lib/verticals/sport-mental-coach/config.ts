import type { VerticalConfig } from '@/lib/core/config/types';
import { sports, specialties, levels } from './taxonomies';
import { copyIt } from './copy.it';

/**
 * SportMentalCoach vertical configuration. Implements the core
 * `VerticalConfig` contract and is the single object core consumes for this
 * deployment. Role keys map to seeded rows in the `roles` table
 * (`athlete`, `coach`, `club`, `admin`).
 */
export const sportMentalCoachConfig: VerticalConfig = {
  id: 'sport-mental-coach',
  locale: 'it',
  roles: {
    client: { key: 'athlete', label: 'Atleta' },
    provider: { key: 'coach', label: 'Coach' },
    organization: { key: 'club', label: 'Club' },
    admin: { key: 'admin', label: 'Amministratore' },
  },
  taxonomies: {
    categories: sports,
    specialties,
    levels,
  },
  copy: copyIt,
};
