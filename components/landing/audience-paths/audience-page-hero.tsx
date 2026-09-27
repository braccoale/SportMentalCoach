import type { ReactNode } from 'react';
import Image from 'next/image';
import { AUDIENCE_CARDS, type AudienceId } from './audience-cards';
import { audiencePhotoName } from './morph-navigation';

/**
 * La hero delle cinque pagine dietro le card percorso.
 *
 * La foto è la stessa della card e porta lo stesso `view-transition-name`:
 * è l'arrivo del morph (`navigateWithMorph`) e la partenza del ritorno.
 * `data-aud-hero` è il segnale che la pagina nuova è pronta.
 *
 * `split`: foto a destra per chi ha un soggetto solo (atleta, coach…);
 * `full`: foto a tutto schermo per le scene larghe (la squadra).
 */
export function AudiencePageHero({
  id,
  eyebrow,
  lead,
  emphasis,
  text,
  actions,
  layout = 'split',
  position,
  children,
  photoClassName,
  titleClassName = 'max-w-2xl',
}: {
  id: AudienceId;
  eyebrow: string;
  lead: string;
  emphasis: string;
  text: string;
  actions: ReactNode;
  layout?: 'split' | 'full';
  /** object-position della foto nella hero, se diverso da quello della card. */
  position?: string;
  /** Contenuto sotto i bottoni, nella stessa schermata (es. i principi su /famiglie). */
  children?: ReactNode;
  /** Riquadro della foto, se diverso dal predefinito (es. più corto, per alzarla). */
  photoClassName?: string;
  titleClassName?: string;
}) {
  const card = AUDIENCE_CARDS.find((c) => c.id === id)!;
  const split = layout === 'split';

  return (
    <section className="relative isolate overflow-hidden border-b border-kp-line">
      <div
        data-aud-hero={id}
        className={`absolute -z-10 ${
          photoClassName ?? (split ? 'inset-y-0 right-0 w-full md:w-[58%]' : 'inset-0')
        }`}
        style={{ viewTransitionName: audiencePhotoName(id) }}
      >
        <Image
          src={card.image.src}
          alt={card.image.alt}
          fill
          priority
          sizes={split ? '(min-width: 768px) 58vw, 100vw' : '100vw'}
          className="object-cover"
          style={{ objectPosition: position ?? card.image.position }}
        />
        <div
          className={`absolute inset-0 bg-gradient-to-r from-kp-ink ${
            split ? 'via-kp-ink/70 to-kp-ink/10 md:via-kp-ink/40' : 'via-kp-ink/35 to-transparent'
          }`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-kp-ink via-transparent to-kp-ink/40" />
      </div>
      <div
        className={`mx-auto flex min-h-svh w-full max-w-6xl flex-col justify-end px-5 sm:px-8 ${
          children ? 'pt-28 pb-12 sm:pb-14' : 'pt-32 pb-16 sm:pb-24'
        }`}
      >
        <p className="kp-eyebrow text-kp-red">{eyebrow}</p>
        <h1 className={`kp-display mt-4 ${titleClassName} text-[clamp(2.4rem,6vw,4.75rem)] leading-[1.02] text-kp-hi`}>
          {lead} <span className="text-kp-red">{emphasis}</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-kp-mid">{text}</p>
        <div className="mt-9 flex flex-wrap items-center gap-5">{actions}</div>
        {children}
      </div>
    </section>
  );
}

/** Il bottone principale delle pagine percorso: verde, mai rosso. */
export const AUDIENCE_PRIMARY_CTA =
  'group inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-green-600 px-6 py-3.5 font-semibold text-white transition-colors hover:bg-green-700';

/** Il collegamento secondario accanto al bottone. */
export const AUDIENCE_SECONDARY_LINK =
  'inline-flex items-center gap-1.5 text-sm font-semibold text-kp-mid transition-colors hover:text-kp-hi';
