/**
 * Le sezioni della pagina del profilo coach e dove si sistema ogni voce della
 * completezza: serve alla barra «cosa manca» per portare al campo giusto, e ai
 * puntini sulle schede per dire in quale sezione c'è ancora qualcosa.
 *
 * Una voce nuova nella completezza senza una destinazione qui non passa i
 * test: altrimenti un suggerimento porterebbe «da nessuna parte».
 */
import type { CompletenessItem } from './completeness';

export type ProfileSectionId = 'presentazione' | 'competenze' | 'account';

export const PROFILE_SECTIONS: { id: ProfileSectionId; label: string }[] = [
  { id: 'presentazione', label: 'Presentazione' },
  { id: 'competenze', label: 'Competenze' },
  { id: 'account', label: 'Account' },
];

type Target = { section: ProfileSectionId; anchor: string } | { href: string };

const TARGETS: Record<string, Target> = {
  photo: { section: 'presentazione', anchor: 'foto-profilo' },
  headline: { section: 'presentazione', anchor: 'headline' },
  bio: { section: 'presentazione', anchor: 'description' },
  video: { section: 'presentazione', anchor: 'video-presentazione' },
  sports: { section: 'competenze', anchor: 'campo-sport' },
  specialties: { section: 'competenze', anchor: 'campo-specializzazioni' },
  levels: { section: 'competenze', anchor: 'campo-livelli' },
  languages: { section: 'competenze', anchor: 'languages' },
  experience: { section: 'competenze', anchor: 'coachSince' },
  certifications: { section: 'competenze', anchor: 'certifications' },
  // Servizi e orari non stanno in questa pagina.
  service: { href: '/dashboard/coach/services' },
  availability: { href: '/dashboard/coach/services' },
};

/** Dove si sistema una voce: una sezione + un campo di questa pagina, oppure un'altra pagina. */
export function targetForItem(key: string): Target | null {
  return TARGETS[key] ?? null;
}

/**
 * Le voci ancora da sistemare (mancanti o a metà) che hanno un campo in questa
 * pagina: i titoli di quei campi si colorano d'arancione, così si capisce dove
 * mettere mano senza dover leggere l'elenco.
 */
export function itemsNeedingAttention(items: Pick<CompletenessItem, 'key' | 'state'>[]): Set<string> {
  const out = new Set<string>();
  for (const item of items) {
    if (item.state === 'done') continue;
    const target = TARGETS[item.key];
    if (target && 'section' in target) out.add(item.key);
  }
  return out;
}

/** Le sezioni in cui c'è ancora qualcosa da completare (per i puntini sulle schede). */
export function sectionsNeedingAttention(items: Pick<CompletenessItem, 'key' | 'state'>[]): Set<ProfileSectionId> {
  const out = new Set<ProfileSectionId>();
  for (const item of items) {
    if (item.state === 'done') continue;
    const target = TARGETS[item.key];
    if (target && 'section' in target) out.add(target.section);
  }
  return out;
}
