'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { DemoRequestButton } from '@/components/landing/demo-request-button';
import { filterFaqs, searchTerms } from '@/lib/core/support/faq-search';

export type SupportFaqItem = {
  q: string;
  a: string;
  link?: { href: string; label: string };
};

/**
 * Le frasi arrivano **già pronte dal server**. Al browser passano solo alcuni
 * gruppi di messaggi (vedi `lib/i18n/client-messages.ts`) e `Support` non è tra
 * questi: un `useTranslations('Support')` qui dentro mostrava i codici
 * (`Support.searchPlaceholder`) invece del testo. I due segnaposto, `{query}`
 * e `{count}`, si sostituiscono qui.
 */
export type SupportFaqLabels = {
  title: string;
  forYou: string;
  searchLabel: string;
  searchPlaceholder: string;
  clearSearch: string;
  /** Il pulsante in alto: «Supporto». */
  contactCta: string;
  /** In fondo e nel pannello «nessun risultato»: «Scrivici». */
  contact: string;
  notFound: string;
  /** Contiene `{query}`. */
  noResults: string;
  noResultsHint: string;
  resultsNone: string;
  resultsOne: string;
  /** Contiene `{count}`. */
  resultsMany: string;
};

export type SupportFaqGroup = {
  key: string;
  label: string;
  /** Il gruppo che riguarda chi è entrato. */
  isMine: boolean;
  items: SupportFaqItem[];
};

/**
 * Il Supporto: ricerca, schede per argomento, domande, e il modo di scriverci.
 * Le domande sono le stesse delle pagine pubbliche (arrivano dal server): qui
 * si filtrano soltanto. Il pulsante «Contatta il supporto» sta in alto, sempre
 * visibile, e riusa il modulo contatti già in uso: nessun secondo canale.
 */
export function SupportFaq({
  groups,
  labels,
}: {
  groups: SupportFaqGroup[];
  labels: SupportFaqLabels;
}) {
  const [query, setQuery] = useState('');

  const searching = searchTerms(query).length > 0;
  const visible = useMemo(
    () =>
      groups
        .map((group) => ({ ...group, items: filterFaqs(query, group.items) }))
        .filter((group) => group.items.length > 0),
    [groups, query]
  );
  const total = visible.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      {/* Ricerca e contatto: in cima, prima di tutto il resto. */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={labels.searchPlaceholder}
            aria-label={labels.searchLabel}
            className="h-11 w-full rounded-full border border-gray-200 bg-white pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus-visible:border-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/10"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={labels.clearSearch}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        <DemoRequestButton label={labels.contactCta} className="!px-5 !py-2.5 text-sm" />
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {searching
          ? total === 0
            ? labels.resultsNone
            : total === 1
              ? labels.resultsOne
              : labels.resultsMany.replace('{count}', String(total))
          : ''}
      </p>

      {visible.length > 0 && (
        <nav className="mt-4 flex flex-wrap gap-2" aria-label={labels.title}>
          {visible.map((group) => (
            <Link
              key={group.key}
              href={`#${group.key}`}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-950"
            >
              {group.label}
              {group.isMine ? ` · ${labels.forYou}` : ''}
            </Link>
          ))}
        </nav>
      )}

      {visible.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <p className="font-semibold text-gray-900">
            {labels.noResults.replace('{query}', query.trim())}
          </p>
          <p className="mt-1 text-sm text-gray-600">{labels.noResultsHint}</p>
          <div className="mt-4 flex justify-center">
            <DemoRequestButton label={labels.contact} className="!px-5 !py-2.5 text-sm" />
          </div>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-10">
          {visible.map((group) => (
            <div key={group.key} id={group.key} className="scroll-mt-24">
              <h2 className="text-lg font-semibold text-gray-900">{group.label}</h2>
              <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                {group.items.map((faq) => (
                  <details key={faq.q} className="group px-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left text-sm font-semibold text-gray-900 [&::-webkit-details-marker]:hidden">
                      {faq.q}
                      <ChevronDown
                        className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <p className="pb-4 text-sm leading-relaxed text-gray-600">
                      {faq.a}
                      {faq.link ? (
                        <>
                          {' '}
                          <Link
                            href={faq.link.href}
                            className="font-semibold text-gray-900 underline"
                          >
                            {faq.link.label}
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {visible.length > 0 && (
        <div className="mt-12 flex flex-col items-start gap-4 rounded-xl border border-gray-200 bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-semibold text-gray-900">{labels.notFound}</p>
          <DemoRequestButton label={labels.contact} />
        </div>
      )}
    </>
  );
}
