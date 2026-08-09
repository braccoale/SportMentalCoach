'use client';

import { useId, useState } from 'react';
import { HelpCircle, Timer, Unlock } from 'lucide-react';
import type {
  ConversationMap,
  ConversationRole,
} from '@/lib/core/ai-session-notes/conversation-map';
import {
  describeConversationInsight,
  type InsightStat,
} from '@/lib/core/ai-session-notes/conversation-insight-text';
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

/**
 * La profondità viene dal colore, non da un'immagine.
 *
 * Un bagliore diagonale e una sfumatura bastano a dare volume alla fascia.
 * Una grafica decorativa avrebbe fatto più scena, ma questo prodotto parla
 * della salute mentale di atleti: l'austerità è ciò che lo fa sembrare
 * serio, ed è anche la ragione per cui la fascia funziona.
 */
const SURFACE_STYLE = {
  backgroundColor: SURFACE,
  backgroundImage:
    'radial-gradient(120% 140% at 82% 0%, rgba(139,92,246,0.30) 0%, rgba(139,92,246,0) 55%), ' +
    'radial-gradient(90% 120% at 8% 105%, rgba(217,119,6,0.16) 0%, rgba(217,119,6,0) 60%), ' +
    'linear-gradient(180deg, #1c1930 0%, #141221 100%)',
};

/**
 * I blocchi si disegnano da sinistra al primo caricamento.
 *
 * Non è decorazione: la mappa racconta un tempo che scorre, e vederla
 * costruirsi nella direzione in cui si legge fa capire cosa si sta
 * guardando prima ancora di leggere l'etichetta. Chi ha chiesto meno
 * animazioni al sistema operativo non la vede.
 */
const ENTRANCE_KEYFRAMES = `
@keyframes kp-conv-grow { from { transform: scaleX(0) } to { transform: scaleX(1) } }
@media (prefers-reduced-motion: no-preference) {
  .kp-conv-blk { animation: kp-conv-grow 420ms cubic-bezier(0.22, 1, 0.36, 1) both; transform-origin: left center }
}
@media (prefers-reduced-motion: reduce) { .kp-conv-blk { animation: none } }
`;

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
            className="kp-conv-blk absolute top-0 h-full rounded-[3px] transition-opacity hover:opacity-80 focus:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            style={{
              // Lo scaglionamento segue la posizione nel tempo, non l'indice:
              // la mappa si costruisce come si e' svolta la conversazione.
              animationDelay: `${Math.round(block.startPercent * 4)}ms`,
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

const STAT_STYLE = {
  buono: { value: 'text-emerald-300', ring: 'bg-emerald-400/15 text-emerald-300' },
  neutro: { value: 'text-white', ring: 'bg-white/10 text-white/70' },
  attenzione: { value: 'text-amber-300', ring: 'bg-amber-400/15 text-amber-300' },
};

const STAT_ICON = {
  domande: HelpCircle,
  durata: Timer,
  apertura: Unlock,
};

function Stat({ stat }: { stat: InsightStat }) {
  const style = STAT_STYLE[stat.tone];
  const Icon = STAT_ICON[stat.key];
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
      <span
        className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full ${style.ring}`}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className={`text-xl font-bold tabular-nums ${style.value}`}>
          {stat.value}
        </p>
        <p className="mt-0.5 text-xs leading-4 text-white/55">{stat.label}</p>
        <p className="mt-1.5 text-xs leading-5 text-white/75">{stat.meaning}</p>
      </div>
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
      style={SURFACE_STYLE}
    >
      <style>{ENTRANCE_KEYFRAMES}</style>
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

      {/* Il numero da solo lascia al coach il lavoro di capire se sia un
          bene o un male. La riga sotto glielo dice: e' la differenza fra un
          cruscotto e uno strumento. */}
      <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2 lg:grid-cols-3">
        {describeConversationInsight(map.insight).map((stat) => (
          <Stat key={stat.key} stat={stat} />
        ))}
      </div>

      <p
        className="mt-4 min-h-5 text-xs text-white/55 tabular-nums"
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
