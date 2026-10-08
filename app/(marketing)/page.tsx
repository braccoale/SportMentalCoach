import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Brain,
  CalendarCheck,
  Footprints,
  HeartHandshake,
  MessageSquare,
  Search,
  ShieldCheck,
  Star,
  TrendingUp,
  Video,
  Volleyball,
} from 'lucide-react';
import { ScrollProgress } from '@/components/landing/smooth-scroll';
import { SnapScroll } from '@/components/landing/snap-scroll';
import { RevealProvider } from '@/components/landing/reveal-provider';
import { SiteNav } from '@/components/landing/site-nav';
import { Hero } from '@/components/landing/hero';
import { JsonLd } from '@/components/json-ld';
import { AudienceFaq } from '@/components/landing/audience-paths/audience-faq';
import { HOME_FAQ } from '@/components/landing/home-faq';
import { faqJsonLd } from '@/lib/core/seo';
import { AudiencePathsSection } from '@/components/landing/audience-paths/audience-paths-section';
import { EcosystemAthlete } from '@/components/landing/ecosystem-athlete';
import { MethodDiamond } from '@/components/landing/method';
import { Reveal } from '@/components/landing/reveal';
import { ImageSlot } from '@/components/landing/image-slot';
import { CookieSettingsButton } from '@/components/google-analytics';
import { FooterLinks } from '@/components/landing/footer-links';
import { BackToTop } from '@/components/back-to-top';
import { getLandingStats } from '@/lib/db/landing-stats';

/** First-letter monogram from a display name (drops trailing ", 17 anni" etc). */
/*
 * Solo il canonical: titolo e descrizione arrivano dal layout. Serve perché la
 * home si apre anche con `?percorso=…` (il ritorno dalle pagine percorso), e
 * senza canonical quello è un secondo indirizzo della stessa pagina.
 */
export const metadata: Metadata = {
  // «mental coaching» nel titolo: è quello che si cerca, e il claim della
  // hero («Allena la mente…») non lo dice.
  title: 'Mental coaching sportivo per atleti, famiglie e club | KaiPai',
  description:
    'Mental coaching sportivo con coach verificati: concentrazione, pressione e motivazione per atleti, famiglie e società. La prima sessione conoscitiva è gratis.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'KaiPai — Mental coaching sportivo',
    description:
      'Il metodo, la scuola e la rete di coach che allenano la mente di atleti, squadre e famiglie.',
    type: 'website',
    siteName: 'KaiPai',
    locale: 'it_IT',
    url: '/',
    images: [{ url: '/og/athletes.jpg', width: 1200, height: 630, alt: 'KaiPai — mental coaching sportivo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'KaiPai — Mental coaching sportivo',
    images: ['/og/athletes.jpg'],
  },
};

/* ── shared bits ── */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="kp-eyebrow text-kp-red">{children}</p>;
}

function SectionHeader({
  eyebrow,
  title,
  sub,
  center,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  center?: boolean;
}) {
  return (
    <div className={`max-w-3xl ${center ? 'mx-auto text-center' : ''}`}>
      <Reveal>
        <Eyebrow>{eyebrow}</Eyebrow>
      </Reveal>
      <Reveal delay={0.05}>
        <h2 className="kp-display mt-4 text-[clamp(1.9rem,4.5vw,3.5rem)] text-kp-hi">
          {title}
        </h2>
      </Reveal>
      {sub && (
        <Reveal delay={0.1}>
          <p className="mt-5 text-lg leading-relaxed text-kp-mid">{sub}</p>
        </Reveal>
      )}
    </div>
  );
}

const SECTION =
  'kp-snap relative flex min-h-svh flex-col justify-center py-20 sm:py-24';
const WRAP = 'mx-auto max-w-7xl px-5 sm:px-8';

