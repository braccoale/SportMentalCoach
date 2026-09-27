import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { FaqEntry } from '@/lib/core/seo';

/** Una voce può rimandare alla pagina che la approfondisce. */
export type FaqItem = FaqEntry & { link?: { href: string; label: string } };

/**
 * Le domande frequenti delle pagine percorso. Le stesse voci vanno anche nei
 * dati strutturati (`audienceJsonLd({ faq })`): una sola lista per pagina,
 * passata a entrambi, così testo visibile e FAQPage non divergono.
 */
export function AudienceFaq({
  title,
  faq,
  action,
  id,
  className = '',
}: {
  title: string;
  faq: FaqItem[];
  action?: ReactNode;
  id?: string;
  /** Classi in più per la sezione (in home: `kp-snap`, vedi SnapScroll). */
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 border-t border-kp-line bg-kp-ink2 py-20 sm:py-24 ${className}`}
    >
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="kp-eyebrow text-kp-red">Domande frequenti</p>
          <h2 className="kp-display mt-4 text-[clamp(1.5rem,3.5vw,2.5rem)] text-kp-hi">
            {title}
          </h2>
          {action ? <div className="mt-8">{action}</div> : null}
        </div>
        <div className="divide-y divide-kp-line border-y border-kp-line">
          {faq.map((f) => (
            <details key={f.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-display text-base font-semibold text-kp-hi marker:content-none [&::-webkit-details-marker]:hidden">
                {f.q}
                <ArrowRight className="h-4 w-4 shrink-0 text-kp-red transition-transform group-open:rotate-90" />
              </summary>
              <p className="pb-5 pr-8 text-sm leading-relaxed text-kp-mid">
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
