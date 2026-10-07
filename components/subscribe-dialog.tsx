'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PlanPicker, type PickerPlan } from '@/components/plan-picker';

/**
 * «Abbonati» sulla scheda del coach: apre i percorsi in una finestra, senza
 * far passare dal profilo. La scelta e il pagamento sono gli stessi del
 * profilo (`PlanPicker` e la sua azione): una sola regola, due ingressi.
 */
export function SubscribeDialog({
  slug,
  coachFirstName,
  plans,
  single,
}: {
  slug: string;
  coachFirstName: string;
  plans: PickerPlan[];
  single?: { priceLabel: string; validityDays: number } | null;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700"
        >
          Abbonati
        </button>
      </DialogTrigger>
      <DialogContent
        className="max-w-5xl rounded-3xl p-6 sm:p-8"
        // Il focus iniziale va al piano già selezionato (il consigliato), non al
        // primo della lista: di default Radix lo dà al primo elemento
        // raggiungibile, e il bordo di «Starter» sembrava la scelta.
        onOpenAutoFocus={(event) => {
          const container = event.target as HTMLElement | null;
          const selected = container?.querySelector<HTMLInputElement>(
            'input[name="planId"]:checked'
          );
          if (selected) {
            event.preventDefault();
            selected.focus();
          }
        }}
      >
        <DialogTitle className="text-xl font-bold sm:text-3xl">
          Percorsi mensili con {coachFirstName}
        </DialogTitle>
        <DialogDescription>
          Un abbonamento mensile con un numero fisso di sedute. Paghi con carta
          e l&apos;importo va direttamente a {coachFirstName}.
        </DialogDescription>
        <PlanPicker
          slug={slug}
          coachFirstName={coachFirstName}
          plans={plans}
          single={single}
          variant="dialog"
        />
      </DialogContent>
    </Dialog>
  );
}

// Esportato per chi vuole riusare il tipo senza importare il picker.
export type { PickerPlan };
