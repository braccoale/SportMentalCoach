import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  HeartHandshake,
  Scale,
  ShieldCheck,
  Sprout,
  Lock,
  MessageSquare,
} from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { Footer } from '@/components/footer';

export const metadata: Metadata = {
  title: 'Famiglie — Accompagnare tuo figlio | KaiPai',
  description:
    'Il ruolo dei genitori nel percorso mentale di un giovane atleta: meno pressione, più fiducia. Tutela dei minori, consenso e riservatezza spiegati con chiarezza.',
  openGraph: {
    title: 'KaiPai per le famiglie — Accompagnare tuo figlio',
    description:
      'Come i genitori possono sostenere la crescita mentale di un giovane atleta. Consenso, minori e riservatezza spiegati con chiarezza.',
    type: 'website',
  },
};

const WRAP = 'mx-auto max-w-5xl px-5 sm:px-8';

/** Parent-role pillars. */
const ROLE = [
  {
    icon: HeartHandshake,
    t: 'Meno pressione, più fiducia',
    b: 'La spinta a “rendere” pesa più di quanto sembri. Il tuo sostegno vale di più quando è incondizionato: ci sei nella vittoria e nella sconfitta.',
  },
  {
    icon: MessageSquare,
    t: 'Sei un alleato, non un giudice',
    b: 'Dopo la partita la domanda giusta non è “quanti gol hai fatto?” ma “ti sei divertito?”. Il coach lavora sulla testa; tu proteggi la serenità.',
  },
  {
    icon: Sprout,
    t: 'Rispetta i suoi tempi',
    b: 'La crescita mentale non è lineare. Accompagnare significa dare spazio, non accelerare: gli obiettivi restano suoi, non tuoi.',
  },
];

/** FAQ dedicated to minors, consent and confidentiality. */
const FAQ = [
  {
    q: 'Mio figlio è minorenne: serve il mio consenso?',
    a: 'Sì, ed è la piattaforma stessa a chiederlo: un atleta fra i 15 e i 17 anni può registrarsi ed esplorare, ma non può richiedere sessioni finché non autorizzi tu. Ricevi un’email con un link, leggi cosa stai autorizzando e confermi in un minuto, senza creare un account. Il consenso privacy, invece, il ragazzo lo presta da sé: dai 14 anni la legge italiana glielo riconosce.',
  },
  {
    q: 'Cosa mi viene condiviso delle sessioni?',
    a: 'Non la trascrizione dei contenuti: uno spazio riservato è ciò che permette al ragazzo di aprirsi, ed è quello che rende utile il coaching. Puoi però chiedere al coach un confronto sull’andamento generale e sugli obiettivi di lavoro, e resti il referente per tutto ciò che riguarda il percorso. Se emerge qualcosa che riguarda la sua sicurezza, vieni sempre coinvolto.',
  },
  {
    q: 'Le sessioni sono riservate?',
    a: 'Sì. I contenuti condivisi dal ragazzo con il coach sono trattati con riservatezza. La riservatezza non è mai un ostacolo alla tutela: in situazioni che riguardano la salute o l’incolumità del minore, il coach agisce nell’interesse del ragazzo e coinvolge la famiglia.',
  },
  {
    q: 'Posso assistere alle sessioni?',
    a: 'Per i più piccoli concordiamo insieme al coach la modalità più adatta. Con gli adolescenti, di norma, uno spazio autonomo funziona meglio: resti comunque il primo riferimento e sei aggiornato sul percorso.',
  },
  {
    q: 'Il mental coaching è una terapia psicologica?',
    a: 'No. Il mental coaching allena abilità mentali legate alla performance sportiva (concentrazione, gestione della pressione, fiducia) e non sostituisce un percorso clinico o psicoterapeutico. Se emerge un bisogno di natura clinica, ti indirizziamo verso il supporto appropriato.',
  },
  {
    q: 'Come vengono trattati i dati di mio figlio?',
    a: 'Trattiamo i dati nel rispetto del GDPR, solo per erogare il servizio. Puoi accedere ai dati, chiederne la rettifica o la cancellazione in ogni momento scrivendo a privacy@kaipai.it. I dettagli sono nella Privacy Policy.',
  },
  {
    q: 'I coach sono verificati?',
    a: 'Sì. Ogni coach è approvato dal nostro team e le guide certificate sono formate dalla KaiPai Academy. Identità, credenziali ed esperienza sono controllate prima della pubblicazione del profilo.',
  },
];

