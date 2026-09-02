'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BrainCircuit,
  CalendarClock,
  LayoutDashboard,
  ShieldCheck,
  Sliders,
  UserRound,
  Users,
} from 'lucide-react';

/**
 * La navigazione della Control Room.
 *
 * Sette aree, sempre le stesse, sempre nello stesso ordine. Prima era una
 * pagina sola con sei elenchi impilati: per arrivare ai coach da approvare si
 * scorreva oltre tutti gli atleti, e l'unico modo di sapere cosa contenesse
 * la pagina era percorrerla tutta.
 *
 * **Barra laterale sul desktop, schede scorrevoli sul telefono.** Non è una
 * preferenza estetica: l'amministrazione si usa seduti davanti a uno schermo
 * largo, dove una colonna fissa costa niente e dà l'orientamento; sul
 * telefono la stessa colonna mangerebbe metà larghezza per non dire nulla di
 * più di quanto dica una fila di schede.
 *
 * Il collegamento attivo lo decide `usePathname` sul prefisso, così
 * `/admin/ai/72` tiene acceso «AI e trascrizioni» — chi apre il dettaglio di
 * una seduta deve continuare a sapere dov'è.
 */

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Il conteggio che vale la pena vedere senza aprire, quando c'è. */
  badge?: number;
};

export function AdminNav({
  pendingCoaches,
  attentionCount,
}: {
  pendingCoaches: number;
  attentionCount: number;
}) {
  const pathname = usePathname();

  const items: NavItem[] = [
    {
      href: '/dashboard/admin',
      label: 'Panoramica',
      icon: LayoutDashboard,
      badge: attentionCount || undefined,
    },
    {
      href: '/dashboard/admin/coach',
      label: 'Coach',
      icon: UserRound,
      badge: pendingCoaches || undefined,
    },
    { href: '/dashboard/admin/utenti', label: 'Utenti', icon: Users },
    {
      href: '/dashboard/admin/sessioni',
      label: 'Sessioni',
      icon: CalendarClock,
    },
    {
      href: '/dashboard/admin/ai',
      label: 'AI e trascrizioni',
      icon: BrainCircuit,
    },
    {
      href: '/dashboard/admin/audit',
      label: 'Sicurezza e audit',
      icon: ShieldCheck,
    },
    {
      href: '/dashboard/admin/ai-notes',
      label: 'Configurazione',
      icon: Sliders,
    },
  ];

  const isActive = (href: string) =>
    href === '/dashboard/admin'
      ? pathname === '/dashboard/admin'
      : pathname.startsWith(href);

  return (
    <nav aria-label="Aree dell’amministrazione">
      {/* Telefono e tablet: una fila di schede che scorre. */}
      <ul className="flex gap-1 overflow-x-auto pb-2 lg:hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
              {item.badge ? <Badge value={item.badge} /> : null}
            </Link>
          </li>
        ))}
      </ul>

      {/* Desktop: colonna fissa. */}
      <ul className="hidden lg:flex lg:flex-col lg:gap-0.5">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive(item.href) ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'bg-red-50 text-red-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.badge ? <Badge value={item.badge} /> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Badge({ value }: { value: number }) {
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">
      {value > 99 ? '99+' : value}
    </span>
  );
}

/**
 * L'ambiente, quando **non** è la produzione.
 *
 * In produzione non compare niente: un badge sempre presente diventa
 * decorazione e smette di essere letto. Compare solo quando la pagina che si
 * sta guardando non è quella che gli utenti vedono — che è esattamente il
 * momento in cui confondersi costa.
 */
export function EnvironmentBadge({ environment }: { environment: string }) {
  if (environment === 'production') return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
      <Activity className="h-3.5 w-3.5" aria-hidden="true" />
      Ambiente: {environment}
      <span className="font-normal text-amber-700">
        · il database è comunque quello di produzione
      </span>
    </span>
  );
}
