import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CircleHelp } from 'lucide-react';

/**
 * Il punto di domanda accanto alla campanella: porta alla pagina di supporto
 * con tutte le domande frequenti e, in fondo, il modulo contatti.
 * Stessa forma e stessi colori della campanella, per stare in fila con lei.
 */
export function SupportLink({
  appearance = 'dark',
}: {
  appearance?: 'dark' | 'light';
} = {}) {
  const t = useTranslations('DashboardShell');
  return (
    <Link
      href="/dashboard/supporto"
      title={t('support')}
      className={`rounded-full p-1.5 ${
        appearance === 'light'
          ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-950'
          : 'text-gray-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      <CircleHelp className="h-5 w-5" aria-hidden />
      <span className="sr-only">{t('support')}</span>
    </Link>
  );
}
