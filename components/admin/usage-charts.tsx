'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { shortDay } from '@/lib/core/usage/series';

/**
 * I grafici della pagina «Utilizzo».
 *
 * Stesso stile della panoramica: nessun gradiente, nessuna animazione, una sola
 * tinta (il verde della piattaforma) e il grigio per ciò che sta sullo sfondo.
 * Un cruscotto si legge di fretta, e spesso di sera.
 */

const AXIS = { fontSize: 11, fill: '#6b7280' } as const;
const GREEN = '#16a34a';
const GREEN_DARK = '#166534';
const GREEN_SOFT = '#bbf7d0';
const GRAY = '#9ca3af';

const TOOLTIP = {
  contentStyle: { fontSize: 12, borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: 'none' },
  labelStyle: { fontWeight: 600, color: '#111827' },
  cursor: { fill: '#f3f4f6' },
} as const;

type DayPoint = { day: string };

const dayTick = (day: string) => shortDay(day);

/** Visite (barre) e visitatori diversi (linea), un punto per giorno. */
export function VisitsChart({ data }: { data: (DayPoint & { views: number; uniques: number })[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Visite e visitatori per giorno">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayTick} tick={AXIS} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={28} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
          <Tooltip {...TOOLTIP} labelFormatter={(d) => shortDay(String(d))} />
          <Bar dataKey="views" name="Visite" fill={GREEN_SOFT} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line dataKey="uniques" name="Visitatori diversi" stroke={GREEN_DARK} strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Gesti compiuti (barre) e persone attive (linea) per giorno. */
export function ActivityChart({ data }: { data: (DayPoint & { events: number; users: number })[] }) {
  return (
    <div className="h-56 w-full" role="img" aria-label="Attività e persone attive per giorno">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayTick} tick={AXIS} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={28} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
          <Tooltip {...TOOLTIP} labelFormatter={(d) => shortDay(String(d))} />
          <Bar dataKey="events" name="Gesti" fill="#e5e7eb" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Line dataKey="users" name="Persone attive" stroke={GREEN} strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Da dove arrivano, in barre orizzontali sui visitatori diversi. */
export function ReferrerChart({ data }: { data: { label: string; uniques: number; views: number }[] }) {
  const height = Math.max(120, data.length * 44 + 16);
  return (
    <div className="w-full" style={{ height }} role="img" aria-label="Provenienza dei visitatori">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: '#374151' }} tickLine={false} axisLine={false} width={120} />
          <Tooltip {...TOOLTIP} />
          <Bar dataKey="uniques" name="Visitatori diversi" fill={GREEN} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false} />
          <Bar dataKey="views" name="Visite" fill={GREEN_SOFT} radius={[0, 4, 4, 0]} barSize={16} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** La linea minuscola dentro una scheda numerica: solo la forma, senza assi. */
export function Sparkline({ data, dataKey, color = GREEN }: { data: DayPoint[]; dataKey: string; color?: string }) {
  const hasShape = data.some((p) => Number((p as unknown as Record<string, number>)[dataKey]) > 0);
  return (
    <div className="h-10 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <Line dataKey={dataKey} stroke={hasShape ? color : '#e5e7eb'} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Le barre dei contatori (prenotazioni): una per voce, con il numero dentro il tooltip. */
export function CountBars({ data }: { data: { label: string; n: number }[] }) {
  const height = Math.max(120, data.length * 38 + 12);
  return (
    <div className="w-full" style={{ height }} role="img" aria-label="Conteggi">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 12, fill: '#374151' }} tickLine={false} axisLine={false} width={96} />
          <Tooltip {...TOOLTIP} />
          <Bar dataKey="n" name="Numero" fill={GRAY} radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false} label={{ position: 'right', fontSize: 12, fill: '#374151' }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Un valore per giorno in barre: gli iscritti, i problemi. Una sola serie, una sola tinta. */
export function DailyBars({
  data,
  label,
  color = GREEN,
}: {
  data: { day: string; value: number }[];
  label: string;
  color?: string;
}) {
  return (
    <div className="h-52 w-full" role="img" aria-label={`${label} per giorno`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#f3f4f6" vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayTick} tick={AXIS} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} minTickGap={28} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={34} />
          <Tooltip {...TOOLTIP} labelFormatter={(d) => shortDay(String(d))} />
          <Bar dataKey="value" name={label} fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
