import Link from 'next/link';
import {
  ArrowRight,
  Award,
  BadgeCheck,
  BookOpen,
  Brain,
  Building2,
  CalendarCheck,
  CheckCircle2,
  FlaskConical,
  Footprints,
  HeartHandshake,
  MessageSquare,
  Mic,
  Quote,
  Search,
  ShieldCheck,
  Shirt,
  Star,
  TrendingUp,
  Trophy,
  User,
  Users,
  Video,
  Volleyball,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollProgress } from '@/components/landing/smooth-scroll';
import { SnapScroll } from '@/components/landing/snap-scroll';
import { RevealProvider } from '@/components/landing/reveal-provider';
import { SiteNav } from '@/components/landing/site-nav';
import { Hero } from '@/components/landing/hero';
import { EcosystemAthlete } from '@/components/landing/ecosystem-athlete';
import { MethodDiamond } from '@/components/landing/method';
import { Reveal } from '@/components/landing/reveal';
import { CountUp } from '@/components/landing/count-up';
import { ImageSlot, AvatarSlot } from '@/components/landing/image-slot';

/** First-letter monogram from a display name (drops trailing ", 17 anni" etc). */
function initials(name: string) {
  return name
    .split(',')[0]
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

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
export default function KaiPaiLanding() {
  return (
    <main className="relative overflow-x-clip">
      <SnapScroll />
      <ScrollProgress />
      <RevealProvider />
      <SiteNav />

      <Hero />

      <EcosystemAthlete />
      <WhyNow />
      <Audience />
      <Problem />
      <Method />
      <Founder />
      <MarketplaceAcademy />
      <Results />
      <TrustHowItWorks />
      <Packages />
      <Vision />
      <MovementResources />
      <FinalCta />
      <SiteFooter />
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

/* ── 04 · Founder ── */
function Founder() {
  const chips = ['Certificato ACSI–CONI', 'Autore', 'Al fianco di atleti olimpici e calciatori pro'];
  return (
    <section id="origine" className={`${SECTION} bg-kp-ink2`}>
      <div className={`${WRAP} grid items-center gap-14 lg:grid-cols-[0.8fr_1.2fr]`}>
        <Reveal>
          <ImageSlot
            src="/founder.jpg"
            position="center top"
            monogram="FB"
            label="Ritratto founder"
            className="kp-elevated mx-auto aspect-[4/5] w-full max-w-sm rounded-3xl border border-kp-line"
          >
            <div className="kp-red-glow absolute -bottom-16 left-1/2 h-64 w-64 -translate-x-1/2 opacity-50" />
            <div className="kp-vignette absolute inset-0" />
            <div className="absolute bottom-0 left-0 right-0 border-t border-kp-line bg-kp-ink/70 p-4 backdrop-blur">
              <p className="font-display text-lg font-semibold text-kp-hi">
                Francesco Borrelli
              </p>
              <p className="text-sm text-kp-mid">
                Fondatore · Ideatore del Metodo KaiPai
              </p>
            </div>
          </ImageSlot>
        </Reveal>

        <div>
          <Reveal>
            <Eyebrow>L'origine</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <p className="kp-display mt-5 text-[clamp(1.6rem,3.2vw,2.6rem)] leading-tight text-kp-hi">
              «Non farti guidare dalla tua mente.{' '}
              <span className="text-kp-red">Impara a guidarla.»</span>
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-kp-mid">
              Vengo dal diritto, dal giornalismo, dalla consulenza. Nel 2014 ho
              scoperto che la mente si allena — e ho cambiato strada. Da allora
              accompagno atleti verso Olimpiadi e Mondiali, e ragazzi dal settore
              giovanile all'esordio tra i professionisti. Ho imparato una cosa
              sola: la mente non va corretta, va guidata.
            </p>
          </Reveal>
          <Reveal delay={0.13}>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-kp-hi">
              KaiPai è nato per questo: portare ciò che ho imparato con i
              campioni a ogni ragazzo che fa sport.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-7 flex flex-wrap gap-2">
              {chips.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-kp-line px-3 py-1.5 text-sm text-kp-mid"
                >
                  {c}
                </span>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.18}>
            <div className="mt-6">
              <Button
                asChild
                variant="outline"
                className="rounded-full border-kp-line bg-white/5 text-kp-hi hover:bg-white/10"
              >
                <a
                  href="https://www.amazon.it/Before-Storie-fatiche-successi-sentiero/dp/B0G3SWZWK7/ref=sr_1_1?__mk_it_IT=%C3%85M%C3%85%C5%BD%C3%95%C3%91&crid=VVT6YJWCYYXL&dib=eyJ2IjoiMSJ9.IMN-N_7TyhmGXZS5DD6v2ExVRhGwpxfFuNon-lVjObufIkfyjHr7IkirWfFKzPvOw5ggPmXqeoXGe95DkCS38hgtbRqRg97sqwZRsvV3fYOyUQR1Hi47V8teBC3R8tZ-pL0gVKOG_fY1lwOh3UdeY4PNxlJ4i0WEUwIbyfuvpxIDEdjrWNWH23W4iwyjEeMx6ucaXuQoMxvRo0KOD6BcJccFJweOK-7avwZJ8LTl_r7mnCTh3BvWt7SfEZ1B2AcfNZwVKpDh5y6O-dbqSjUQp7ciru3EMAJAiJdsU1xecOU.d1KruZIKpXaOngyJRdAXbsgcaoYM3D3ch4Qpfd77tH0&dib_tag=se&keywords=francesco+borrelli&qid=1783269284&sprefix=francesco+borrelli%2Caps%2C159&sr=8-1"
                  target="_blank"
                  rel="noreferrer"
                >
                  <BookOpen className="h-4 w-4" />
                  Compra il libro di Francesco
                </a>
              </Button>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── Why now · stats ── */
function WhyNow() {
  const stats = [
    {
      icon: Building2,
      label: 'Club di Serie A',
      to: 95,
      prefix: '',
      note: 'allenano la mente con figure dedicate',
    },
    {
      icon: Shirt,
      label: 'Settori giovanili',
      to: 70,
      prefix: '+',
      note: 'di investimento nell’allenamento mentale in 5 anni',
    },
    {
      icon: Trophy,
      label: 'In campo',
      to: 30,
      prefix: '+',
      note: 'concentrazione e lucidità nei momenti decisivi',
    },
    {
      icon: ShieldCheck,
      label: 'Fuori dal campo',
      to: 40,
      prefix: '−',
      note: 'meno burnout, meno ragazzi che abbandonano',
    },
  ];
  return (
    <section id="perche-oggi" className={`${SECTION} overflow-hidden`}>
      <ImageSlot
        src="/stadio.jpg"
        position="center"
        placeholder="none"
        className="absolute inset-0"
      >
        <div className="absolute inset-0 bg-kp-ink/80" />
        <div className="kp-vignette absolute inset-0" />
      </ImageSlot>
      <div
        className={`relative z-10 ${WRAP} grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]`}
      >
        <div>
          <Reveal>
            <Eyebrow>Il mondo è già cambiato</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="kp-display mt-4 text-[clamp(1.8rem,4vw,3rem)] text-kp-hi">
              La testa non è più un dettaglio.
              <br />È il primo <span className="text-kp-red">allenamento</span>.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-kp-mid">
              I più grandi club del mondo allenano la mente ogni giorno, dai
              campioni ai ragazzi del vivaio. Non è una moda: è il nuovo modo
              di crescere nello sport.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <a
              href="#metodo"
              className="kp-cta group mt-8 inline-flex items-center gap-2 rounded-full px-7 py-3.5 font-semibold text-white"
            >
              Scopri come si allena
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
          </Reveal>
        </div>

        <Reveal delay={0.1}>
          <div className="grid grid-cols-2 gap-3 rounded-3xl border border-kp-line bg-kp-surface/40 p-4 sm:grid-cols-4 sm:p-5">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl bg-white/[0.02] p-5 text-center"
              >
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-kp-red/10 text-kp-red">
                  <s.icon className="h-5 w-5" />
                </span>
                <p className="kp-eyebrow mt-4 text-[0.6rem] text-kp-mid">
                  {s.label}
                </p>
                <p className="mt-2 font-display text-3xl font-bold text-kp-hi">
                  <CountUp to={s.to} prefix={s.prefix} suffix="%" />
                </p>
                <p className="mt-2 text-xs leading-snug text-kp-low">{s.note}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Audience · per ogni ruolo ── */
function Audience() {
  const roles = [
    {
      icon: User,
      t: 'Atleti',
      img: '/atleta.png',
      b: 'Sviluppa il tuo potenziale mentale. Affronta ogni sfida al massimo.',
      href: '/coaches',
      cta: 'Scopri di più',
    },
    {
      icon: Users,
      t: 'Allenatori',
      img: '/allenatore.png',
      b: 'Migliora la gestione del gruppo. Comunica, guida, ispira.',
      href: '/coaches',
      cta: 'Scopri di più',
    },
    {
      icon: HeartHandshake,
      t: 'Famiglie',
      img: '/famiglia.jpg',
      b: 'Il tuo ruolo conta più di quanto pensi. Ti aiutiamo ad accompagnare tuo figlio con equilibrio: meno pressione, più fiducia — nel rispetto della sua riservatezza.',
      href: '/famiglie',
      cta: 'Scopri come accompagnare tuo figlio',
    },
  ];
  return (
    <section id="per-chi" className={`${SECTION} bg-kp-ink2`}>
      <div className={WRAP}>
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <Eyebrow>Per chi è KaiPai</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="kp-display mt-4 text-[clamp(1.4rem,3vw,2.25rem)] text-kp-hi lg:whitespace-nowrap">
              Un percorso su misura per ogni ruolo.
            </h2>
          </Reveal>
        </div>
        <div className="mx-auto mt-8 grid max-w-5xl gap-6 md:grid-cols-3">
          {roles.map((r, i) => (
            <Reveal key={r.t} delay={i * 0.1}>
              <div className="group h-full overflow-hidden rounded-2xl border border-kp-line bg-white/[0.02]">
                <ImageSlot
                  src={r.img}
                  position="center top"
                  icon={r.icon}
                  label={r.t}
                  className="aspect-[4/3] w-full"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-kp-ink via-kp-ink/25 to-transparent" />
                </ImageSlot>
                <div className="p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-kp-red/10 text-kp-red">
                    <r.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-display text-xl font-semibold uppercase tracking-wide text-kp-hi">
                    {r.t}
                  </h3>
                  <p className="mt-2 text-sm text-kp-mid">{r.b}</p>
                  <a
                    href={r.href}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-kp-red"
                  >
                    {r.cta}
                    <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
                  </a>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {/* KaiPai per Società Sportive — wide banner */}
        <Reveal delay={0.3}>
          <div className="mx-auto mt-6 grid max-w-5xl overflow-hidden rounded-2xl border border-kp-line bg-white/[0.02] md:grid-cols-2">
            <ImageSlot
              src="/squadra.jpg"
              position="center"
              icon={Building2}
              label="Società Sportive"
              className="min-h-[220px] w-full"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-kp-ink/30" />
            </ImageSlot>
            <div className="flex flex-col justify-center p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-kp-red/10 text-kp-red">
                <Building2 className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-2xl font-semibold text-kp-hi">
                KaiPai per Società Sportive
              </h3>
              <p className="mt-2 text-kp-mid">
                Inseriamo la preparazione mentale all&apos;interno del tuo
                progetto tecnico.
              </p>
              <a
                href="/coaches"
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-kp-red"
              >
                Scopri di più
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Marketplace + academy · one page ── */
function MarketplaceAcademy() {
  const steps = [
    'Selezione',
    'Formazione',
    'Certificazione',
    'Supervisione',
    'Crescita continua',
  ];
  return (
    <section className="kp-snap relative bg-kp-ink2 py-20 sm:py-24">
      <div className={`${WRAP} grid items-center gap-14 lg:grid-cols-2`}>
        <div>
          <SectionHeader
            eyebrow="Le nostre guide"
            title={
              <>
                Non un coach qualsiasi.{' '}
                <span className="text-kp-red">Una guida formata da noi</span>.
              </>
            }
            sub="Ogni guida KaiPai è verificata, certificata e cresciuta dalla nostra Academy. Niente vetrine, niente sconosciuti: solo persone di cui fidarti."
          />
          <Reveal delay={0.15}>
            <ul className="mt-8 space-y-3">
              {[
                'Identità e credenziali verificate',
                'Recensioni vere, solo dopo sessioni reali',
                'Formate dalla KaiPai Academy',
              ].map((f) => (
                <li key={f} className="flex items-center gap-3 text-kp-mid">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-kp-verify" />
                  {f}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.2}>
            <Link
              href="/coaches"
              className="kp-cta group mt-9 inline-flex items-center gap-2 rounded-full px-6 py-3.5 font-semibold text-white"
            >
              Sfoglia i coach
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>

        {/* single beautiful coach card */}
        <Reveal delay={0.1}>
          <div className="kp-card kp-elevated relative mx-auto w-full max-w-sm rounded-3xl p-6">
            <div className="flex items-center gap-4">
              <ImageSlot
                src="/coach-marco.jpg"
                monogram="MR"
                className="h-16 w-16 rounded-2xl border border-kp-line text-xl font-semibold"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-display text-lg font-semibold text-kp-hi">
                    Marco Rossi
                  </span>
                  <BadgeCheck className="h-4 w-4 text-kp-verify" />
                </div>
                <p className="text-sm text-kp-mid">Mental coach · Calcio</p>
                <div className="mt-1 flex items-center gap-1 text-sm text-kp-hi">
                  <Star className="h-3.5 w-3.5 fill-kp-red text-kp-red" />
                  4.9
                  <span className="text-kp-low">· 3 recensioni</span>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {['Identità verificata', 'Academy', 'Under 18'].map((b) => (
                <span
                  key={b}
                  className="rounded-full border border-kp-line px-2.5 py-1 text-xs text-kp-mid"
                >
                  {b}
                </span>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-kp-line bg-white/[0.02] p-4">
              <p className="kp-eyebrow text-kp-low">Prossima disponibilità</p>
              <div className="mt-2 flex gap-2">
                {['Lun 17:00', 'Mer 17:00', 'Sab 10:00'].map((s) => (
                  <span
                    key={s}
                    className="rounded-lg bg-kp-red/10 px-2.5 py-1 text-xs font-medium text-kp-red"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* KaiPai Academy */}
      <div className={`${WRAP} mt-16`} id="academy">
        <div className="mx-auto max-w-4xl text-center">
          <Reveal>
            <Eyebrow>KaiPai Academy</Eyebrow>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="kp-display mt-4 text-[clamp(1.5rem,3.4vw,2.6rem)] text-kp-hi lg:whitespace-nowrap">
              Non scegliamo i coach.{' '}
              <span className="text-kp-red">Li formiamo.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-5 text-lg leading-relaxed text-kp-mid">
              Ogni coach supera un percorso rigoroso prima di affiancare un
              atleta. Solo chi lo completa entra a far parte di KaiPai.
            </p>
          </Reveal>
        </div>
        <div className="mt-10 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          {steps.map((s, i) => (
            <Reveal key={s} delay={i * 0.1} className="flex-1">
              <div className="flex items-center gap-3 rounded-2xl border border-kp-line bg-white/[0.02] p-4">
                <span className="font-mono text-sm text-kp-red">
                  0{i + 1}
                </span>
                <span className="font-display font-medium text-kp-hi">{s}</span>
              </div>
            </Reveal>
          ))}
          <Reveal delay={0.6}>
            <div className="flex items-center gap-2 rounded-2xl border border-kp-verify/40 bg-kp-verify/10 p-4">
              <Award className="h-5 w-5 text-kp-verify" />
              <span className="font-display font-semibold text-kp-hi">
                Coach Verificato
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── 08 · Results ── */
function Results() {
  const stats = [
    { to: 34, prefix: '+', suffix: '%', label: 'Gestione della pressione*' },
    { to: 9, suffix: ' su 10', label: 'Tornerebbero a farlo' },
    { to: 2400, suffix: '+', label: 'Sessioni completate' },
    { to: 18, label: 'Regioni coperte' },
  ];
  const quotes = [
    {
      q: 'Il mental coaching mi ha aiutato a gestire la pressione e a tornare a divertirmi in campo.',
      n: 'Luca, 17 anni',
      r: 'Calciatore U17',
    },
    {
      q: 'Ho imparato a preparare la partita con la giusta mentalità, non solo con le gambe.',
      n: 'Marco',
      r: 'Allenatore, Prima Categoria',
    },
    {
      q: 'Come genitore ho imparato a sostenere mio figlio senza mettergli addosso pressione.',
      n: 'Giulia',
      r: 'Mamma di un atleta',
    },
  ];
  return (
    <section className={`${SECTION} overflow-hidden bg-kp-ink2`}>
      <ImageSlot
        src="/orizzonte.png"
        position="center"
        placeholder="none"
        className="absolute inset-0"
      >
        <div className="absolute inset-0 bg-kp-ink/78" />
        <div className="kp-vignette absolute inset-0" />
      </ImageSlot>
      <div className={`relative z-10 ${WRAP}`}>
        <SectionHeader
          center
          eyebrow="Chi ha già iniziato"
          title={
            <>
              Non numeri.{' '}
              <span className="text-kp-red">Persone che sono cambiate.</span>
            </>
          }
        />
        <div className="mt-14 grid grid-cols-2 gap-6 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08} className="text-center">
              <div className="font-display text-[clamp(2.2rem,5vw,3.2rem)] font-bold text-kp-hi">
                <CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} />
              </div>
              <p className="mt-1 text-sm text-kp-mid">{s.label}</p>
            </Reveal>
          ))}
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {quotes.map((t, i) => (
            <Reveal key={t.n} delay={i * 0.1}>
              <figure className="kp-card h-full rounded-2xl p-6">
                <Quote className="h-6 w-6 text-kp-red" />
                <blockquote className="mt-4 text-kp-hi">{t.q}</blockquote>
                <figcaption className="mt-5 flex items-center gap-3 text-sm">
                  <AvatarSlot monogram={initials(t.n)} />
                  <span>
                    <span className="block font-medium text-kp-hi">{t.n}</span>
                    <span className="block text-kp-low">{t.r}</span>
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="mt-8 text-center text-xs text-kp-low">
            *Dato illustrativo, in fase di validazione con i risultati reali dei
            percorsi KaiPai.
          </p>
        </Reveal>
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

/* ── 11 · Vision ── */
function Vision() {
  const layers = [
    { t: 'Il Metodo', d: 'Il linguaggio comune', tag: 'fondamenta' },
    { t: 'Le Guide', d: "L'incontro con chi ti accompagna", tag: 'oggi' },
    { t: "L'Academy", d: 'Lo standard di qualità', tag: 'oggi' },
    { t: 'La Mappa Mentale', d: 'Misurare la crescita nel tempo', tag: 'prossimo' },
    { t: 'Le Società', d: 'La mentalità dentro i club', tag: 'prossimo' },
    { t: 'La Cultura', d: 'Rendere normale allenare la mente', tag: 'la missione' },
  ];
  return (
    <section id="visione" className={SECTION}>
      <div className={WRAP}>
        <SectionHeader
          eyebrow="La visione"
          title={
            <>
              Trovare una guida è <span className="text-kp-red">solo l'inizio</span>.
            </>
          }
          sub="Vogliamo cambiare il modo in cui lo sport allena la mente — dal singolo atleta a un'intera cultura. Un passo alla volta."
        />
        <div className="mx-auto mt-14 max-w-3xl space-y-3">
          {layers.map((l, i) => {
            const mission = i === layers.length - 1;
            return (
              <Reveal key={l.t} delay={i * 0.08} y={16}>
                <div
                  className={`flex items-center justify-between rounded-2xl border p-5 ${
                    mission
                      ? 'border-kp-red/50 bg-kp-red/10 shadow-[0_0_50px_rgba(225,29,42,0.18)]'
                      : 'border-kp-line bg-white/[0.02]'
                  }`}
                  style={{ marginLeft: `${(layers.length - 1 - i) * 6}%` }}
                >
                  <div>
                    <span className="font-display text-lg font-semibold text-kp-hi">
                      {l.t}
                    </span>
                    <span className="ml-3 text-sm text-kp-mid">{l.d}</span>
                  </div>
                  <span
                    className={`kp-eyebrow shrink-0 ${
                      mission ? 'text-kp-red' : 'text-kp-low'
                    }`}
                  >
                    {l.tag}
                  </span>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── 12 · Movement ── */
/* ── Resources + movement · one page ── */
function MovementResources() {
  const lines = [
    'Alleniamo la mente.',
    'Non aspettiamo di stare male per iniziare.',
    'La pressione non ci spaventa: la alleniamo.',
    'Perdere fa parte. Arrendersi no.',
    'Il talento è un inizio, non una scusa.',
  ];
  const items = [
    { icon: Mic, t: 'Podcast' },
    { icon: BookOpen, t: 'Guide per genitori' },
    { icon: Building2, t: 'Risorse per le società' },
    { icon: FlaskConical, t: 'Ricerca & metodo' },
  ];
  return (
    <section className="kp-snap relative bg-kp-ink2 py-20 sm:py-24">
      {/* Risorse & ricerca */}
      <div className={WRAP}>
        <div className="flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
          <div className="max-w-md">
            <Reveal>
              <Eyebrow>Risorse & ricerca</Eyebrow>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="kp-display mt-4 text-[clamp(1.6rem,3vw,2.4rem)] text-kp-hi">
                Stiamo cambiando come si{' '}
                <span className="text-kp-red">pensa</span> lo sport.
              </h2>
            </Reveal>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-xl">
            {items.map((it, i) => (
              <Reveal key={it.t} delay={i * 0.06}>
                <div className="kp-card flex h-full flex-col gap-3 rounded-2xl p-5">
                  <it.icon className="h-5 w-5 text-kp-red" />
                  <span className="text-sm font-medium text-kp-hi">{it.t}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* Il movimento */}
      <div className={`${WRAP} mt-16 max-w-4xl`}>
        <Reveal>
          <Eyebrow>Il movimento</Eyebrow>
        </Reveal>
        <div className="mt-8 space-y-2">
          {lines.map((l, i) => (
            <Reveal key={l} delay={i * 0.1} y={18}>
              <p className="kp-display text-[clamp(1.6rem,4.5vw,3rem)] leading-tight text-kp-hi">
                {l}
              </p>
            </Reveal>
          ))}
          <Reveal delay={lines.length * 0.1}>
            <p className="kp-display text-[clamp(1.6rem,4.5vw,3rem)] leading-tight text-kp-red">
              Questo è KaiPai.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── Packages · pricing ── */
function Packages() {
  const packages = [
    {
      name: 'Starter & Crisis Prevention',
      icon: ShieldCheck,
      price: '1.500 €',
      period: '/ mese',
      target: 'Club Serie B, Serie C o realtà locali e dilettantistiche',
      desc: "L'ingresso strutturato al mental coaching: basi solide e prevenzione, per iniziare nel modo giusto.",
      features: ['20 sessioni individuali / mese', '1 workshop introduttivo'],
      lit: false,
    },
    {
      name: 'Triangolo Formativo & Youth Academy',
      icon: Users,
      price: '3.500 €',
      period: '/ mese',
      target: 'Club con settori giovanili Under 15 – Under 19',
      desc: 'Il percorso completo che fa crescere insieme atleti, staff e famiglie del vivaio.',
      features: [
        'Presenza settimanale fissa',
        'Workshop per staff e genitori',
      ],
      lit: true,
    },
    {
      name: 'Performance Lab & Elite System',
      icon: Trophy,
      price: '75.000 €',
      period: '/ anno',
      target: "Club Serie A o Academy d'élite",
      desc: "Il sistema d'élite: mental performance integrata al più alto livello competitivo.",
      features: ['Presenza full-time o team dedicato'],
      lit: false,
    },
  ];
  return (
    <section id="pacchetti" className={`${SECTION} bg-kp-ink2`}>
      <div className={WRAP}>
        <SectionHeader
          center
          eyebrow="Pacchetti & abbonamenti"
          title={
            <>
              Un modello su misura per il tuo{' '}
              <span className="text-kp-red">club</span>.
            </>
          }
          sub="Dal dilettantismo all'élite: scegli il pacchetto adatto alla tua realtà. Nessun costo nascosto, tutto incluso."
        />
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {packages.map((p, i) => (
            <Reveal key={p.name} delay={i * 0.1}>
              <div
                className={`relative flex h-full flex-col rounded-2xl border p-8 ${
                  p.lit
                    ? 'border-kp-red/50 bg-kp-red/5 shadow-[0_0_50px_rgba(225,29,42,0.15)]'
                    : 'border-kp-line bg-white/[0.02]'
                }`}
              >
                {p.lit && (
                  <span className="kp-eyebrow absolute right-6 top-6 text-kp-red">
                    Più scelto
                  </span>
                )}
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${
                    p.lit
                      ? 'bg-kp-red/15 text-kp-red'
                      : 'bg-white/[0.04] text-kp-hi'
                  }`}
                >
                  <p.icon className="h-6 w-6" strokeWidth={1.6} />
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold text-kp-hi">
                  {p.name}
                </h3>
                <p className="mt-2 text-sm text-kp-low">{p.target}</p>
                <p className="mt-4 text-sm leading-relaxed text-kp-mid">
                  {p.desc}
                </p>

                <div className="mt-6 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-bold text-kp-hi">
                    {p.price}
                  </span>
                  <span className="text-sm text-kp-low">{p.period}</span>
                </div>

                <ul className="mt-5 space-y-2.5">
                  {p.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-kp-mid"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-kp-verify" />
                      {f}
                    </li>
                  ))}
                </ul>

                <a
                  href="mailto:info@kaipai.com?subject=Informazioni%20pacchetti%20KaiPai"
                  className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 font-semibold transition ${
                    p.lit
                      ? 'kp-cta text-white'
                      : 'border border-kp-line text-kp-hi hover:border-kp-red/40'
                  }`}
                >
                  Richiedi informazioni
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── 14 · Final CTA ── */
function FinalCta() {
  return (
    <section className="kp-snap kp-grain relative flex min-h-svh items-center overflow-hidden py-24 sm:py-32">
      <ImageSlot
        src="/cta-athlete.jpg"
        position="center 30%"
        placeholder="none"
        className="absolute inset-0"
      >
        <div className="absolute inset-0 bg-kp-ink/82" />
        <div className="kp-vignette absolute inset-0" />
      </ImageSlot>
      <div className="kp-red-glow absolute left-1/2 top-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 opacity-60" />
      <div className={`${WRAP} relative z-10 text-center`}>
        <Reveal>
          <p className="text-sm text-kp-mid">
            Rendere l'allenamento mentale normale quanto quello fisico.
          </p>
        </Reveal>
        <Reveal delay={0.05}>
          <h2 className="kp-display mx-auto mt-5 max-w-3xl text-[clamp(2.2rem,6vw,4.5rem)] text-kp-hi">
            Il futuro dello sport si allena{' '}
            <span className="text-kp-red">con la testa</span>.
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-6 text-lg text-kp-mid">
            Inizia il tuo percorso. Entra nel movimento.
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/coaches"
              className="kp-cta group inline-flex items-center gap-2 rounded-full px-8 py-4 font-semibold text-white"
            >
              Inizia il tuo percorso
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <a
              href="#metodo"
              className="inline-flex items-center rounded-full border border-kp-line px-7 py-4 font-medium text-kp-hi hover:border-kp-hi/30"
            >
              Scopri il Metodo
            </a>
          </div>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-kp-low">
            <Link href="/sign-up" className="kp-link-wipe hover:text-kp-hi">
              Sei un coach?
            </Link>
            <Link href="/sign-up" className="kp-link-wipe hover:text-kp-hi">
              Sei una società?
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── Footer ── */
function SiteFooter() {
  const cols = [
    { h: 'Inizia', links: ['Trova la tua guida', 'Come funziona', 'Prezzi'] },
    { h: 'Metodo', links: ['I 4 muscoli', 'Academy', 'Ricerca'] },
    { h: 'Per chi', links: ['Atleti', 'Famiglie', 'Coach', 'Società'] },
    { h: 'Azienda', links: ['Origine', 'Movimento', 'Contatti'] },
  ];
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
              <p>
                <a href="tel:+393286212598" className="transition-colors hover:text-kp-hi">
                  +39 328 6212598
                </a>
              </p>
              <p>Genova, Italia</p>
            </div>
          </div>
          {cols.map((c) => (
            <div key={c.h}>
              <p className="kp-eyebrow text-kp-low">{c.h}</p>
              <ul className="mt-4 space-y-2.5">
                {c.links.map((l) => (
                  <li key={l}>
                    <span className="cursor-pointer text-sm text-kp-mid transition-colors hover:text-kp-hi">
                      {l}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-kp-line pt-6 text-sm text-kp-low sm:flex-row">
          <p>© {new Date().getFullYear()} KaiPai. Tutti i diritti riservati.</p>
          {/* Real links: these were `span`s that looked and hovered like links
              but went nowhere — the landing is the main public entry point, so
              it can't be the one page where the legal pages are unreachable. */}
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-kp-mid">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-kp-mid">
              Termini
            </Link>
            <Link href="/cookie" className="hover:text-kp-mid">
              Cookie
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
