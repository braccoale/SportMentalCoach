'use client';

import { useState } from 'react';
import { BookMarked } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { MAX_GUIDELINES_LENGTH } from '@/lib/core/ai-session-notes/house-guidelines-policy';
import { saveHouseGuidelinesAction } from '@/app/(dashboard)/dashboard/admin/ai-notes/actions';

/**
 * Le linee guida del metodo KaiPai, scritte qui e non nel codice.
 *
 * Sono il metodo della casa: come si guarda una seduta, che cosa conta, con
 * che tono si scrive. L'academy le farà evolvere, e ogni modifica non deve
 * passare da un deploy.
 *
 * Salvare crea una versione nuova invece di sovrascrivere: il riepilogo di
 * una seduta è stato scritto con una certa versione del metodo, e fra sei
 * mesi deve restare possibile sapere quale.
 */
export function HouseGuidelinesEditor({
  body,
  version,
  updatedAt,
}: {
  body: string;
  version: number | null;
  updatedAt: string | null;
}) {
  const [draft, setDraft] = useState(body);
  const remaining = MAX_GUIDELINES_LENGTH - draft.trim().length;

  return (
    <section className="mt-8" aria-labelledby="house-guidelines">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="house-guidelines"
          className="flex items-center gap-2 text-lg font-semibold text-gray-900"
        >
          <BookMarked className="h-4 w-4 text-violet-600" aria-hidden="true" />
          Linee guida del metodo
        </h2>
        {version !== null && (
          <p className="text-xs text-gray-500">
            Versione {version}
            {updatedAt
              ? ` · aggiornata il ${new Date(updatedAt).toLocaleDateString('it-IT')}`
              : null}
          </p>
        )}
      </div>

      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        Entrano nel prompt di ogni riepilogo: orientano il taglio, gli esempi e
        le parole. Non scavalcano le regole di sicurezza — se una linea guida
        portasse a scrivere qualcosa che la trascrizione non sostiene, vince la
        regola.
      </p>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        Salvare crea una versione nuova e{' '}
        <strong>fa rigenerare le bozze non ancora approvate</strong>: i report
        già approvati restano com’erano, scritti con il metodo di allora.
      </p>

      <ActionForm action={saveHouseGuidelinesAction} className="mt-3">
        <textarea
          name="body"
          rows={10}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_GUIDELINES_LENGTH}
          aria-label="Linee guida del metodo KaiPai"
          placeholder={
            'Per esempio:\n' +
            '- Parti sempre da ciò che ha funzionato, prima di ciò che manca.\n' +
            '- Nomina il corpo quando l’atleta lo nomina: non tradurlo subito in emozione.\n' +
            '- Chiudi con una domanda aperta, mai con un consiglio.'
          }
          className="w-full resize-y rounded-xl border border-gray-200 bg-white p-3 font-mono text-sm leading-6 text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            {remaining >= 0
              ? `${remaining} caratteri disponibili`
              : 'Oltre il limite: accorcia il testo.'}
          </p>
          <Button
            type="submit"
            className="rounded-full"
            disabled={draft.trim() === body.trim() || remaining < 0}
          >
            Salva nuova versione
          </Button>
        </div>
      </ActionForm>
    </section>
  );
}
