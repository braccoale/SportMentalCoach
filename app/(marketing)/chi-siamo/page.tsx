import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { ScrollProgress } from '@/components/landing/smooth-scroll';
import { SnapScroll } from '@/components/landing/snap-scroll';
import { RevealProvider } from '@/components/landing/reveal-provider';
import { Footer } from '@/components/footer';
import { JsonLd } from '@/components/json-ld';
import { FounderSection } from '@/components/landing/founder-section';
import {
  audienceJsonLd,
  audienceMetadata,
} from '@/components/landing/audience-paths/audience-seo';
import { AUDIENCE_PRIMARY_CTA } from '@/components/landing/audience-paths/audience-page-hero';
import { aboutPageJsonLd } from '@/lib/core/seo';

export const metadata: Metadata = audienceMetadata({
  path: '/chi-siamo',
  title: 'Chi siamo: Francesco Borrelli e il metodo KaiPai | KaiPai',
  description:
    'Chi c’è dietro KaiPai: Francesco Borrelli, mental coach sportivo certificato ACSI–CONI e autore, e il metodo, la scuola e la rete di coach che ha fondato.',
  shareTitle: 'Chi siamo — KaiPai',
  shareDescription:
    '«Non farti guidare dalla tua mente. Impara a guidarla.» L’origine di KaiPai.',
  image: '/og/teams.jpg',
});

/** Le tre parti di KaiPai, ognuna verso la pagina che la racconta. */
const PARTS = [
  {
    t: 'Il metodo',
    b: 'La mente ha quattro muscoli, e si allenano tutti: il Metodo KaiPai è il modo in cui lavorano i nostri coach.',
    href: '/#metodo',
    cta: 'Scopri il metodo',
  },
  {
    t: 'La scuola',
    b: 'La KaiPai Academy forma i mental coach: sessioni live con mentor esperti, moduli pratici, attestato di completamento.',
    href: '/academy',
    cta: 'Vai all’Academy',
  },
  {
    t: 'La rete di coach',
    b: 'Mental coach sportivi approvati dal team KaiPai, che atleti, famiglie e società incontrano in videochiamata.',
    href: '/coaches',
    cta: 'Scegli un coach',
  },
];

export default function ChiSiamoPage() {
  return (
    <div className="kp-root kp-snap-page flex min-h-screen flex-col bg-kp-ink text-kp-hi">
      <SnapScroll />
      <ScrollProgress />
      {/* La sezione del fondatore usa <Reveal>: senza il provider resta invisibile. */}
      <RevealProvider />
      <SiteNav />

      <main className="kp-alt flex-1">
        <FounderSection asPageHeading />

        <section className="py-16 sm:py-20">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
            <p className="kp-eyebrow flex items-center gap-3 text-kp-red">
              <span className="h-px w-10 bg-kp-red" aria-hidden />
              Che cos’è KaiPai
            </p>
            <h2 className="kp-display mt-5 max-w-3xl text-[clamp(2rem,4.4vw,3.5rem)] leading-[1.02] text-kp-hi">
              Un metodo, una scuola, una rete di coach.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kp-mid">
              Perché allenare la testa diventi normale quanto allenare il
              fisico: per chi fa sport, per le famiglie che lo accompagnano, per
              le società che lo fanno crescere.
            </p>

            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {PARTS.map((part, i) => (
                <li
                  key={part.t}
                  className="flex flex-col rounded-3xl bg-kp-surface p-6 shadow-[0_18px_45px_-30px_rgba(5,5,7,0.35)] ring-1 ring-black/5"
                >
                  <span className="font-display text-sm font-semibold tabular-nums text-kp-red">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 font-display text-xl font-semibold text-kp-hi">{part.t}</h3>
                  <p className="mt-2 flex-1 leading-relaxed text-kp-mid">{part.b}</p>
                  <Link
                    href={part.href}
                    className="group mt-5 inline-flex w-fit items-center gap-2 text-sm font-semibold text-kp-hi underline decoration-kp-red decoration-2 underline-offset-4"
                  >
                    {part.cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                  </Link>
                </li>
              ))}
            </ol>

            <div className="mt-10">
              <Link href="/#percorsi" className={AUDIENCE_PRIMARY_CTA}>
                Inizia il tuo percorso
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
      <JsonLd
        nodes={audienceJsonLd({
          name: 'Chi siamo',
          path: '/chi-siamo',
          extra: aboutPageJsonLd({
            path: '/chi-siamo',
            founder: {
              name: 'Francesco Borrelli',
              jobTitle: 'Fondatore di KaiPai · Ideatore del Metodo KaiPai',
              description:
                'Mental coach sportivo certificato ACSI–CONI e autore. Dal 2014 accompagna atleti verso Olimpiadi e Mondiali e ragazzi dal settore giovanile all’esordio tra i professionisti.',
              image: '/founder.jpg',
              knowsAbout: ['Mental coaching sportivo', 'Preparazione mentale', 'Sport giovanile'],
            },
          }),
        })}
      />
    </div>
  );
}
