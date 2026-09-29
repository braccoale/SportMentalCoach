import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { ScrollProgress } from '@/components/landing/smooth-scroll';
import { SnapScroll } from '@/components/landing/snap-scroll';
import { Footer } from '@/components/footer';
import { JsonLd } from '@/components/json-ld';
import {
  AudienceFaq,
  FAQ_SECONDARY_LINK,
} from '@/components/landing/audience-paths/audience-faq';
import { DemoRequestButton } from '@/components/landing/demo-request-button';
import {
  audienceJsonLd,
  audienceMetadata,
} from '@/components/landing/audience-paths/audience-seo';
import { courseJsonLd } from '@/lib/core/seo';
import { ACADEMY_FAQ } from '@/components/landing/audience-paths/audience-faqs';
import { AudiencePathsDock } from '@/components/landing/audience-paths/audience-paths-dock';
import {
  AudiencePageHero,
  AUDIENCE_PRIMARY_CTA,
  AUDIENCE_SECONDARY_LINK,
} from '@/components/landing/audience-paths/audience-page-hero';

export const metadata: Metadata = audienceMetadata({
  path: '/academy',
  title: 'KaiPai Academy — Formazione per mental coach sportivi',
  description:
    'Formazione in mental coaching sportivo: corsi in moduli online e in presenza, sessioni live con mentor esperti e attestato di completamento.',
  shareTitle: 'KaiPai Academy',
  shareDescription:
    'Formazione che lascia il segno: come si formano i mental coach KaiPai.',
  image: '/og/academy.jpg',
});

const SIGNUP = '/sign-up?ruolo=coach';

/** Il percorso di un coach KaiPai, dalla candidatura in poi. */
const PATH = ['Selezione', 'Formazione', 'Supervisione', 'Crescita continua'];

/**
 * Com'è fatto un corso. Moduli, sessioni live, materiali, riepiloghi e
 * avanzamento sono nel prodotto; «in presenza» e «attestato» sono
 * dell'attività reale dell'Academy (confermati dal titolare, 2026-09-27) e non
 * passano dalla piattaforma.
 */
const COURSE = [
  {
    t: 'Corsi in moduli',
    b: 'Ogni corso è diviso in moduli con obiettivi chiari, da affrontare in ordine.',
  },
  {
    t: 'Sessioni live con i docenti',
    b: 'Si lavora in videochiamata con coach esperti che fanno da mentor, non davanti a un video registrato.',
  },
  {
    t: 'Materiali per ogni modulo',
    b: 'Letture, schede ed esercizi allegati al modulo, sempre a portata di mano.',
  },
  {
    t: 'Il riepilogo di ogni sessione',
    b: 'Dopo la sessione trovi i punti chiave, per ripassare invece di ricordare a memoria.',
  },
  {
    t: 'Online e in presenza',
    b: 'Le sessioni si seguono in videochiamata da dove sei; alcuni momenti del percorso si svolgono in presenza.',
  },
  {
    t: 'Attestato di completamento',
    b: 'Alla fine del percorso ricevi un attestato che ne certifica la frequenza.',
  },
];