export default function FamigliePage() {
  return (
    <div className="kp-root flex min-h-screen flex-col bg-kp-ink text-kp-hi">
      <SiteNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-kp-line pt-28 pb-16 sm:pt-32 sm:pb-20">
          <div className="kp-vignette absolute inset-0" />
          <div className={`relative ${WRAP}`}>
            <p className="kp-eyebrow text-kp-red">Per le famiglie</p>
            <h1 className="kp-display mt-4 max-w-3xl text-[clamp(2rem,5vw,3.5rem)] leading-tight text-kp-hi">
              Dietro ogni giovane atleta,{' '}
              <span className="text-kp-red">una famiglia</span>.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-kp-mid">
              La testa di tuo figlio si allena anche fuori dal campo — a casa, nel
              modo in cui gli parli dopo una partita. Non devi essere il suo coach:
              devi essere il suo posto sicuro. Ti aiutiamo a farlo.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/coaches"
                className="kp-cta group inline-flex items-center gap-2 rounded-full px-6 py-3.5 font-semibold text-white"
              >
                Trova una guida per tuo figlio
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#faq"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-kp-mid transition-colors hover:text-kp-hi"
              >
                Minori, consenso e riservatezza
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </section>

        {/* Il ruolo dei genitori */}
        <section className="border-b border-kp-line bg-kp-ink2 py-16 sm:py-20">
          <div className={WRAP}>
            <p className="kp-eyebrow text-kp-red">Il ruolo dei genitori</p>
            <h2 className="kp-display mt-4 max-w-2xl text-[clamp(1.5rem,3.5vw,2.5rem)] text-kp-hi">
              Il tuo sostegno è parte dell’allenamento.
            </h2>
            <p className="mt-5 max-w-2xl text-kp-mid">
              Il coach lavora sulla mente del ragazzo; tu costruisci il contesto in
              cui quella crescita mette radici. Tre principi che fanno la
              differenza.
            </p>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {ROLE.map((r) => (
                <div
                  key={r.t}
                  className="h-full rounded-2xl border border-kp-line bg-white/[0.02] p-6"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-kp-red/10 text-kp-red">
                    <r.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold text-kp-hi">
                    {r.t}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-kp-mid">{r.b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tutela — reassurance band */}
        <section className="border-b border-kp-line py-16 sm:py-20">
          <div className={WRAP}>
            <div className="grid gap-6 sm:grid-cols-3">
              {[
                {
                  icon: ShieldCheck,
                  t: 'Consenso dei genitori',
                  b: 'Per gli under 18 sei tu ad autorizzare account, prima sessione e trattamento dei dati.',
                },
                {
                  icon: Lock,
                  t: 'Riservatezza',
                  b: 'Uno spazio protetto per il ragazzo; a te l’autorizzazione del percorso e il confronto con il coach.',
                },
                {
                  icon: Scale,
                  t: 'Coach verificati & GDPR',
                  b: 'Guide approvate e certificate. Dati trattati solo per il servizio, nel rispetto del GDPR.',
                },
              ].map((p) => (
                <div key={p.t} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-kp-verify/10 text-kp-verify">
                    <p.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-display text-base font-semibold text-kp-hi">
                      {p.t}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-kp-mid">
                      {p.b}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="bg-kp-ink2 py-16 sm:py-20">
          <div className={WRAP}>
            <p className="kp-eyebrow text-kp-red">Domande frequenti</p>
            <h2 className="kp-display mt-4 text-[clamp(1.5rem,3.5vw,2.5rem)] text-kp-hi">
              Minori, consenso e riservatezza.
            </h2>
            <div className="mt-10 divide-y divide-kp-line rounded-2xl border border-kp-line bg-white/[0.02]">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-6">
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

            {/* Closing CTA */}
            <div className="mt-12 flex flex-col items-start justify-between gap-6 rounded-2xl border border-kp-red/40 bg-kp-red/[0.06] p-8 sm:flex-row sm:items-center">
              <div>
                <h3 className="font-display text-xl font-semibold text-kp-hi">
                  Pronto ad accompagnarlo nel modo giusto?
                </h3>
                <p className="mt-2 text-sm text-kp-mid">
                  Trova una guida verificata o scrivici: ti aiutiamo a scegliere il
                  percorso adatto a tuo figlio.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-3">
                <Link
                  href="/coaches"
                  className="kp-cta inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white"
                >
                  Trova una guida
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="mailto:info@kaipai.it?subject=Informazioni%20percorso%20per%20mio%20figlio"
                  className="inline-flex items-center rounded-full border border-kp-line px-6 py-3 font-semibold text-kp-hi transition-colors hover:border-kp-red/50"
                >
                  Scrivici
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
