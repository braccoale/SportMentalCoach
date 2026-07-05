'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, Clock3 } from 'lucide-react';
import { UserAvatar } from '@/components/user-avatar';
import { cn } from '@/lib/utils';

export type CoachRequestCardData = {
  id: number;
  status: string;
  statusLabel: string;
  statusTone: string;
  statusEyebrow: string;
  athleteName: string;
  athleteEmail?: string | null;
  athleteAvatarUrl?: string | null;
  athleteMeta?: string | null;
  primaryNeed?: string | null;
  goal?: string | null;
  message?: string | null;
  requestedFor: string;
  requestedAtLabel: string;
  serviceLabel?: string | null;
};

export function CoachRequestCard({
  data,
  actions,
  detailContent,
  className,
}: {
  data: CoachRequestCardData;
  actions?: ReactNode;
  detailContent?: ReactNode;
  className?: string;
}) {
  const detailsId = useId();

  return (
    <article
      className={cn(
        'rounded-3xl border border-gray-200 bg-white p-5 shadow-sm ring-1 ring-black/[0.03] transition',
        'hover:border-red-200 hover:shadow-md',
        className
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <UserAvatar
              name={data.athleteName}
              src={data.athleteAvatarUrl}
              className="size-12 ring-2 ring-red-50"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-600">
                {data.statusEyebrow}
              </p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight text-gray-950">
                {data.athleteName}
              </h3>
              {data.athleteMeta ? (
                <p className="mt-1 text-sm text-gray-600">{data.athleteMeta}</p>
              ) : null}
            </div>
          </div>

          <span
            className={cn(
              'inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold',
              data.statusTone
            )}
          >
            {data.statusLabel}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <InfoBlock
            label="Bisogno principale"
            value={data.primaryNeed ?? 'Da chiarire insieme nel primo confronto.'}
            emphasized
          />
          <InfoBlock label="Richiesta per" value={data.requestedFor} icon />
          {data.goal ? (
            <InfoBlock
              label="Obiettivo del percorso"
              value={data.goal}
              className="sm:col-span-2"
            />
          ) : null}
          {data.message ? (
            <InfoBlock
              label="Messaggio dell'atleta"
              value={data.message}
              className="sm:col-span-2"
            />
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
              Ricevuta
            </p>
            <p className="mt-1 text-sm text-gray-600">{data.requestedAtLabel}</p>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            {actions ? (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            ) : null}
            {detailContent ? (
              <details className="group w-full sm:w-auto">
                <summary
                  aria-controls={detailsId}
                  className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-950"
                >
                  Vedi dettagli
                  <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                </summary>
                <div
                  id={detailsId}
                  className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600"
                >
                  {detailContent}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function InfoBlock({
  label,
  value,
  emphasized = false,
  icon = false,
  className,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  icon?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-100 bg-gray-50/80 p-4',
        emphasized && 'border-red-100 bg-red-50/70',
        className
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>
      <p
        className={cn(
          'mt-2 text-sm leading-6 text-gray-700',
          emphasized && 'font-medium text-gray-900'
        )}
      >
        {icon ? (
          <span className="inline-flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-red-500" />
            <span>{value}</span>
          </span>
        ) : (
          value
        )}
      </p>
    </div>
  );
}
