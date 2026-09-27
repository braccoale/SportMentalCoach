import type { Metadata } from 'next';
import { ArrowRight } from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { Footer } from '@/components/footer';
import { AudiencePathsDock } from '@/components/landing/audience-paths/audience-paths-dock';
import {
  AudiencePageHero,
  AUDIENCE_SECONDARY_LINK,
} from '@/components/landing/audience-paths/audience-page-hero';
import { DemoRequestButton } from '@/components/landing/demo-request-button';
import { COACHING_PACKAGES } from '@/lib/core/pricing';

export const metadata: Metadata = {
  alternates: { canonical: '/societa' },
  title: 'Mental coaching per società sportive e squadre | KaiPai',
  description:
    'Mental coaching per società sportive, squadre e settori giovanili: lavoro con gli atleti, supporto allo staff, workshop per le famiglie.',
  openGraph: {
    title: 'KaiPai per società sportive e academy',
    description:
      'Squadre più unite, obiettivi più grandi: la crescita mentale dentro il progetto tecnico del club.',
    type: 'website',
  },
};

const WRAP = 'mx-auto max-w-6xl px-5 sm:px-8';

const PILLARS = [
  {
    t: 'Percorsi per squadre e gruppi',
    b: 'Sedute individuali e lavoro di gruppo sulla gestione della pressione, la concentrazione e la coesione dello spogliatoio.',
  },
  {
    t: 'Supporto a tecnici e staff',
    b: 'Il mental coach lavora accanto all’allenatore, non al suo posto: un linguaggio comune per chi guida la squadra.',
  },
  {
    t: 'Il vivaio e le famiglie',
    b: 'Per i settori giovanili, workshop dedicati a staff e genitori: la crescita di un ragazzo passa anche da casa.',
  },
  {
    t: 'Programmi su misura',
    b: 'Obiettivi, frequenza e forma del percorso si decidono con la società, in base alla categoria e alla stagione.',
  },
];

const STEPS = [
  { t: 'Una chiamata conoscitiva', b: 'Ci racconti la società, la squadra e il momento della stagione.' },
  { t: 'Analisi dei bisogni', b: 'Atleti, staff e obiettivi: dove serve lavorare e con quale priorità.' },
  { t: 'Il programma', b: 'Ti proponiamo un percorso su misura, con tempi e modalità chiari.' },
  { t: 'Avvio e verifiche', b: 'Si parte, e lungo la stagione si fa il punto con lo staff.' },
];

export default function SocietaPage() {
  return (
    <div className="kp-root flex min-h-screen flex-col bg-kp-ink text-kp-hi">
      <SiteNav />

      <main className="flex-1">
        <AudiencePageHero
          id="teams"
          layout="full"
          eyebrow="Per squadre e academy"
          lead="Squadre più unite."
          emphasis="Obiettivi più grandi."
          text="Per società sportive, squadre e academy che vogliono investire sulla crescita mentale dei propri atleti, dentro il progetto tecnico."
          position="55% 88%"
          actions={
            <>
              <DemoRequestButton />
              <a href="#percorsi-club" className={AUDIENCE_SECONDARY_LINK}>
                I percorsi per i club
                <ArrowRight className="h-4 w-4" />
              </a>
            </>
          }
        />

        {/* Cosa portiamo — righe, non card */}
        <section className="bg-kp-ink2 py-20 sm:py-28">
          <div className={`${WRAP} grid gap-14 lg:grid-cols-[1fr_1.5fr]`}>
            <div>
              <p className="kp-eyebrow text-kp-red">Cosa portiamo</p>
              <h2 className="kp-display mt-4 text-[clamp(1.75rem,4vw,3rem)] text-kp-hi">
                La testa si allena come il fisico: con metodo, in squadra.
              </h2>
            </div>
            <ul className="border-t border-kp-line">
              {PILLARS.map((p) => (
                <li key={p.t} className="border-b border-kp-line py-7">
                  <h3 className="font-display text-xl font-semibold text-kp-hi">
                    {p.t}
                  </h3>
                  <p className="mt-2 leading-relaxed text-kp-mid">{p.b}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* I percorsi per i club — dallo stesso listino di /pricing.md */}
        <section id="percorsi-club" className="scroll-mt-24 py-20 sm:py-28">
          <div className={WRAP}>
            <p className="kp-eyebrow text-kp-red">I percorsi per i club</p>
            <h2 className="kp-display mt-4 max-w-2xl text-[clamp(1.75rem,4vw,3rem)] text-kp-hi">
              Tre livelli, dalla prima squadra al vivaio.
            </h2>
            <div className="mt-14 grid gap-px overflow-hidden rounded-3xl bg-kp-line md:grid-cols-3">
              {COACHING_PACKAGES.map((pkg) => (
                <article key={pkg.key} className="flex flex-col bg-kp-ink p-8">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-kp-mid">
                    {pkg.target}
                  </p>
                  <h3 className="mt-4 font-display text-2xl font-semibold leading-tight text-kp-hi">
                    {pkg.name}
                  </h3>
                  <p className="mt-3 leading-relaxed text-kp-mid">{pkg.description}</p>
                  <ul className="mt-6 space-y-2 border-t border-kp-line pt-6 text-sm text-kp-hi">
                    {pkg.features.map((f) => (
                      <li key={f} className="flex gap-3">
                        <span className="mt-2 h-1 w-3 shrink-0 bg-kp-red" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Come funziona + chiusura */}
        <section className="border-t border-kp-line bg-kp-ink2 py-20 sm:py-28">
          <div className={WRAP}>
            <p className="kp-eyebrow text-kp-red">Come si parte</p>
            <h2 className="kp-display mt-4 max-w-2xl text-[clamp(1.75rem,4vw,3rem)] text-kp-hi">
              Dalla prima chiamata alla stagione.
            </h2>
            <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.t}>
                  <span className="kp-display block text-6xl leading-none text-kp-hi/15">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold text-kp-hi">
                    {s.t}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-kp-mid">{s.b}</p>
                </li>
              ))}
            </ol>
            <p className="mt-12 max-w-2xl text-sm leading-relaxed text-kp-mid">
              Con i settori giovanili, ogni atleta minorenne partecipa solo con
              l’autorizzazione di un genitore, che la piattaforma richiede e
              registra per ciascun ragazzo.
            </p>
            <div className="mt-10">
              <DemoRequestButton />
            </div>
          </div>
        </section>
        {/* Spazio per la barra dei percorsi, che è fissa in basso. */}
        <div aria-hidden className="h-24" />
      </main>

      <Footer />
      <AudiencePathsDock current="teams" />
    </div>
  );
}
