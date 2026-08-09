import { CheckCircle2, AlertTriangle, CircleAlert } from 'lucide-react';
import type { CoverageMessage } from '@/lib/core/ai-session-notes/session-coverage-text';
import { SectionHeading, Surface } from './ui';

/**
 * Quanta parte della sessione l'AI ha davvero sentito.
 *
 * Componente di presentazione puro: riceve un messaggio già tradotto e non
 * interroga nulla. Discreta quando la copertura è integra — non deve rubare
 * attenzione al riepilogo — ed esplicita quando non lo è, perché un buco non
 * dichiarato è esattamente ciò che rende inaffidabile l'analisi che segue.
 */

const TONE_STYLES = {
  sereno: {
    surface: 'muted' as const,
    icon: 'text-emerald-600',
    eyebrow: 'Copertura',
    Icon: CheckCircle2,
  },
  attenzione: {
    surface: 'plain' as const,
    icon: 'text-amber-600',
    eyebrow: 'Copertura',
    Icon: AlertTriangle,
  },
  problema: {
    surface: 'plain' as const,
    icon: 'text-red-600',
    eyebrow: 'Copertura',
    Icon: CircleAlert,
  },
};

export function CoverageCard({ message }: { message: CoverageMessage }) {
  const style = TONE_STYLES[message.tone];
  const { Icon } = style;

  return (
    <Surface
      tone={style.surface}
      ariaLabel="Copertura della registrazione"
      className={
        message.tone === 'problema'
          ? 'border-red-200'
          : message.tone === 'attenzione'
            ? 'border-amber-200'
            : ''
      }
    >
      <div className="flex items-start gap-3">
        <Icon
          className={`mt-0.5 size-5 shrink-0 ${style.icon}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <SectionHeading eyebrow={style.eyebrow} title={message.titolo} />
          <ul className="mt-2 space-y-1 text-sm leading-6 text-gray-600">
            {message.dettagli.map((riga) => (
              <li key={riga}>{riga}</li>
            ))}
          </ul>
        </div>
      </div>
    </Surface>
  );
}