export default function AcademyPage() {
  return (
    <div className="kp-root kp-snap-page flex min-h-screen flex-col bg-kp-ink text-kp-hi">
      <SnapScroll />
      <ScrollProgress />
      <SiteNav />

      <main className="kp-alt flex-1">
        <AudiencePageHero
          id="academy"
          eyebrow="KaiPai Academy · Formazione per mental coach"
          lead="Formazione che lascia"
          emphasis="il segno."
          text="Percorsi formativi dedicati al mental coaching sportivo, con contenuti pratici, mentor esperti e una community di professionisti."
          position="60% 60%"
          actions={
            <>
              <Link href={SIGNUP} className={AUDIENCE_PRIMARY_CTA}>
                Candidati come coach
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#corso" className={AUDIENCE_SECONDARY_LINK}>
                Com’è fatto un corso
                <ArrowRight className="h-4 w-4" />
              </a>
            </>
          }
        >
          {/* «Il percorso»: stava in una sezione a sé, ora chiude la prima
              schermata — le quattro tappe dopo la candidatura. */}
          <div className="mt-10 border-t border-white/15 pt-7">
            <h2 className="kp-eyebrow text-kp-red">Il percorso</h2>
            <p className="mt-3 max-w-3xl font-display text-xl font-semibold text-kp-hi sm:text-2xl">
              Non scegliamo i coach. <span className="text-kp-red">Li formiamo.</span>
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-kp-mid">
              Si entra con la candidatura, si cresce con la formazione e la
              supervisione di chi lo fa da anni.
            </p>
            <ol className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {PATH.map((step, i) => (
                <li
                  key={step}
                  className="rounded-2xl border border-white/10 bg-kp-ink/60 p-4 backdrop-blur-sm"
                >
                  <span className="font-display text-sm font-semibold tabular-nums text-kp-red">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-2 font-display text-lg font-semibold text-kp-hi">{step}</h3>
                </li>
              ))}
            </ol>
          </div>
        </AudiencePageHero>

        {/* Com'è fatto un corso */}
        <section id="corso" className="relative isolate scroll-mt-24 overflow-hidden py-10 sm:py-12">
          {/* La foto è lo sfondo dell’angolo in basso a sinistra: tocca i bordi
              della finestra e sfuma solo verso l’alto e verso destra. */}
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 left-0 -z-10 hidden aspect-[805/465] w-[56%] lg:block"
            style={{
              maskImage: 'linear-gradient(to right, black 55%, transparent), linear-gradient(to bottom, transparent, black 30%)',
              maskComposite: 'intersect',
              WebkitMaskImage: 'linear-gradient(to right, black 55%, transparent), linear-gradient(to bottom, transparent, black 30%)',
              WebkitMaskComposite: 'source-in',
            }}
          >
            <Image
              src="/landing/audience/academy-corso.webp"
              alt=""
              fill
              sizes="56vw"
              className="object-cover"
            />
          </div>
          <div className="mx-auto grid w-full max-w-7xl items-start gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <p className="kp-eyebrow flex items-center gap-3 text-kp-red">
                <span className="h-px w-10 bg-kp-red" aria-hidden />
                Com’è fatto un corso
              </p>
              <h2 className="kp-display mt-4 text-[clamp(2rem,3.8vw,3.25rem)] leading-[0.98] text-kp-hi">
                Pratica, non teoria da manuale.
              </h2>
              <p className="mt-4 max-w-lg leading-relaxed text-kp-mid">
                Ogni percorso è pensato per aiutarti ad applicare subito ciò che
                impari: moduli chiari, confronto con i docenti, materiali utili e
                momenti pratici.
              </p>
              <div className="mt-6">
                <Link href={SIGNUP} className={AUDIENCE_PRIMARY_CTA}>
                  Candidati come coach
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
              <div className="mt-4">
                <DemoRequestButton
                  plain
                  label="Hai domande? Parla con noi"
                  className={FAQ_SECONDARY_LINK}
                />
              </div>
            </div>

            <ol className="flex flex-col gap-2.5">
              {COURSE.map((c, i) => (
                <li
                  key={c.t}
                  className="flex gap-4 rounded-2xl bg-kp-surface px-5 py-3.5 sm:gap-6 sm:px-6 shadow-[0_18px_45px_-30px_rgba(5,5,7,0.35)] ring-1 ring-black/5"
                >
                  <span className="w-6 shrink-0 pt-1 font-display text-sm font-semibold tabular-nums text-kp-red">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="border-l border-kp-line pl-4 sm:pl-6">
                    <h3 className="font-display text-base font-semibold text-kp-hi">{c.t}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-kp-mid">{c.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <AudienceFaq
          id="faq"
          title="Per l’"
          emphasis="Academy"
          intro="Qui trovi le risposte essenziali alle domande più comuni sui corsi dell’Academy, per iniziare il tuo percorso con consapevolezza e serenità."
          faq={ACADEMY_FAQ}
          tone="light"
          photo={{ src: '/landing/audience/faq-academy-badge.webp', alt: '', layout: 'portrait' }}
          action={
            <Link href={SIGNUP} className={AUDIENCE_PRIMARY_CTA}>
              Candidati come coach
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          }
          secondary={
            <DemoRequestButton
              plain
              label="Hai ancora dubbi? Parla con noi"
              className={FAQ_SECONDARY_LINK}
            />
          }
        />

      </main>

      <Footer />
      <AudiencePathsDock current="academy" />
      <JsonLd
        nodes={audienceJsonLd({
          name: 'Academy',
          path: '/academy',
          faq: ACADEMY_FAQ,
          extra: [
            courseJsonLd({
              name: 'KaiPai Academy — Formazione in mental coaching sportivo',
              description:
                'Corsi in moduli con sessioni live, materiali e riepiloghi, guidati da mentor esperti; attestato di completamento.',
              path: '/academy',
              modes: ['online', 'onsite'],
            }),
          ],
        })}
      />
    </div>
  );
}