/* ── page ── */
/**
 * I numeri della hero sono letti dal database a ogni render, con una cache di
 * un minuto lato `getLandingStats`. Non serve marcare la pagina come dinamica:
 * `unstable_cache` la lascia riutilizzabile e la mantiene comunque aggiornata.
 */
export default async function KaiPaiLanding() {
  const stats = await getLandingStats();

  return (
    <main className="relative overflow-x-clip">
      <SnapScroll />
      <ScrollProgress />
      <RevealProvider />
      <SiteNav />

      <Hero stats={stats} />

      <AudiencePathsSection />
      <EcosystemAthlete />
      <Problem />
      <Method />
      <TrustHowItWorks />
      <AudienceFaq
        id="faq"
        className="kp-snap"
        title="Tutto quello che ci" emphasis="chiedono"
        faq={HOME_FAQ}
        tone="light"
        photo={{ src: '/ragazza.png', alt: '', layout: 'scene' }}
      />
      <SiteFooter />

      {/* La landing e' lunga per scelta: dopo l'ultima sezione tornare in
          cima significava risalire tutte le altre. */}
      <BackToTop tone="dark" showAfterPx={900} />
      <JsonLd nodes={[faqJsonLd(HOME_FAQ)]} />
    </main>
  );
}

/* ── 02 · Problem ── */
function Problem() {
  const cards = [
    {
      t: 'Tecnica',
      icon: Volleyball,
      b: 'La base del gioco. Indispensabile, ma non basta.',
      lit: false,
    },
    {
      t: 'Preparazione atletica',
      icon: Footprints,
      b: 'Il motore della performance. Corpo pronto a tutto — ma è la testa che lo guida.',
      lit: false,
    },
    {
      t: 'Allenamento mentale',
      icon: Brain,
      b: 'Ciò che fa la differenza quando conta: concentrazione, fiducia, calma sotto pressione.',
      lit: true,
    },
  ];
  return (
    <section id="problema" className={`${SECTION} overflow-hidden bg-kp-ink2`}>
      <ImageSlot
        src="/gym.jpg"
        position="center"
        placeholder="none"
        className="absolute inset-0"
      >
        <div className="absolute inset-0 bg-kp-ink/80" />
        <div className="kp-vignette absolute inset-0" />
      </ImageSlot>
      <div className={`relative z-10 ${WRAP}`}>
        <SectionHeader
          center
          eyebrow="L’allenamento che manca"
          title={
            <>
              Oggi tutti allenano il fisico.
              <br />
              Pochissimi allenano la <span className="text-kp-red">mente</span>.
            </>
          }
        />
        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {cards.map((c, i) => (
            <Reveal key={c.t} delay={i * 0.1}>
              <div
                className={`relative flex h-full flex-col items-center rounded-2xl border p-8 text-center ${
                  c.lit
                    ? 'border-kp-red/50 bg-kp-red/5 shadow-[0_0_50px_rgba(225,29,42,0.15)]'
                    : 'border-kp-line bg-white/[0.02]'
                }`}
              >
                <span
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                    c.lit
                      ? 'bg-kp-red/15 text-kp-red'
                      : 'bg-white/[0.04] text-kp-hi'
                  }`}
                >
                  <c.icon className="h-7 w-7" strokeWidth={1.6} />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold uppercase tracking-wide text-kp-hi">
                  {c.t}
                </h3>
                <p className="mt-3 text-sm text-kp-mid">{c.b}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.4}>
          <p className="mt-12 text-center text-sm text-kp-low">
            I campioni le allenano tutte e tre. KaiPai è nato per{' '}
            <span className="text-kp-hi">completare il cerchio</span>.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── 03 · Method ── */
function Method() {
  return (
    <section id="metodo" className={SECTION}>
      <div className={WRAP}>
        <SectionHeader
          eyebrow="Il Metodo KaiPai"
          title={
            <>
              La mente ha <span className="text-kp-red">4 muscoli</span>.
              <br />
              Noi li alleniamo tutti.
            </>
          }
          sub="Come il corpo, la mente si allena un muscolo alla volta: lucidità, calma, fiducia, identità. È il cuore di ogni percorso KaiPai — dal primo incontro all’ultima partita."
        />
        <div className="mt-16">
          <MethodDiamond />
        </div>
      </div>
    </section>
  );
}

/* ── Trust + how it works · one page ── */
function TrustHowItWorks() {
  const pillars = [
    { icon: ShieldCheck, t: 'Identità verificata', b: 'Ogni coach è approvato dal nostro team prima della pubblicazione.' },
    { icon: BadgeCheck, t: 'Guide certificate', b: 'Credenziali ed esperienza controllate, formazione continua.' },
    { icon: Star, t: 'Recensioni verificate', b: 'Solo da atleti che hanno svolto sessioni reali.' },
    { icon: HeartHandshake, t: 'Tutela dei minori & GDPR', b: 'Consenso dei genitori per gli under 18. Dati riservati.' },
  ];
  const steps = [
    { icon: Search, t: 'Scegli', b: 'Trova la guida giusta per il tuo sport e per te.' },
    { icon: CalendarCheck, t: 'Inizia', b: 'Mandi una richiesta e fai il primo incontro, online o dal vivo.' },
    { icon: TrendingUp, t: 'Cresci', b: 'Alleni i tuoi 4 muscoli della mente, un percorso alla volta.' },
  ];
  return (
    <section className="kp-snap relative bg-kp-ink2 py-20 sm:py-24">
      {/* Sicurezza e fiducia */}
      <div className={WRAP}>
        <SectionHeader
          eyebrow="Sicurezza e fiducia"
          title={
            <>
              La fiducia non è un dettaglio. <span className="text-kp-red">È il progetto.</span>
            </>
          }
          sub="Supporto umano, sempre. Il mental coaching non sostituisce un percorso clinico."
        />
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p, i) => (
            <Reveal key={p.t} delay={i * 0.08}>
              <div className="h-full rounded-2xl border border-kp-line bg-white/[0.02] p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-kp-verify/10 text-kp-verify">
                  <p.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-5 font-display text-lg font-semibold text-kp-hi">
                  {p.t}
                </h3>
                <p className="mt-2 text-sm text-kp-mid">{p.b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* In tre passi */}
      <div className={`${WRAP} mt-20`}>
        <SectionHeader
          center
          eyebrow="In tre passi"
          title={
            <>
              Scegli. Inizia. <span className="text-kp-red">Cresci.</span>
            </>
          }
        />
        <div className="mt-12 grid gap-10 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.t} delay={i * 0.1} className="text-center">
              <div className="font-display text-6xl font-bold text-kp-red/20">
                0{i + 1}
              </div>
              <span className="mx-auto -mt-8 flex h-14 w-14 items-center justify-center rounded-2xl border border-kp-line bg-kp-ink text-kp-red">
                <s.icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 font-display text-xl font-semibold text-kp-hi">
                {s.t}
              </h3>
              <p className="mt-2 text-kp-mid">{s.b}</p>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="mt-12 flex items-center justify-center gap-4 text-sm text-kp-low">
            <MessageSquare className="h-4 w-4" /> Prenoti, parli in chat, ti alleni
            in videochiamata <Video className="h-4 w-4" /> — tutto in un posto.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Footer ── */
function SiteFooter() {
  return (
    <footer className="kp-snap-end border-t border-kp-line bg-kp-ink">
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
              <p>Genova, Italia</p>
            </div>
          </div>
          <FooterLinks />
        </div>
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-kp-line pt-6 text-sm text-kp-low sm:flex-row">
          <p>© {new Date().getFullYear()} KaiPai. Tutti i diritti riservati.</p>
          {/* Real links: these were `span`s that looked and hovered like links
              but went nowhere — the landing is the main public entry point, so
              it can't be the one page where the legal pages are unreachable. */}
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
