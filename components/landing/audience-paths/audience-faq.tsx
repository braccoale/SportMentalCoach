import type { ComponentType, ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronUp } from 'lucide-react';
import type { FaqEntry } from '@/lib/core/seo';

/** Una voce può rimandare alla pagina che la approfondisce. */
export type FaqItem = FaqEntry & {
  link?: { href: string; label: string };
  /** Icona accanto alla domanda (variante `card`). Non va nei dati strutturati. */
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
};

/**
 * Le domande frequenti delle pagine percorso. Le stesse voci vanno anche nei
 * dati strutturati (`audienceJsonLd({ faq })`): una sola lista per pagina,
 * passata a entrambi, così testo visibile e FAQPage non divergono.
 *
 * A sinistra il titolo (con la parte in rosso, se c'è), una riga di
 * introduzione, il bottone e un collegamento secondario; sotto, facoltativa,
 * una foto che sfuma nel fondo. A destra l'elenco: chiusa una voce ha la
 * freccia, aperta il chevron e la risposta rientrata dietro un filo rosso.
 */
export function AudienceFaq({
  title,
  emphasis,
  intro,
  faq,
  action,
  secondary,
  photo,
  id,
  className = '',
  variant = 'plain',
  tone,
}: {
  title: string;
  /** La parte finale del titolo, in rosso. */
  emphasis?: string;
  intro?: string;
  faq: FaqItem[];
  action?: ReactNode;
  secondary?: ReactNode;
  /** Foto in basso a sinistra; pensata per il fondo chiaro. */
  photo?: { src: string; alt: string };
  id?: string;
  /** Classi in più per la sezione (in home: `kp-snap`, vedi SnapScroll). */
  className?: string;
  /** `card`: l'elenco sta in un riquadro bianco, con l'icona di ogni domanda. */
  variant?: 'plain' | 'card';
  /**
   * `light` forza il fondo chiaro anche dove l'alternanza di `.kp-alt`
   * darebbe lo scuro (vedi `.kp-force-light` in globals.css).
   */
  tone?: 'light';
}) {
  const card = variant === 'card';
  return (
    <section
      id={id}
      className={`relative isolate scroll-mt-24 overflow-hidden !justify-start border-t border-kp-line bg-kp-ink2 py-16 sm:py-20 ${
        tone === 'light' ? 'kp-force-light' : ''
      } ${className}`}
    >

      <div
        className="mx-auto grid w-full max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.45fr]"
      >
        <div>
          <p className="kp-eyebrow flex items-center gap-3 text-kp-red">
            <span className="h-px w-10 bg-kp-red" aria-hidden />
            Domande frequenti
          </p>
          <h2 className="kp-display mt-5 text-[clamp(2.25rem,5vw,4.25rem)] leading-[0.98] text-kp-hi">
            {title}
            {emphasis ? (
              <>
                {' '}
                <span className="text-kp-red">{emphasis}</span>.
              </>
            ) : null}
          </h2>
          {intro ? (
            <p className="mt-5 max-w-md text-lg leading-relaxed text-kp-mid">{intro}</p>
          ) : null}
          {action ? <div className="mt-8">{action}</div> : null}
          {secondary ? <div className="mt-5">{secondary}</div> : null}
          {/* La foto segue il testo, subito sotto il collegamento, e sborda
              fino al bordo sinistro della finestra. */}
          {photo ? (
            <div
              aria-hidden
              className="pointer-events-none relative mt-8 hidden aspect-[740/386] lg:-ml-[max(2rem,calc((100vw-80rem)/2+2rem))] lg:block"
            >
              <Image src={photo.src} alt="" fill sizes="50vw" className="object-cover" />
              <div className="absolute inset-x-0 top-0 h-1/6 bg-gradient-to-b from-kp-ink2 to-transparent" />
              <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-kp-ink2 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-kp-ink2 to-transparent" />
            </div>
          ) : null}
        </div>

        <div
          className={
            card
              ? 'self-start rounded-3xl bg-kp-surface px-5 py-2 shadow-[0_24px_60px_-30px_rgba(5,5,7,0.3)] ring-1 ring-black/5 sm:px-8'
              : 'divide-y divide-kp-line border-y border-kp-line'
          }
        >
          {faq.map((f) => (
            <details
              key={f.q}
              className={`group ${card ? 'border-b border-kp-line last:border-b-0' : ''}`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-display text-base font-semibold text-kp-hi marker:content-none sm:text-lg [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-4">
                  {card && f.icon ? (
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-kp-ink2">
                      <f.icon className="h-5 w-5 text-kp-hi" aria-hidden />
                    </span>
                  ) : null}
                  {f.q}
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-kp-red group-open:hidden" aria-hidden />
                <ChevronUp className="hidden h-5 w-5 shrink-0 text-kp-red group-open:block" aria-hidden />
              </summary>
              <p
                className={`mb-5 text-sm leading-relaxed text-kp-mid ${
                  card && f.icon ? 'ml-16 pr-8' : 'ml-0.5 border-l-2 border-kp-red pl-5 pr-8'
                }`}
              >
                {f.a}
                {f.link ? (
                  <>
                    {' '}
                    <Link
                      href={f.link.href}
                      className="font-semibold text-kp-hi underline decoration-kp-red decoration-2 underline-offset-4"
                    >
                      {f.link.label}
                    </Link>
                  </>
                ) : null}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** «Hai ancora dubbi? Parla con noi»: il collegamento sotto il bottone. */
export const FAQ_SECONDARY_LINK =
  'group inline-flex items-center gap-2 text-sm font-medium text-kp-hi underline decoration-kp-red decoration-1 underline-offset-[6px]';
