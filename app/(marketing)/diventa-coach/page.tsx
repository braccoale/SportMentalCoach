import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  FilePen,
  GraduationCap,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { ScrollProgress } from '@/components/landing/smooth-scroll';
import { SnapScroll } from '@/components/landing/snap-scroll';
import { Footer } from '@/components/footer';
import { JsonLd } from '@/components/json-ld';
import {
  AudienceFaq,
  FAQ_SECONDARY_LINK,
  type FaqItem,
} from '@/components/landing/audience-paths/audience-faq';
import { DemoRequestButton } from '@/components/landing/demo-request-button';
import { CANCELLATION_NOTICE_HOURS } from '@/lib/core/legal/processors';
import { INTRO_SESSION } from '@/lib/core/services/introduction';
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
  {
    t: 'Crea l’account da coach',
    b: 'Pochi minuti: credenziali, dati e condizioni per iniziare il percorso su KaiPai.',
    tag: 'Accesso',
    icon: UserRound,
  },
  {
    t: 'Completa il profilo',
    b: 'Presentazione, servizi che offri, sport seguiti e disponibilità settimanale.',
    tag: 'Profilo',
    icon: FilePen,
  },
  {
    t: 'Invialo in revisione',
    b: 'Il team KaiPai controlla il profilo prima della pubblicazione, per mantenere qualità e affidabilità.',
    tag: 'Verifica',
    icon: ShieldCheck,
  },
  {
    t: 'Ricevi le prime richieste',
    b: 'Dopo l’approvazione sei visibile agli atleti e puoi fissare appuntamenti e prime sedute.',
    tag: 'Primi clienti',
    icon: CalendarDays,
  },
];

/**
 * Le domande di un coach che valuta KaiPai. Le risposte sui soldi seguono i
 * Termini (§ 9): oggi la piattaforma non gestisce pagamenti fra atleta e
 * coach. Se il modello cambia, cambiano prima i Termini e poi queste righe.
 */
