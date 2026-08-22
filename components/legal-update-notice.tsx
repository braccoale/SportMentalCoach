'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * «I documenti legali sono cambiati da quando li hai accettati.»
 *
 * La piattaforma calcolava già l'impronta del testo legale e la registrava
 * insieme a ogni accettazione, e `hasAcceptedCurrentTerms` sapeva già dire se
 * quella in archivio corrispondesse a quella corrente. **Non la chiamava
 * nessuno**: il meccanismo per accorgersi che i Termini erano cambiati esisteva
 * per intero e non era collegato a niente, quindi chi era già iscritto non
 * vedeva mai un avviso.
 *
 * **Perché informa e non blocca.** Un aggiornamento di trasparenza — dire che
 * un riepilogo è scritto da un'intelligenza artificiale — non cambia il
 * contratto: aggiunge una spiegazione dovuta. Sbarrare il prodotto a chi non ha
 * ancora cliccato trasformerebbe un obbligo di informare in un ostatolo, e
 * otterrebbe la cosa che l'obbligo vuole evitare: un clic dato per togliersi di
 * mezzo un cartello, senza leggere niente.
 *
 * Resta però in cima e senza una «x»: chiuderlo richiede di dichiarare di aver
 * letto, e quella dichiarazione viene registrata con la nuova impronta.
 */
export function LegalUpdateNotice({
  action,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    { error: '' }
  );

  return (
    <div
      role="status"
      className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 lg:mx-0 lg:mt-0 lg:mb-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-[16rem] flex-1 leading-relaxed">
          <strong>Abbiamo aggiornato l’Informativa Privacy.</strong> Ora spiega
          come funziona l’intelligenza artificiale che prepara i riepiloghi
          delle sessioni: che cosa fa, che cosa non fa e dove può sbagliare.
        </p>

        <Link
          href="/privacy"
          className="shrink-0 font-semibold underline underline-offset-2 hover:text-amber-950"
        >
          Leggi che cosa è cambiato
        </Link>

        <form action={formAction} className="shrink-0">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Ho letto
          </button>
        </form>
      </div>

      {state?.error && (
        <p className="mt-2 text-xs font-medium text-red-700">{state.error}</p>
      )}
    </div>
  );
}
