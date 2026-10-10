import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CalendarCheck } from 'lucide-react';
import { JsonLd } from '@/components/json-ld';
import { getApprovedCoaches } from '@/lib/core/listings';
import { getActiveSpecialties } from '@/lib/core/taxonomies';
import { getSportPages } from '@/lib/core/sport-pages-server';
import { findSportPage } from '@/lib/core/sport-pages';
import { INTRO_SESSION } from '@/lib/core/services/introduction';
import { REQUEST_RESPONSE_WINDOW_HOURS } from '@/lib/core/sessions';
import { breadcrumbJsonLd, coachListJsonLd, faqJsonLd } from '@/lib/core/seo';

export const revalidate = 3600;

type Params = { sport: string };

/**
 * «Mental coach per il calcio»: una pagina per sport, solo per gli sport in cui
 * ci sono almeno due coach approvati (vedi `lib/core/sport-pages`). Tutto ciò
 * che mostra viene dai dati veri: i coach, le loro specializzazioni, le regole
 * della sessione conoscitiva. Nessun testo specifico dello sport che non si
 * possa verificare: lo sport entra nel titolo e nei dati, non in affermazioni
 * inventate sul suo lato mentale.
 */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { sport } = await params;
  const page = findSportPage(await getSportPages(), sport);
  // 404 vero già dai metadati: a risposta iniziata lo stato resterebbe 200 (falso 404).
  if (!page) notFound();
  const title = `Mental coach per ${page.phrase}: coach approvati`;
  const description = `${page.coachCount} mental coach approvati da KaiPai seguono ${page.phrase}. Sedute in videochiamata e sessione conoscitiva gratuita di ${INTRO_SESSION.durationMin} minuti.`;
  return {
    title: `${title} | KaiPai`,
    description,
    alternates: { canonical: `/mental-coach/${page.slug}` },
    openGraph: { type: 'website', title, description, url: `/mental-coach/${page.slug}` },
  };
}

export default async function SportCoachesPage({ params }: { params: Promise<Params> }) {
  const { sport } = await params;
  const page = findSportPage(await getSportPages(), sport);
  if (!page) notFound();

  const [coaches, specialties] = await Promise.all([
    getApprovedCoaches({ sport: page.key }),
    getActiveSpecialties(),
  ]);
  const specialtyLabel = new Map(specialties.map((s) => [s.key, s.label]));
  const topics = [
    ...new Set(
      coaches
        .flatMap((c) => c.specialties ?? [])
        .map((k) => specialtyLabel.get(k))
        .filter((label): label is string => Boolean(label))
    ),
  ];

  const faq = [
    {
      q: `Come si inizia con un mental coach per ${page.phrase}?`,
      a: `Scegli un coach dall’elenco e chiedi la sessione conoscitiva: dura ${INTRO_SESSION.durationMin} minuti ed è gratuita. Nulla è confermato finché il coach non risponde; se non risponde entro ${REQUEST_RESPONSE_WINDOW_HOURS} ore la richiesta scade e puoi sceglierne un altro.`,
    },
    {
      q: 'Dove si svolgono le sedute?',
      a: 'In videochiamata dentro KaiPai, dal browser o dall’app, senza link esterni da cercare.',
    },
    {
      q: 'Il mental coaching è una terapia?',
      a: 'No: allena abilità legate alla prestazione sportiva. Se emerge un bisogno di natura clinica, il coach lo dice chiaramente e indirizza verso un professionista sanitario.',
    },
  ];
  const path = `/mental-coach/${page.slug}`;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <nav aria-label="Percorso" className="text-sm text-gray-500">
        <Link href="/coaches" className="hover:text-gray-900">
          Coach
        </Link>{' '}
        / <span className="text-gray-700">Mental coach per {page.phrase}</span>
      </nav>

      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-gray-950 sm:text-4xl">
        Mental coach per {page.phrase}
      </h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-gray-700">
        Su KaiPai {page.coachCount} mental coach seguono {page.phrase}. Ogni profilo è approvato dal team prima di
        comparire nell’elenco, le sedute si fanno in videochiamata e la prima, conoscitiva, dura{' '}
        {INTRO_SESSION.durationMin} minuti ed è gratuita.
      </p>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {coaches.map((coach) => (
          <li key={coach.slug}>
            <Link
              href={`/coaches/${coach.slug}`}
              className="flex h-full gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              {coach.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coach.avatarUrl} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xl font-semibold text-gray-400">
                  {(coach.displayName ?? '?').slice(0, 1)}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-lg font-semibold text-gray-950">{coach.displayName}</span>
                {coach.headline && <span className="mt-0.5 block text-sm text-gray-600">{coach.headline}</span>}
                <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CalendarCheck className="h-3.5 w-3.5" aria-hidden /> Sessione conoscitiva gratuita
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {topics.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-semibold text-gray-950">Su cosa lavorano questi coach</h2>
          <p className="mt-2 text-gray-700">Le specializzazioni indicate dai coach che seguono {page.phrase}:</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {topics.map((topic) => (
              <li key={topic} className="rounded-full bg-white px-3 py-1 text-sm text-gray-700 ring-1 ring-gray-200">
                {topic}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-gray-950">Domande frequenti</h2>
        <dl className="mt-3 divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
          {faq.map((item) => (
            <div key={item.q} className="px-5 py-4">
              <dt className="font-medium text-gray-950">{item.q}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-gray-600">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link
          href={`/coaches?sport=${page.key}`}
          className="inline-flex items-center gap-2 rounded-full bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700"
        >
          Filtra l’elenco per {page.label.toLowerCase()} <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link
          href="/blog/come-scegliere-un-mental-coach-sportivo"
          className="text-sm font-medium text-emerald-700 hover:underline"
        >
          Come scegliere un mental coach sportivo
        </Link>
      </div>

      <JsonLd
        nodes={[
          breadcrumbJsonLd([
            { name: 'Coach', path: '/coaches' },
            { name: `Mental coach per ${page.phrase}`, path },
          ]),
          coachListJsonLd(coaches.map((c) => ({ slug: c.slug, name: c.displayName ?? c.slug }))),
          faqJsonLd(faq),
        ]}
      />
    </main>
  );
}
