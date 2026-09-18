'use client';

import { Button } from '@/components/ui/button';
import type { ComponentProps } from 'react';

/**
 * La CTA nella Panoramica non apre un secondo form di creazione sessione —
 * quello vive già nella tab Sessioni. Clicca semplicemente il pulsante di
 * quella tab in `CourseTabs` (identificato da `data-tab-key`), così l'unico
 * form di creazione resta uno solo.
 */
export function JumpToTabButton({
  targetKey,
  ...props
}: { targetKey: string } & ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      onClick={() => {
        const target = document.querySelector<HTMLButtonElement>(`[data-tab-key="${targetKey}"]`);
        target?.click();
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
    />
  );
}
