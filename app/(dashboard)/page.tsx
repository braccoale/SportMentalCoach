import Link from 'next/link';
import { ArrowRight, Search, CalendarCheck, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoAccounts } from '@/components/demo-accounts';
import { getVerticalConfig, t } from '@/lib/core/config';

const STEPS = [
  {
    icon: Search,
    title: 'Trova il coach giusto',
    body: 'Sfoglia i mental coach approvati e filtra per sport e specializzazione.',
  },
  {
    icon: CalendarCheck,
    title: 'Richiedi una sessione',
    body: 'Invia una richiesta al coach con un messaggio. Lui accetta o rifiuta.',
  },
  {
    icon: Trophy,
    title: 'Allena la tua mente',
    body: 'Lavora su concentrazione, motivazione e gestione della pressione.',
  },
];

const AUDIENCES = [
  {
    title: 'Atleti',
    body: 'Migliora la performance mentale e supera i blocchi nei momenti decisivi.',
  },
  {
    title: 'Coach',
    body: 'Crea il tuo profilo, pubblica i servizi e ricevi richieste di sessione.',
  },
  {
    title: 'Club',
    body: 'Offri supporto mentale ai tuoi atleti con coach qualificati.',
  },
];

export default function HomePage() {
  const config = getVerticalConfig();
  const brand = t('brand.name', config);

  return (
    <main>
      {/* Hero */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
            {brand}
            <span className="mt-2 block text-orange-500">
              {t('brand.tagline', config)}
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-gray-500">
            La piattaforma che connette atleti, coach e club con i migliori
            mental coach. Trova un professionista, richiedi una sessione e
            allena la tua testa come alleni il corpo.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full text-lg">
              <Link href="/coaches">
                Trova un coach
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full text-lg"
            >
              <Link href="/sign-up">Inizia ora</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Come funziona
          </h2>
          <div className="mt-10 grid gap-8 lg:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.title} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-orange-500 text-white">
                  <s.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-lg font-medium text-gray-900">
                  {s.title}
                </h3>
                <p className="mt-2 text-base text-gray-500">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold text-gray-900">
            Per chi è {brand}
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {AUDIENCES.map((a) => (
              <div
                key={a.title}
                className="rounded-xl border border-gray-200 bg-white p-6"
              >
                <h3 className="text-lg font-semibold text-gray-900">
                  {a.title}
                </h3>
                <p className="mt-2 text-gray-500">{a.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA + demo accounts */}
      <section className="py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl bg-gray-900 px-6 py-10 text-center sm:px-12">
            <h2 className="text-3xl font-bold text-white">
              Pronto a iniziare?
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-gray-300">
              Crea un account come atleta, coach o club, oppure esplora subito i
              coach disponibili.
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full text-lg">
                <Link href="/sign-up">Crea un account</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full bg-white text-lg"
              >
                <Link href="/coaches">Sfoglia i coach</Link>
              </Button>
            </div>
          </div>

          <div className="mt-10">
            <DemoAccounts />
          </div>
        </div>
      </section>
    </main>
  );
}
