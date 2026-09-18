'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

type Tab = { key: string; label: string; content: React.ReactNode };

/**
 * Interruttore di tab lato client — i pannelli sono già renderizzati dal
 * server e passati come nodi pronti: nessun fetch nel client, solo quale
 * pannello mostrare. Tutti i pannelli restano montati (solo nascosti), così
 * un form compilato in una tab non perde i valori passando a un'altra.
 *
 * La tab iniziale legge `?tab=` dall'URL (se corrisponde a una tab reale):
 * serve ai link esterni (es. "Materiali" da una card sessione nella
 * dashboard) per atterrare sulla tab giusta invece che sempre sulla prima.
 */
export function CourseTabs({ tabs }: { tabs: Tab[] }) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const initialTab = tabs.find((tab) => tab.key === requestedTab)?.key ?? tabs[0]?.key;
  const [active, setActive] = useState(initialTab);

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            data-tab-key={tab.key}
            onClick={() => setActive(tab.key)}
            aria-current={active === tab.key ? 'page' : undefined}
            className={cn(
              'shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              active === tab.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tabs.map((tab) => (
          <div key={tab.key} className={active === tab.key ? '' : 'hidden'}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
