import type { CSSProperties } from 'react';
import type { SlotPresentation } from '@/lib/core/availability/validation';

/**
 * I colori delle voci nell'elenco orari.
 *
 * Arancione e rosso non sono due gradi dello stesso problema: l'arancione
 * dice «si può, accorciando», il rosso dice «non si può». Confonderli
 * riporterebbe al difetto di partenza, dove tutto era rosso e mezzo di quel
 * rosso era falso.
 *
 * Le classi Tailwind ci sono per coerenza col resto, ma dentro un `<option>`
 * molti browser le ignorano: lo stile in linea è quello che regge davvero.
 * Entrambi, quindi, invece di scegliere e scoprirlo su un dispositivo solo.
 */
export const SLOT_TONE_CLASS: Record<SlotPresentation['tone'], string | undefined> =
  {
    free: undefined,
    tight: 'text-amber-600',
    occupied: 'text-red-600',
  };

export const SLOT_TONE_STYLE: Record<
  SlotPresentation['tone'],
  CSSProperties | undefined
> = {
  free: undefined,
  tight: { color: '#d97706' },
  occupied: { color: '#dc2626' },
};
