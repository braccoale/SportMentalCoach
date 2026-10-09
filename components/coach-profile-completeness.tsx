'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, CircleDot } from 'lucide-react';
import {
  COMPLETENESS_LEVEL_LABEL,
  type CompletenessItem,
  type ProfileCompleteness,
} from '@/lib/core/coach-profile/completeness';
import { targetForItem } from '@/lib/core/coach-profile/sections';

const LEVEL_TONE: Record<string, string> = {
  base: 'bg-gray-100 text-gray-700',
  buono: 'bg-amber-100 text-amber-800',
  ottimo: 'bg-emerald-100 text-emerald-800',
  completo: 'bg-emerald-600 text-white',
};

function Points({ item }: { item: CompletenessItem }) {
  const missing = Math.round(item.weight - item.earned);
  return (
    <span className="shrink-0 text-xs font-medium text-gray-500">
      {item.state === 'done' ? `${item.weight}/${item.weight}` : `+${missing} punti`}
    </span>
  );
}

/**
 * «Quanto è completo il tuo profilo», in versione sottile: la percentuale, il
 * livello e la barra in una riga, con «Cosa manca» che apre i passi da fare. Ogni
 * passo porta alla sezione e al campo giusti (`onNavigate`), oppure a un'altra
 * pagina (servizi e orari). I motivi sono quelli che il prodotto fa davvero:
 * nessun numero sulle conseguenze che non abbiamo misurato.
 */
export function CoachProfileCompleteness({
  completeness,
  onNavigate,
}: {
  completeness: ProfileCompleteness;
  onNavigate: (itemKey: string) => void;
}) {
  const { score, level, nextSteps } = completeness;
  const [open, setOpen] = useState(false);

  return (
    <section aria-labelledby="completezza-profilo" className="rounded-xl border border-gray-200 bg-white px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="completezza-profilo" className="text-sm font-semibold text-gray-900">
          Completezza del profilo
        </h2>
        <span className="text-xl font-bold tabular-nums text-gray-900">{score}%</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${LEVEL_TONE[level]}`}>
          {COMPLETENESS_LEVEL_LABEL[level]}
        </span>
        <div
          className="order-last h-2 w-full overflow-hidden rounded-full bg-gray-100 sm:order-none sm:ml-1 sm:w-auto sm:flex-1"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Completezza del profilo"
        >
          <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${score}%` }} />
        </div>
        {nextSteps.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="cosa-manca"
            className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline sm:ml-0"
          >
            Cosa manca ({nextSteps.length})
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
          </button>
        ) : (
          <span className="ml-auto text-sm font-medium text-emerald-800 sm:ml-0">Profilo completo</span>
        )}
      </div>

      {open && nextSteps.length > 0 && (
        <div id="cosa-manca" className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500">
            Gli atleti filtrano per sport, specialità, livello e lingua: un campo vuoto significa non comparire in
            quei risultati.
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {nextSteps.map((item) => {
              const target = targetForItem(item.key);
              const body = (
                <>
                  <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-gray-900">{item.label}</span>
                      <Points item={item} />
                    </span>
                    <span className="mt-0.5 block text-sm text-gray-700">{item.hint}</span>
                  </span>
                </>
              );
              const cls =
                'flex w-full items-start gap-3 rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/40';
              return (
                <li key={item.key}>
                  {target && 'href' in target ? (
                    <Link href={target.href} className={cls}>
                      {body}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => onNavigate(item.key)} className={cls}>
                      {body}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
