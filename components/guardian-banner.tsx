'use client';

import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Clock } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import type { GuardianStatus } from '@/lib/core/guardians';
import type { ActionState } from '@/lib/auth/middleware';

/**
 * Parental-authorisation state for a 15-17 year old athlete, shown at the top
 * of their dashboard. Renders nothing for adults, so the component can be
 * dropped in unconditionally and the age logic stays in one place server-side.
 *
 * The invite form is expanded by default when no guardian has been invited
 * yet: at that point it is the single thing standing between the athlete and
 * using the product, so hiding it behind a button only adds a step.
 */
export function GuardianBanner({
  status,
  action,
}: {
  status: GuardianStatus;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [open, setOpen] = useState(status.kind === 'missing');

  if (status.kind === 'not_required') return null;

  if (status.kind === 'unknown_age') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p>
          Indica la tua data di nascita nel profilo: senza non puoi richiedere
          sessioni.
        </p>
      </div>
    );
  }

  if (status.kind === 'confirmed') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <p>
          Percorso autorizzato da {status.guardianName}. Puoi prenotare le tue
          sessioni.
        </p>
      </div>
    );
  }

  const pending = status.kind === 'pending';

  return (
    <div
      className={`rounded-xl border p-4 ${
        pending
          ? 'border-sky-200 bg-sky-50'
          : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="flex items-start gap-3">
        {pending ? (
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
        ) : (
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        )}
        <div className="flex-1">
          <p
            className={`text-sm font-semibold ${
              pending ? 'text-sky-900' : 'text-amber-900'
            }`}
          >
            {pending
              ? `In attesa della conferma di ${status.guardianName}`
              : 'Serve l’autorizzazione di un genitore o tutore'}
          </p>
          <p
            className={`mt-1 text-sm ${
              pending ? 'text-sky-800' : 'text-amber-800'
            }`}
          >
            {pending ? (
              <>
                Abbiamo scritto a {status.guardianEmail}. Appena autorizza,
                potrai richiedere sessioni. Se l’indirizzo è sbagliato, inviane
                uno nuovo.
              </>
            ) : (
              <>
                Hai {status.age} anni: fino ai 18 il percorso va autorizzato da
                chi esercita la responsabilità genitoriale. Gli mandiamo un
                link, conferma in un minuto e senza registrarsi.
              </>
            )}
          </p>

          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-2 text-sm font-medium text-sky-700 underline hover:text-sky-900"
            >
              Invia a un altro indirizzo
            </button>
          )}

          {open && (
            <ActionForm action={action} className="mt-4 flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    Nome del genitore o tutore
                  </span>
                  <input
                    name="guardianName"
                    required
                    maxLength={200}
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-700">
                    La sua email
                  </span>
                  <input
                    name="guardianEmail"
                    type="email"
                    required
                    className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-700">
                  Che rapporto ha con te{' '}
                  <span className="text-gray-400">(facoltativo)</span>
                </span>
                <input
                  name="relationship"
                  maxLength={60}
                  placeholder="Madre, padre, tutore…"
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 sm:max-w-xs"
                />
              </label>
              <div>
                <button
                  type="submit"
                  className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  {pending ? 'Invia di nuovo' : 'Invia la richiesta'}
                </button>
              </div>
            </ActionForm>
          )}
        </div>
      </div>
    </div>
  );
}
