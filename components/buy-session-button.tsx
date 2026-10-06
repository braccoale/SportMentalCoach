'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buySingleSessionAction } from '@/app/(marketplace)/coaches/subscribe-actions';
import { cn } from '@/lib/utils';

/**
 * «Aggiungi una seduta · 100,00 €»: porta al pagamento di UNA seduta con quel
 * coach. Dal browser parte solo lo slug; il prezzo lo rilegge il server dal
 * profilo del coach, quindi il testo qui è informativo e non decide niente.
 */
export function BuySessionButton({
  slug,
  priceLabel,
  label = 'Aggiungi una seduta',
  variant = 'solid',
  showPrice = true,
  className,
}: {
  slug: string;
  priceLabel: string;
  label?: string;
  /** `solid` = pulsante verde pieno; `link` = testo sottolineato dentro una frase. */
  variant?: 'solid' | 'link';
  /** Se il prezzo sta nel testo del pulsante; altrimenti resta solo per i lettori di schermo. */
  showPrice?: boolean;
  className?: string;
}) {
  return (
    <form action={buySingleSessionAction} className={variant === 'solid' ? 'w-full' : undefined}>
      <input type="hidden" name="slug" value={slug} />
      {variant === 'solid' ? (
        <Button
          type="submit"
          className={cn(
            'h-10 w-full gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700',
            className
          )}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {label}
          {showPrice ? ` · ${priceLabel}` : <span className="sr-only"> · {priceLabel}</span>}
        </Button>
      ) : (
        <button
          type="submit"
          className={cn(
            'font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800',
            className
          )}
        >
          {label} · {priceLabel}
        </button>
      )}
    </form>
  );
}
