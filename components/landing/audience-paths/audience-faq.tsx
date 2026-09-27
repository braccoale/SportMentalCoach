import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import type { FaqEntry } from '@/lib/core/seo';

/**
 * Le domande frequenti delle pagine percorso. Le stesse voci vanno anche nei
 * dati strutturati (`audienceJsonLd({ faq })`): una sola lista per pagina,
 * passata a entrambi, così testo visibile e FAQPage non divergono.
 */
export function AudienceFaq({
  title,
  faq,
  action,
}: {
  title: string;
  faq: FaqEntry[];
  action?: ReactNode;
}) {
  return (
    <section className="border-t border-kp-line bg-kp-ink2 py-20 sm:py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
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
              <p className="pb-5 pr-8 text-sm leading-relaxed text-kp-mid">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
