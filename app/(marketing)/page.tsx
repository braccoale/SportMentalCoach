import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ScrollProgress } from '@/components/landing/smooth-scroll';
import { SiteNav } from '@/components/landing/site-nav';
import { SceneHero } from '@/components/landing/scene-hero';
import { SceneMind } from '@/components/landing/scene-mind';
import { ScenePillars } from '@/components/landing/scene-pillars';
import { SceneProduct } from '@/components/landing/scene-product';
import { SceneEcosystem } from '@/components/landing/scene-ecosystem';
import { SceneFounder } from '@/components/landing/scene-founder';
import { ImageSlot } from '@/components/landing/image-slot';
import { CookieSettingsButton } from '@/components/google-analytics';
import { FooterLinks } from '@/components/landing/footer-links';
import { BackToTop } from '@/components/back-to-top';
import { getLandingStats } from '@/lib/db/landing-stats';

const WRAP = 'mx-auto max-w-7xl px-5 sm:px-8';

/**
 * Home KaiPai — sei scene.
 *
 * La versione precedente contava quindici blocchi e 1231 righe, con 49
 * `<Reveal>` che facevano entrare ogni cosa allo stesso modo: la ripetizione
 * del movimento appiattiva la gerarchia più di qualsiasi scelta grafica.
 *
 * Qui la pagina è una sequenza, non un elenco:
 *
 *   1. hero          — una sola idea, una sola CTA
 *   2. la testa      — la scena pinnata, il momento cinematografico
 *   3. il metodo     — i quattro pilastri, che si accendono scorrendo
 *   4. ecco KaiPai   — la piattaforma, il percorso e i numeri veri
 *   5. l'ecosistema  — atleta, allenatori, genitori: il sistema
 *   6. l'origine     — Francesco, la seconda scena pinnata
 *   7. i percorsi    — tre copertine, non tre pricing card
 *   8. CTA finale    — quasi vuota
 *
 * Otto e non sei: ecosistema e fondatore sono rientrati su richiesta. Il
 * conteggio era un obiettivo, non un vincolo.
 *
 * L'ordine non è casuale. L'origine sta fra l'ecosistema e i percorsi — il
 * sistema, chi ci sta dietro, la porta da cui entri — e soprattutto tiene le
 * due scene pinnate (la 2 e la 6) il più lontane possibile: due pin ravvicinati
 * si pagano tutti insieme, in scorrevolezza.
 *
 * Lo `SnapScroll` (scroll-snap `y mandatory` sul documento) è stato rimosso:
 * lo snap obbligatorio nega le posizioni di scroll intermedie, e senza quelle
 * la scena 2 non può scorrere. Era anche la ragione per cui ogni sezione era
 * alta esattamente un viewport.
 *
 * Le sezioni non più in home (fondatore, numeri di mercato, risultati,
 * pacchetti, visione, risorse) restano nella storia di git al commit
 * precedente: sono contenuti validi che meritano pagine proprie, non un posto
 * in una home che deve leggersi in un minuto.
 */
export default async function KaiPaiLanding() {
  const stats = await getLandingStats();

  return (
    <main className="relative overflow-x-clip">
      <ScrollProgress />
      <SiteNav />

      <SceneHero />
      <SceneMind />
      <ScenePillars />
      <SceneProduct stats={stats} />
      <SceneEcosystem />
      <SceneFounder />
      <Paths />
      <FinalCta />
      <SiteFooter />

      <BackToTop tone="dark" showAfterPx={900} />
    </main>
  );
}

/* ── 5 · Scegli il tuo percorso ────────────────────────────────────────────
   Tre copertine fotografiche. Niente prezzi, niente feature list, niente
   pulsanti in competizione: l'ingresso si sceglie in base a chi sei, e la
   pagina di destinazione spiega il resto. */
