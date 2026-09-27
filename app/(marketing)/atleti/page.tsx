import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { Footer } from '@/components/footer';
import { AudiencePathsDock } from '@/components/landing/audience-paths/audience-paths-dock';
import {
  AudiencePageHero,
  AUDIENCE_PRIMARY_CTA,
  AUDIENCE_SECONDARY_LINK,
} from '@/components/landing/audience-paths/audience-page-hero';

export const metadata: Metadata = {
  title: 'Atleti — Mental coaching per lo sport | KaiPai',
  description:
    'Concentrazione, pressione, motivazione e routine pre-gara con un mental coach sportivo: come scegliere il coach, prenotare una seduta in videochiamata e seguire il tuo percorso.',
  openGraph: {
    title: 'KaiPai per gli atleti',
    description:
      'Più forte nella testa, più lontano nel tuo sport: il mental coaching sportivo, passo per passo.',
    type: 'website',
  },
};

const WRAP = 'mx-auto max-w-6xl px-5 sm:px-8';

/** Su cosa si lavora: temi di coaching, non funzioni del prodotto. */
const FOCUS = [
  {
    t: 'Concentrazione',
    b: 'Restare dentro la gara quando intorno succede di tutto: rumore, errori, un risultato che cambia.',
  },
  {
    t: 'Gestione della pressione',
    b: 'Trasformare l’ansia pre-gara in energia utile, invece di subirla.',
  },
  {
    t: 'Motivazione',
    b: 'Ritrovare il perché nei momenti in cui allenarsi costa di più: un infortunio, una stagione storta.',
  },
  {
    t: 'Routine pre-gara',
    b: 'Costruire un rituale tuo, che ti metta nella condizione giusta ogni volta che entri in campo.',
  },
];

/** Come funziona su KaiPai: ogni passo corrisponde al prodotto di oggi. */
const STEPS = [
  {
    t: 'Scegli il tuo coach',
    b: 'Nell’elenco dei coach KaiPai, filtrando per sport, specialità, livello e lingua.',
  },
  {
    t: 'Chiedi una seduta',
    b: 'Scegli un orario libero. È una richiesta: nulla è dovuto finché il coach non la conferma.',
  },
  {
    t: 'Seduta in videochiamata',
    b: 'Dentro KaiPai, dal browser o dall’app. Nessun link esterno.',
  },
  {
    t: 'Il tuo percorso',
    b: 'Obiettivi e impegni concordati con il coach restano in una pagina tua, seduta dopo seduta.',
  },
];

const FAQ = [
  {
    q: 'Ho meno di 18 anni: posso iniziare?',
    a: 'Dai 15 anni puoi registrarti ed esplorare. Per richiedere sedute serve l’autorizzazione di un genitore: la piattaforma gli manda un’email con un link, e conferma in un minuto.',
  },
  {
    q: 'Le sedute vengono registrate?',
    a: 'Solo se lo accetti. Se il coach usa gli Appunti AI, ti viene chiesto il consenso prima di iniziare e puoi rifiutare: la seduta si svolge normalmente. Il riepilogo lo rivede il coach prima di condividerlo con te.',
  },
  {
    q: 'Il mental coaching è una terapia?',
    a: 'No. Allena abilità mentali legate alla prestazione sportiva. Se emerge un bisogno di natura clinica, il coach ti indirizza verso un professionista sanitario.',
  },
  {
    q: 'Quando pago?',
    a: 'La prenotazione è una richiesta: nulla è dovuto finché il coach non accetta e la seduta non è confermata.',
  },
];

export default function AtletiPage() {
  return (
    <div className="kp-root flex min-h-screen flex-col bg-kp-ink text-kp-hi">
      <SiteNav />

      <main className="flex-1">
        <AudiencePageHero
          id="athletes"
          eyebrow="Per atleti"
          lead="Più forte nella testa."
          emphasis="Più lontano nel tuo sport."
          text="Lavora su concentrazione, pressione, motivazione e routine pre-gara con il supporto di un mental coach."
          position="72% 30%"
          actions={
            <>
              <Link href="/coaches" className={AUDIENCE_PRIMARY_CTA}>
                Trova il tuo coach
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#come-funziona" className={AUDIENCE_SECONDARY_LINK}>
                Come funziona
                <ArrowRight className="h-4 w-4" />
              </a>
            </>
          }
        />

        {/* Su cosa lavori — tipografia, non card */}
        <section className="bg-kp-ink2 py-20 sm:py-28">
          <div className={`${WRAP} grid gap-14 lg:grid-cols-[1fr_1.5fr]`}>
            <div>
              <p className="kp-eyebrow text-kp-red">Su cosa lavori</p>
              <h2 className="kp-display mt-4 text-[clamp(1.75rem,4vw,3rem)] text-kp-hi">
                Il fisico lo alleni ogni giorno. La testa, quasi mai.
              </h2>
            </div>
            <ul className="border-t border-kp-line">
              {FOCUS.map((f) => (
                <li key={f.t} className="border-b border-kp-line py-7">
                  <h3 className="font-display text-xl font-semibold text-kp-hi">
                    {f.t}
                  </h3>
                  <p className="mt-2 leading-relaxed text-kp-mid">{f.b}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Come funziona */}
        <section id="come-funziona" className="scroll-mt-24 py-20 sm:py-28">
          <div className={WRAP}>
            <p className="kp-eyebrow text-kp-red">Come funziona</p>
            <h2 className="kp-display mt-4 max-w-2xl text-[clamp(1.75rem,4vw,3rem)] text-kp-hi">
              Dalla scelta del coach alla prima seduta.
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
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-kp-line bg-kp-ink2 py-20 sm:py-24">
          <div className={`${WRAP} grid gap-12 lg:grid-cols-[1fr_1.4fr]`}>
            <div>
              <p className="kp-eyebrow text-kp-red">Domande frequenti</p>
              <h2 className="kp-display mt-4 text-[clamp(1.5rem,3.5vw,2.5rem)] text-kp-hi">
                Prima di iniziare.
              </h2>
              <div className="mt-8">
                <Link href="/coaches" className={AUDIENCE_PRIMARY_CTA}>
                  Trova il tuo coach
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>
            <div className="divide-y divide-kp-line border-y border-kp-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left font-display text-base font-semibold text-kp-hi marker:content-none [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ArrowRight className="h-4 w-4 shrink-0 text-kp-red transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="pb-5 pr-8 text-sm leading-relaxed text-kp-mid">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Spazio per la barra dei percorsi, che è fissa in basso. */}
        <div aria-hidden className="h-24" />
      </main>

      <Footer />
      <AudiencePathsDock current="athletes" />
    </div>
  );
}
