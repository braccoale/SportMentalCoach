import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { ScrollProgress } from '@/components/landing/smooth-scroll';
import { SnapScroll } from '@/components/landing/snap-scroll';
import { Footer } from '@/components/footer';
import { JsonLd } from '@/components/json-ld';
import { AudienceFaq } from '@/components/landing/audience-paths/audience-faq';
import {
  audienceJsonLd,
  audienceMetadata,
} from '@/components/landing/audience-paths/audience-seo';
import { courseJsonLd } from '@/lib/core/seo';
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

const WRAP = 'mx-auto w-full max-w-6xl px-5 sm:px-8';
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
    b: 'Chi completa il corso riceve un attestato che ne certifica la frequenza.',
  },
  {
    t: 'Avanzamento visibile',
    b: 'La partecipazione alle sessioni completa i moduli: sai sempre a che punto sei del corso.',
  },
];

const FAQ = [
  {
    q: 'Chi può seguire i corsi dell’Academy?',
    a: 'Chi si candida come coach KaiPai. Il team valuta il profilo e assegna i corsi del percorso: l’Academy è la strada con cui un professionista entra a lavorare sulla piattaforma.',
  },
  {
    q: 'I corsi sono online o in presenza?',
    a: 'Entrambi. Le sessioni live si seguono in videochiamata da dove sei; alcuni momenti del percorso si svolgono in presenza.',
  },
  {
    q: 'Si riceve un attestato?',
    a: 'Sì: chi completa il corso riceve un attestato di completamento. Non sostituisce titoli o abilitazioni professionali.',
  },
  {
    q: 'Chi sono i docenti?',
    a: 'Coach esperti che fanno da mentor: guidano le sessioni live e seguono i partecipanti lungo i moduli.',
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
        />

        {/* Il percorso — una riga di tipografia */}
        <section className="bg-kp-ink2 py-20 sm:py-28">
          <div className={WRAP}>
            <p className="kp-eyebrow text-kp-red">Il percorso</p>
            <h2 className="kp-display mt-4 max-w-3xl text-[clamp(1.75rem,4vw,3rem)] text-kp-hi">
              Non scegliamo i coach. <span className="text-kp-red">Li formiamo.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-kp-mid">
              L’Academy è la strada con cui un professionista diventa coach
              KaiPai: si entra con la candidatura, si cresce con la formazione e
              la supervisione di chi lo fa da anni.
            </p>
            <ol className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-kp-line sm:grid-cols-2 lg:grid-cols-4">
              {PATH.map((step, i) => (
                <li key={step} className="bg-kp-ink2 p-7">
                  <span className="font-display text-sm font-semibold tabular-nums text-kp-red">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <p className="mt-3 font-display text-xl font-semibold text-kp-hi">
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Com'è fatto un corso */}
        <section id="corso" className="scroll-mt-24 py-20 sm:py-28">
          <div className={`${WRAP} grid gap-14 lg:grid-cols-[1fr_1.5fr]`}>
            <div>
              <p className="kp-eyebrow text-kp-red">Com’è fatto un corso</p>
              <h2 className="kp-display mt-4 text-[clamp(1.75rem,4vw,3rem)] text-kp-hi">
                Pratica, non teoria da manuale.
              </h2>
            </div>
            <ol className="border-t border-kp-line">
              {COURSE.map((c, i) => (
                <li key={c.t} className="flex gap-6 border-b border-kp-line py-7">
                  <span className="font-display text-sm font-semibold tabular-nums text-kp-red">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-kp-hi">
                      {c.t}
                    </h3>
                    <p className="mt-2 leading-relaxed text-kp-mid">{c.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <AudienceFaq title="Prima di" emphasis="candidarti" faq={FAQ} />

        {/* Chiusura */}
        <section className="border-t border-kp-line bg-kp-ink2 py-20 sm:py-24">
          <div className={`${WRAP} flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-end`}>
            <div className="max-w-2xl">
              <h2 className="kp-display text-[clamp(1.5rem,3.5vw,2.5rem)] text-kp-hi">
                Vuoi diventare coach KaiPai?
              </h2>
              <p className="mt-4 text-kp-mid">
                Si parte dalla candidatura: il team valuta il profilo e ti
                accompagna nel percorso dell’Academy.
              </p>
            </div>
            <Link href={SIGNUP} className={AUDIENCE_PRIMARY_CTA}>
              Candidati come coach
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </section>

      </main>

      <Footer />
      <AudiencePathsDock current="academy" />
      <JsonLd
        nodes={audienceJsonLd({
          name: 'Academy',
          path: '/academy',
          faq: FAQ,
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
