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
import { AudiencePathsDock } from '@/components/landing/audience-paths/audience-paths-dock';
import {
  AudiencePageHero,
  AUDIENCE_PRIMARY_CTA,
  AUDIENCE_SECONDARY_LINK,
} from '@/components/landing/audience-paths/audience-page-hero';

export const metadata: Metadata = audienceMetadata({
  path: '/diventa-coach',
  title: 'Diventa mental coach sportivo su KaiPai',
  description:
    'Per mental coach sportivi: profilo pubblico, prenotazioni, videochiamate, Appunti AI con consenso e il percorso di ogni atleta in un unico spazio.',
  shareTitle: 'Diventa coach KaiPai',
  shareDescription:
    'Atleti, calendario, prenotazioni, videochiamate, note e storico del percorso in un unico spazio.',
  image: '/og/coaches.jpg',
});

const WRAP = 'mx-auto w-full max-w-6xl px-5 sm:px-8';
const SIGNUP = '/sign-up?ruolo=coach';
const PRIMARY = AUDIENCE_PRIMARY_CTA;

/**
 * Solo ciò che il prodotto fa oggi. Ogni riga corrisponde a una funzione in
 * produzione: se una cambia, cambia qui.
 */
const FEATURES = [
  {
    t: 'Il tuo profilo, davanti agli atleti giusti',
    b: 'Un profilo pubblico nell’elenco dei coach KaiPai, che gli atleti filtrano per sport, specialità, livello e lingua.',
  },
  {
    t: 'Disponibilità e prenotazioni',
    b: 'Imposti i tuoi orari. L’atleta chiede una seduta in uno spazio libero, tu accetti o rifiuti: nulla è confermato senza di te.',
  },
  {
    t: 'Videochiamata integrata',
    b: 'Le sedute si svolgono dentro KaiPai, dal browser o dall’app. Nessun link esterno da mandare.',
  },
  {
    t: 'Appunti AI, con il consenso dell’atleta',
    b: 'Se l’atleta acconsente, la seduta viene trascritta e riassunta in un report. Lo rivedi e lo approvi tu, prima che l’atleta lo veda.',
  },
  {
    t: 'Il percorso di ogni atleta',
    b: 'Obiettivi, impegni e andamento seduta dopo seduta, in una scheda sola invece che sparsi fra quaderni e chat.',
  },
  {
    t: 'Porta i tuoi atleti',
    b: 'Un link personale per invitarli su KaiPai; dalla dashboard vedi quanti si sono registrati grazie a te.',
  },
];

const STEPS = [
  { t: 'Crea l’account da coach', b: 'Pochi minuti: credenziali, dati e condizioni.' },
  {
    t: 'Completa il profilo',
    b: 'Presentazione, servizi che offri e disponibilità settimanale.',
  },
  {
    t: 'Invialo in revisione',
    b: 'Il team KaiPai controlla il profilo prima di pubblicarlo.',
  },
  {
    t: 'Ricevi le prime richieste',
    b: 'Dall’approvazione sei visibile agli atleti e puoi fissare appuntamenti.',
  },
];

const FAQ = [
  {
    q: 'Il profilo viene pubblicato subito?',
    a: 'No. Ogni profilo viene rivisto dal team KaiPai prima di diventare visibile agli atleti. Finché non è approvato puoi completarlo, ma non ricevere prenotazioni.',
  },
  {
    q: 'Gli Appunti AI registrano la seduta anche senza consenso?',
    a: 'No. La registrazione parte solo dopo il consenso dell’atleta, che può anche rifiutare: in quel caso la seduta si svolge normalmente, senza appunti. Il report resta tuo finché non lo approvi.',
  },
  {
    q: 'Posso lavorare con atleti minorenni?',
    a: 'Sì. Un atleta fra i 15 e i 17 anni può registrarsi, ma non può richiedere sedute finché un genitore non lo autorizza. La piattaforma gestisce la richiesta al tutore per te.',
  },
  {
    q: 'Il mental coaching su KaiPai è una terapia?',
    a: 'No. Si allenano abilità mentali legate alla prestazione sportiva. Se emerge un bisogno clinico, l’atleta va indirizzato verso un professionista sanitario.',
  },
];

export default function DiventaCoachPage() {
  return (
    <div className="kp-root kp-snap-page flex min-h-screen flex-col bg-kp-ink text-kp-hi">
      <SnapScroll />
      <ScrollProgress />
      <SiteNav />

      <main className="kp-alt flex-1">
        <AudiencePageHero
          id="coaches"
          eyebrow="Per mental coach sportivi"
          lead="Tutto il tuo lavoro,"
          emphasis="in un unico spazio."
          text="Atleti, calendario, prenotazioni, videochiamate, note e storico del percorso — senza avere il lavoro sparso tra più strumenti."
          position="75% 25%"
          actions={
            <>
              <Link href={SIGNUP} className={PRIMARY}>
                Candidati come coach
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#come-funziona" className={AUDIENCE_SECONDARY_LINK}>
                Come funziona
                <ArrowRight className="h-4 w-4" />
              </a>
            </>
          }
        />

        {/* Cosa trovi — righe numerate, non card */}
        <section className="bg-kp-ink2 py-20 sm:py-28">
          <div className={WRAP}>
            <div className="max-w-2xl">
              <p className="kp-eyebrow text-kp-red">Cosa trovi</p>
              <h2 className="kp-display mt-4 text-[clamp(1.75rem,4vw,3rem)] text-kp-hi">
                Meno strumenti. Più tempo per l’atleta.
              </h2>
            </div>
            <ol className="mt-14 grid gap-x-16 md:grid-cols-2">
              {FEATURES.map((f, i) => (
                <li
                  key={f.t}
                  className="flex gap-6 border-t border-kp-line py-8"
                >
                  <span className="font-display text-sm font-semibold tabular-nums text-kp-red">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-kp-hi">
                      {f.t}
                    </h3>
                    <p className="mt-2 leading-relaxed text-kp-mid">{f.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Come funziona */}
        <section id="come-funziona" className="scroll-mt-24 py-20 sm:py-28">
          <div className={WRAP}>
            <p className="kp-eyebrow text-kp-red">Come funziona</p>
            <h2 className="kp-display mt-4 max-w-2xl text-[clamp(1.75rem,4vw,3rem)] text-kp-hi">
              Dalla candidatura alla prima seduta.
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
            <p className="mt-14 max-w-2xl text-kp-mid">
              Vuoi formarti prima di iniziare?{' '}
              <a
                href="/#academy"
                className="font-semibold text-kp-hi underline decoration-kp-red decoration-2 underline-offset-4"
              >
                Scopri la KaiPai Academy
              </a>
              .
            </p>
          </div>
        </section>

        <AudienceFaq
          title="Prima di candidarti."
          faq={FAQ}
          action={
            <Link href={SIGNUP} className={PRIMARY}>
              Candidati come coach
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          }
        />
      </main>

      <Footer />
      <AudiencePathsDock current="coaches" />
      <JsonLd nodes={audienceJsonLd({ name: 'Diventa coach', path: '/diventa-coach', faq: FAQ })} />
    </div>
  );
}
