'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * I due soli grafici della panoramica.
 *
 * Due, e non sei. Un grafico si guadagna il posto quando il dato ha una
 * forma che un numero non racconta: l'andamento nel tempo ce l'ha — un picco
 * di disdette il martedì si vede e non si conta — e la distribuzione degli
 * esiti pure. Tutto il resto della pagina è fatto di numeri e collegamenti,
 * perché è quello che serve a decidere.
 *
 * Nessuna area riempita, nessun gradiente, nessuna animazione: un cruscotto
 * amministrativo si legge di fretta e spesso di sera.
 */

const AXIS = { fontSize: 11, fill: '#6b7280' } as const;

function shortDay(value: string): string {
  // `YYYY-MM-DD` → `DD/MM`, senza Intl: il runner di CI ha una ICU ridotta e
  // la stessa data uscirebbe formattata diversamente.
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
}

export function SessionsTrendChart({
  data,
}: {
  data: { day: string; completate: number; annullate: number }[];
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={shortDay}
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: '#e5e7eb' }}
            minTickGap={12}
          />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={36}
          />
          <Tooltip
            cursor={{ fill: '#f9fafb' }}
            labelFormatter={(value) => shortDay(String(value))}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="completate"
            name="Completate"
            stackId="a"
            fill="#e11d2a"
            radius={[0, 0, 0, 0]}
            isAnimationActive={false}
          />
          <Bar
            dataKey="annullate"
            name="Annullate o scadute"
            stackId="a"
            fill="#d1d5db"
            radius={[3, 3, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const OUTCOME_COLORS: Record<string, string> = {
  Concluse: '#059669',
  'In lavorazione': '#6366f1',
  'Trascrizione fallita': '#dc2626',
  'Riepilogo fallito': '#f59e0b',
  'Consenso rifiutato': '#94a3b8',
  Annullate: '#cbd5e1',
};

export function OutcomeDistributionChart({
  data,
}: {
  data: { label: string; count: number }[];
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
        >
          <CartesianGrid strokeDasharray="2 4" stroke="#f3f4f6" horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={130}
          />
          <Tooltip
            cursor={{ fill: '#f9fafb' }}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" name="Sedute" radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell
                key={entry.label}
                fill={OUTCOME_COLORS[entry.label] ?? '#9ca3af'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