function Paths() {
  const paths = [
    {
      t: 'ATLETA',
      b: 'Allena la testa come alleni il corpo.',
      img: '/atleta.png',
      pos: 'center 15%',
      href: '/coaches',
    },
    {
      t: 'MENTAL COACH',
      b: 'Entra nella rete. Porta il metodo in campo.',
      img: '/allenatore.png',
      pos: 'center 15%',
      href: '/coaches',
    },
    {
      t: 'CLUB',
      b: 'La preparazione mentale dentro il progetto tecnico.',
      img: '/squadra.jpg',
      pos: 'center 40%',
      href: '/coaches',
    },
  ];

  return (
    <section id="per-chi" className="relative bg-kp-ink2 py-24 sm:py-32">
      <div className={WRAP}>
        <h2 className="kp-display max-w-2xl text-[clamp(2rem,5vw,4rem)] font-bold leading-[0.98] tracking-tight text-kp-hi">
          Scegli il tuo percorso.
        </h2>

        <div className="mt-16 grid gap-4 sm:gap-6 lg:grid-cols-3">
          {paths.map((p) => (
            <Link
              key={p.t}
              href={p.href}
              className="group relative block overflow-hidden rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-kp-red"
            >
              {/* Slot marcato — servono tre ritratti verticali editoriali a
                  2560px. `atleta.png` e `allenatore.png` sono sotto i 500px:
                  reggono a questa scala, non oltre. */}
              <ImageSlot
                src={p.img}
                position={p.pos}
                label={p.t}
                className="aspect-[3/4] w-full"
                imageClassName="transition-transform duration-700 ease-out group-hover:scale-[1.04]"
              >
                {/* Il velo copre solo la fascia bassa, dove sta il testo.
                    Prima saliva su tutta l'immagine e i tre ritratti — che
                    sono il contenuto di questa scena — restavano al buio. */}
                <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-kp-ink via-kp-ink/60 to-transparent" />
              </ImageSlot>

              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                <h3 className="kp-display text-2xl font-bold tracking-tight text-kp-hi sm:text-3xl">
                  {p.t}
                </h3>
                <p className="mt-2 max-w-[22ch] text-sm leading-relaxed text-kp-mid">
                  {p.b}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-kp-red">
                  Entra
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Le famiglie hanno una pagina propria e un ruolo reale nel prodotto
            (consenso dei tutori per i minori): resta un ingresso, sottovoce,
            invece di sparire insieme alle card. */}
        <p className="mt-10 text-base text-kp-mid">
          Sei un genitore?{' '}
          <Link
            href="/famiglie"
            className="font-medium text-kp-hi underline underline-offset-4 transition-colors hover:text-kp-red"
          >
            Come accompagnare tuo figlio
          </Link>
        </p>
      </div>
    </section>
  );
}

/* ── 6 · CTA finale ───────────────────────────────────────────────────────
   Quasi vuota, per scelta. Dopo di qui non c'è altro da leggere. */
function FinalCta() {
  return (
    <section className="kp-grain relative flex min-h-[86svh] items-center overflow-hidden bg-kp-ink">
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40"
        style={{
          background:
            'radial-gradient(circle, rgba(225,29,42,.22), transparent 62%)',
        }}
      />
      <div className={`${WRAP} relative z-10`}>
        <h2 className="kp-display max-w-4xl text-[clamp(2.6rem,8.5vw,7rem)] font-bold leading-[0.9] tracking-tight text-kp-hi">
          ALLENA LA MENTE.
          <br />
          CAMBIA IL <span className="text-kp-red">GIOCO</span>.
        </h2>
        <div className="mt-12">
          <Link
            href="/coaches"
            className="kp-cta group inline-flex items-center gap-2 rounded-full px-9 py-4.5 text-lg font-semibold text-white"
          >
            Inizia il tuo percorso
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-kp-line bg-kp-ink">
      <div className={`${WRAP} py-16`}>
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <img
                src="/logo.jpg"
                alt="KaiPai"
                width={127}
                height={141}
                className="h-8 w-8 rounded-md"
              />
              <span className="font-display text-lg font-semibold text-kp-hi">
                KaiPai
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm text-kp-mid">
              È ora di allenare la mente. Il metodo, la scuola e la rete di coach
              per chi fa sport.
            </p>
            <div className="mt-4 space-y-2 text-sm text-kp-mid">
              <p>
                <a
                  href="tel:+393286212598"
                  className="transition-colors hover:text-kp-hi"
                >
                  +39 328 6212598
                </a>
              </p>
              <p>Genova, Italia</p>
            </div>
          </div>
          <FooterLinks />
        </div>
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-kp-line pt-6 text-sm text-kp-low sm:flex-row">
          <p>© {new Date().getFullYear()} KaiPai. Tutti i diritti riservati.</p>
          <div className="flex flex-wrap justify-center gap-6">
            <Link href="/privacy" className="hover:text-kp-mid">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-kp-mid">
              Termini
            </Link>
            <Link href="/cookie" className="hover:text-kp-mid">
              Cookie
            </Link>
            <CookieSettingsButton className="hover:text-kp-mid" />
          </div>
        </div>
      </div>
    </footer>
  );
}