const FAQ: FaqItem[] = [
  {
    q: 'Il profilo viene pubblicato subito?',
    a: 'No. Ogni profilo viene rivisto dal team KaiPai prima di diventare visibile agli atleti. Finché non è approvato puoi completarlo, ma non ricevere prenotazioni.',
  },
  {
    q: 'Come funziona la revisione del profilo?',
    a: 'Il team KaiPai controlla il profilo prima della pubblicazione: completezza delle informazioni, chiarezza della presentazione e documentazione di identità e certificazioni che indichi, di cui resti garante. Se manca qualcosa te lo diciamo, e puoi correggerlo.',
  },
  {
    q: 'Quanto costa usare KaiPai?',
    a: 'Oggi candidarsi e usare la piattaforma non ha costi per il coach, e non ti chiediamo dati di pagamento. Se in futuro verranno introdotte funzioni a pagamento, le condizioni saranno aggiornate e comunicate prima dell’attivazione.',
  },
  {
    q: 'Come vengo pagato per le sedute?',
    a: 'KaiPai oggi non incassa né gira pagamenti fra atleta e coach: l’accesso alle sedute passa da accordi con club e organizzazioni. Il rapporto professionale resta fra te e chi segui, e sei tu il professionista indipendente che lo gestisce. Quando la piattaforma introdurrà i pagamenti, le regole saranno pubblicate prima.',
  },
  {
    q: 'Quando inizio a ricevere richieste dagli atleti?',
    a: 'Dal momento in cui il profilo è approvato: compari nella lista dei coach, e gli atleti possono chiederti una seduta negli orari che hai reso disponibili. Nulla è confermato finché non accetti tu.',
  },
  {
    q: 'Cos’è la sessione conoscitiva gratuita?',
    a: `Ogni coach ha una sessione conoscitiva di ${INTRO_SESSION.durationMin} minuti, gratuita, in videochiamata: è il primo incontro con un atleta nuovo, per conoscervi e parlare dei suoi obiettivi. Ogni atleta può richiederla una volta per coach.`,
  },
  {
    q: 'Decido io orari e appuntamenti?',
    a: `Sì. Imposti la tua disponibilità settimanale e accetti o rifiuti ogni richiesta. Con un atleta che già segui puoi anche proporre tu un appuntamento, e spostarlo se serve. Le sedute si possono annullare fino al loro svolgimento: è buona norma farlo con almeno ${CANCELLATION_NOTICE_HOURS} ore di preavviso.`,
  },
  {
    q: 'Posso portare su KaiPai gli atleti che seguo già?',
    a: 'Sì. Hai un link personale per invitarli, e dalla dashboard vedi quanti si sono registrati grazie a te.',
  },
  {
    q: 'Gli Appunti AI registrano la seduta anche senza consenso?',
    a: 'No. La registrazione parte solo dopo il consenso dell’atleta, che può anche rifiutare: in quel caso la seduta si svolge normalmente, senza appunti. Il report lo rivedi e lo approvi tu prima che l’atleta lo veda.',
  },
  {
    q: 'Posso lavorare con atleti minorenni?',
    a: 'Sì. Un atleta fra i 15 e i 17 anni può registrarsi, ma non può richiedere sedute finché un genitore o il tutore legale non lo autorizza: la piattaforma gestisce la richiesta per te. Sai che l’atleta è minorenne prima di accettare, e per registrare la seduta serve un’autorizzazione a parte.',
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
        >
          {/* «Cosa trovi»: stava in una sezione a sé, ora chiude la prima
              schermata — è il dettaglio di «tutto in un unico spazio». */}
          <div className="mt-10 border-t border-white/15 pt-7">
            <p className="kp-eyebrow text-kp-red">Cosa trovi</p>
            <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <li
                  key={f.t}
                  className="flex gap-4 rounded-2xl border border-white/10 bg-kp-ink/60 p-4 backdrop-blur-sm"
                >
                  <span className="font-display text-sm font-semibold tabular-nums text-kp-red">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h2 className="font-display text-[0.95rem] font-semibold leading-snug text-kp-hi">
                      {f.t}
                    </h2>
                    <p className="mt-1 text-[0.8rem] leading-relaxed text-kp-mid">{f.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </AudiencePageHero>

        {/* Come funziona */}
        <section id="come-funziona" className="relative isolate scroll-mt-24 overflow-hidden pt-14 pb-28">
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 -z-10 hidden aspect-[642/436] w-[42%] lg:block"
          >
            <Image
              src="/landing/audience/come-funziona-coach.webp"
              alt=""
              fill
              sizes="42vw"
              className="object-cover"
            />
            <div className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-kp-ink2 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-kp-ink2 to-transparent" />
          </div>

          <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
            <p className="kp-eyebrow flex items-center gap-3 text-kp-mid">
              <span className="h-px w-10 bg-kp-red" aria-hidden />
              Come funziona
            </p>
            <h2 className="kp-display mt-5 max-w-2xl text-[clamp(2.25rem,5vw,4.25rem)] leading-[0.98] text-kp-hi">
              Dalla candidatura <br className="hidden sm:block" />
              alla prima seduta<span className="text-kp-red">.</span>
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-kp-mid">
              In pochi passaggi entri su KaiPai, completi il profilo e inizi a
              ricevere richieste dagli atleti.
            </p>

            <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {STEPS.map((step, i) => (
                <li key={step.t} className="relative flex">
                  <article className="flex w-full flex-col rounded-3xl bg-kp-surface p-6 shadow-[0_24px_60px_-30px_rgba(5,5,7,0.35)] ring-1 ring-black/5">
                    <div className="flex items-center gap-5">
                      <span className="kp-display text-4xl leading-none tabular-nums text-kp-mid/50">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-kp-ink2">
                        <step.icon className="h-6 w-6 text-kp-hi" aria-hidden />
                      </span>
                    </div>
                    <h3 className="mt-6 font-display text-lg font-semibold text-kp-hi">{step.t}</h3>
                    <p className="mt-2 flex-1 text-sm leading-relaxed text-kp-mid">{step.b}</p>
                    <span className="mt-5 w-fit rounded-full bg-kp-ink2 px-4 py-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-kp-hi">
                      {step.tag}
                    </span>
                  </article>
                  {i < STEPS.length - 1 ? (
                    <ArrowRight
                      aria-hidden
                      className="absolute -right-6 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-kp-hi lg:block"
                    />
                  ) : null}
                </li>
              ))}
            </ol>

            <div className="mt-10 flex items-center gap-5 border-t border-kp-line pt-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-kp-surface ring-1 ring-black/5">
                <GraduationCap className="h-5 w-5 text-kp-hi" aria-hidden />
              </span>
              <p className="text-kp-mid">
                Vuoi formarti prima di iniziare?{' '}
                <Link
                  href="/academy"
                  className="group inline-flex items-center gap-2 font-medium text-kp-red underline decoration-1 underline-offset-[6px]"
                >
                  Scopri la KaiPai Academy.
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
                </Link>
              </p>
            </div>
          </div>
        </section>

        <AudienceFaq
          id="faq"
          title="Prima di"
          emphasis="candidarti"
          intro="Qui trovi le risposte essenziali alle domande più comuni dei coach, per iniziare il tuo percorso su KaiPai con chiarezza e serenità."
          faq={FAQ}
          tone="light"
          photo={{ src: '/landing/audience/faq-coach.webp', alt: '' }}
          action={
            <Link href={SIGNUP} className={PRIMARY}>
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
      <AudiencePathsDock current="coaches" />
      <JsonLd nodes={audienceJsonLd({ name: 'Diventa coach', path: '/diventa-coach', faq: FAQ })} />
    </div>
  );
}
