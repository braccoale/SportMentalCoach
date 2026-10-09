'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BadgeCheck, Briefcase, CalendarCheck, Globe, Play, X } from 'lucide-react';
import { RatingStars } from '@/components/rating-stars';
import { VideoEmbed } from '@/components/video-embed';
import type { CoachVideoSource } from '@/lib/core/coach-video';
import { cn } from '@/lib/utils';

/** Tutto ciò che il pannello mostra, preso dai dati veri del coach: niente di inventato. */
export type CoachPanelData = {
  providerId: number;
  slug: string;
  name: string;
  avatarUrl: string | null;
  headline: string | null;
  certified: boolean;
  ratingAverage: number | null;
  ratingCount: number;
  /** Presentazione (può essere tagliata dal server: in quel caso `descriptionTruncated`). */
  description: string | null;
  descriptionTruncated: boolean;
  sports: string[];
  specialties: string[];
  languages: string[];
  yearsExperience: number | null;
  video: CoachVideoSource | null;
};

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">{children}</span>
);

/**
 * Il video del pannello: 16:9, la foto come anteprima, un Play esplicito e
 * l'audio solo da quando l'utente avvia. Niente viene caricato prima del clic.
 * Senza video: una presentazione fotografica, non un player finto.
 */
function PanelVideo({ data }: { data: CoachPanelData }) {
  const [started, setStarted] = useState(false);
  const { video, avatarUrl, name } = data;

  if (video?.kind === 'embed') {
    return <VideoEmbed src={video.src} provider={video.provider} title={`Video di presentazione di ${name}`} />;
  }

  if (video?.kind === 'file') {
    return (
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
        {started ? (
          <video src={video.src} controls autoPlay playsInline className="h-full w-full object-contain" />
        ) : (
          <>
            {avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
            <div className="absolute inset-0 bg-black/30" />
            <button
              type="button"
              onClick={() => setStarted(true)}
              aria-label={`Guarda la presentazione di ${name}`}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-emerald-700 shadow-lg">
                <Play className="h-6 w-6 translate-x-0.5 fill-current" />
              </span>
              <span className="text-sm font-semibold drop-shadow">Guarda presentazione</span>
            </button>
          </>
        )}
      </div>
    );
  }

  if (video?.kind === 'link') {
    return (
      <a
        href={video.href}
        target="_blank"
        rel="noreferrer"
        className="flex aspect-video items-center justify-center gap-2 rounded-2xl bg-gray-50 text-sm font-semibold text-emerald-700 ring-1 ring-gray-200 hover:bg-gray-100"
      >
        <Play className="h-4 w-4 fill-current" /> Guarda il video di presentazione
      </a>
    );
  }

  // Nessun video: la fotografia, con il nome in sovrimpressione.
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-gradient-to-br from-gray-800 to-gray-950">
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={name} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-6xl font-semibold text-white/30">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <p className="absolute bottom-3 left-4 right-4 truncate text-lg font-semibold text-white drop-shadow">{name}</p>
    </div>
  );
}

type ActionState = { label: string; disabled: boolean } | null;

/**
 * I pulsanti di prenotazione del pannello sono quelli della scheda: qui se ne
 * legge etichetta e stato, e il clic preme quello vero. Così prenotazione,
 * sessione conoscitiva, abbonamento e le regole demo/credito restano
 * esattamente gli stessi, senza una seconda copia da tenere allineata.
 */
function useCardAction(providerId: number, action: 'intro' | 'book'): { state: ActionState; press: () => void } {
  const [state, setState] = useState<ActionState>(null);

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(
      `[data-coach-card="${providerId}"] [data-coach-action="${action}"] :is(button, a)`
    );
    if (!el) {
      setState(null);
      return;
    }
    setState({
      label: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
      disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
    });
  }, [providerId, action]);

  function press() {
    document
      .querySelector<HTMLElement>(`[data-coach-card="${providerId}"] [data-coach-action="${action}"] :is(button, a)`)
      ?.click();
  }
  return { state, press };
}

