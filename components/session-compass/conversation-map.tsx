'use client';

import { useId, useState } from 'react';
import type {
  ConversationMap,
  ConversationRole,
} from '@/lib/core/ai-session-notes/conversation-map';
import { formatTranscriptTimestamp } from './time';

/**
 * La mappa della conversazione: la firma visiva del riepilogo.
 *
 * Due corsie su fondo scuro — l'unica superficie scura della pagina, ed è
 * quello che le dà il ruolo di punto focale. Mostra una cosa che il numero
 * «29%» non può dire: *quando* l'atleta si è aperto.
 *
 * I colori sono validati per la separazione in daltonismo (ΔE 32.9 in
 * protanopia sul fondo scuro) e non sono l'unico portatore d'identità: ogni
 * corsia ha la propria etichetta a sinistra.
 */

const SURFACE = '#171525';

const ROLE_STYLE: Record<
  ConversationRole,
  { fill: string; label: string; share: string }
> = {
  coach: { fill: '#8b5cf6', label: 'Coach', share: 'text-violet-200' },
  athlete: { fill: '#d97706', label: 'Atleta', share: 'text-amber-200' },
};

function shareSentence(map: ConversationMap): string {
  const coach = map.lanes[0];
  const athlete = map.lanes[1];
  if (map.durationMs === 0) return 'Nessun parlato registrato.';
  if (!map.dominantRole) {
    return `Spazio di parola equilibrato: ${coach.sharePercent}% coach, ${athlete.sharePercent}% atleta.`;
  }
  return map.dominantRole === 'coach'
    ? `Hai parlato tu per il ${coach.sharePercent}% del tempo.`
    : `L'atleta ha parlato per il ${athlete.sharePercent}% del tempo.`;
}

function Lane({
  lane,
  onHover,
}: {
  lane: ConversationMap['lanes'][number];
  onHover: (block: { startMs: number; endMs: number; role: ConversationRole } | null) => void;
}) {
  const style = ROLE_STYLE[lane.role];
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
        {style.label}
      </span>
      <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-white/[0.06]">
        {lane.blocks.map((block) => (
          <button
            key={`${block.startMs}-${block.endMs}`}
            type="button"
            aria-label={`${style.label}, da ${formatTranscriptTimestamp(block.startMs)} a ${formatTranscriptTimestamp(block.endMs)}`}
            onMouseEnter={() => onHover({ ...block, role: lane.role })}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover({ ...block, role: lane.role })}
            onBlur={() => onHover(null)}
            className="absolute top-0 h-full rounded-[3px] transition-opacity hover:opacity-80 focus:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{
              left: `${block.startPercent}%`,
              // Il minimo tiene visibile un intervento brevissimo; i 2px di
              // stacco impediscono a due blocchi vicini di sembrarne uno.
              width: `max(3px, calc(${block.widthPercent}% - 2px))`,
              backgroundColor: style.fill,
            }}
          />
        ))}
      </div>
      <span
        className={`w-10 shrink-0 text-right text-sm font-bold tabular-nums ${style.share}`}
      >
        {lane.sharePercent}%
      </span>
    </div>
  );
}

export function ConversationMapBand({
  map,
  onSeek,
}: {
  map: ConversationMap;
  onSeek?: (atMs: number) => void;
}) {
  const [hovered, setHovered] = useState<{
    startMs: number;
    endMs: number;
    role: ConversationRole;
  } | null>(null);
  const titleId = useId();

  if (map.durationMs === 0) return null;

  return (
    <section
      aria-labelledby={titleId}
      className="overflow-hidden rounded-2xl p-5 sm:p-6"
      style={{ backgroundColor: SURFACE }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-violet-300">
            Conversazione
          </p>
          <h3
            id={titleId}
            className="mt-1 text-lg font-bold text-white sm:text-xl"
          >
            {shareSentence(map)}
          </h3>
        </div>
        <p className="text-xs text-white/50 tabular-nums">
          {formatTranscriptTimestamp(map.durationMs)} di sessione
        </p>
      </div>

      <div className="mt-5 space-y-2">
        {map.lanes.map((lane) => (
          <Lane key={lane.role} lane={lane} onHover={setHovered} />
        ))}
      </div>

      {map.moments.length > 0 ? (
        <div className="mt-3 flex items-center gap-3">
          <span className="w-14 shrink-0" aria-hidden="true" />
          <div className="relative h-6 min-w-0 flex-1">
            {map.moments.map((moment) => (
              <button
                key={`${moment.atMs}-${moment.label}`}
                type="button"
                title={moment.label}
                onClick={() => onSeek?.(moment.atMs)}
                className="absolute top-0 -translate-x-1/2 rounded px-1 text-white/45 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                style={{ left: `${moment.atPercent}%` }}
              >
                <span aria-hidden="true" className="block text-[10px] leading-none">
                  ◆
                </span>
                <span className="sr-only">
                  Momento chiave a {formatTranscriptTimestamp(moment.atMs)}:{' '}
                  {moment.label}
                </span>
              </button>
            ))}
          </div>
          <span className="w-10 shrink-0" aria-hidden="true" />
        </div>
      ) : null}

      <p
        className="mt-3 min-h-5 text-xs text-white/55 tabular-nums"
        aria-live="polite"
      >
        {hovered
          ? `${ROLE_STYLE[hovered.role].label} · ${formatTranscriptTimestamp(hovered.startMs)} – ${formatTranscriptTimestamp(hovered.endMs)}`
          : map.moments.length > 0
            ? 'I rombi segnano i momenti chiave. Passa sui blocchi per gli orari.'
            : 'Passa sui blocchi per vedere gli orari.'}
      </p>
    </section>
  );
}