export function CoachDetailPanel({
  data,
  onClose,
  sheet = false,
  closeAfterAction,
}: {
  data: CoachPanelData;
  /** Desktop: la X in alto. Nella scheda del telefono la chiusura è quella della finestra. */
  onClose?: () => void;
  sheet?: boolean;
  /** Nella scheda del telefono si chiude prima di aprire la finestra di prenotazione. */
  closeAfterAction?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const intro = useCardAction(data.providerId, 'intro');
  const book = useCardAction(data.providerId, 'book');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function run(press: () => void) {
    if (closeAfterAction) {
      // Prima la scheda si chiude (e con lei il blocco dello scroll), poi si apre la finestra.
      closeAfterAction();
      timer.current = setTimeout(press, 180);
    } else {
      press();
    }
  }

  const longBio = (data.description?.length ?? 0) > 280;

  return (
    <div className="flex flex-col gap-5 p-5 sm:p-6">
      <header className={cn('flex items-start justify-between gap-3', sheet && 'pr-10')}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight text-gray-950">{data.name}</h2>
            {data.certified && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                Certificato KaiPai
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-gray-700">
            {data.ratingCount > 0 ? (
              <span className="inline-flex items-center gap-1.5">
                <RatingStars value={data.ratingAverage ?? 0} />
                <span className="font-medium">{data.ratingAverage}</span>
                <span className="text-gray-400">
                  ({data.ratingCount} {data.ratingCount === 1 ? 'recensione' : 'recensioni'})
                </span>
              </span>
            ) : (
              <span className="text-gray-400">Nuovo coach</span>
            )}
          </div>
        </div>
        {onClose && !sheet && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi i dettagli"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        )}
      </header>

      <PanelVideo data={data} />

      {data.headline && <p className="text-base font-medium italic text-gray-800">“{data.headline}”</p>}

      {data.description && (
        <div>
          <p
            className={cn('whitespace-pre-line text-sm leading-6 text-gray-600', !expanded && longBio && 'line-clamp-4')}
          >
            {data.description}
          </p>
          {longBio && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-1 text-sm font-medium text-emerald-700 hover:underline"
            >
              {expanded ? 'Mostra meno' : 'Mostra di più'}
            </button>
          )}
          {expanded && data.descriptionTruncated && (
            <p className="mt-1 text-xs text-gray-500">Il resto è nel profilo completo.</p>
          )}
        </div>
      )}

      {(data.sports.length > 0 || data.specialties.length > 0) && (
        <div className="flex flex-col gap-2">
          {data.sports.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Sport</p>
              <div className="flex flex-wrap gap-1.5">
                {data.sports.map((s) => (
                  <Pill key={s}>{s}</Pill>
                ))}
              </div>
            </div>
          )}
          {data.specialties.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Specializzazioni</p>
              <div className="flex flex-wrap gap-1.5">
                {data.specialties.map((s) => (
                  <Pill key={s}>{s}</Pill>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(data.languages.length > 0 || data.yearsExperience != null) && (
        <ul className="flex flex-col gap-1.5 text-sm text-gray-600">
          {data.languages.length > 0 && (
            <li className="inline-flex items-center gap-2">
              <Globe className="h-4 w-4 text-gray-400" aria-hidden />
              {data.languages.join(', ')}
            </li>
          )}
          {data.yearsExperience != null && (
            <li className="inline-flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-gray-400" aria-hidden />
              {data.yearsExperience} {data.yearsExperience === 1 ? 'anno' : 'anni'} di esperienza
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
        {intro.state && (
          <button
            type="button"
            disabled={intro.state.disabled}
            onClick={() => run(intro.press)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-green-600 bg-white px-4 text-sm font-semibold text-green-700 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden />
            {intro.state.label}
          </button>
        )}
        {book.state && (
          <button
            type="button"
            disabled={book.state.disabled}
            onClick={() => run(book.press)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-green-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {book.state.label}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
        <Link
          href={`/coaches/${data.slug}`}
          className="text-center text-sm font-medium text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline"
        >
          Vedi il profilo completo
        </Link>
      </div>
    </div>
  );
}
