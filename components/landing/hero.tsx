import Link from 'next/link';
import { ArrowRight, BadgeCheck, Lock, ShieldCheck } from 'lucide-react';
import { Reveal } from './reveal';
import { ImageSlot } from './image-slot';
import { VideoCta } from './video-cta';

const SIDE_STATS = [
  { label: 'Concentrazione', value: '+28%', float: 'kp-float' },
  { label: 'Resilienza', value: '+35%', float: 'kp-float-slow' },
  { label: 'Gestione stress', value: '+42%', float: 'kp-float' },
];

const TRUST = [
  { icon: ShieldCheck, label: 'Coach verificati' },
  { icon: BadgeCheck, label: 'Metodo scientifico' },
  { icon: Lock, label: 'Sicuro e affidabile' },
];

/**
 * Cinematic hero — the trust-in-5-seconds moment. A large portrait bleeds
 * full-height on the right (behind the transparent nav), lit by a neural glow,
 * with floating glass widgets alongside. Drop the portrait at
 * `public/hero-athlete.jpg`; until then the slot shows an elegant dark
 * placeholder with the glow, never a broken frame.
 */
export function Hero() {
  return (
    <section className="kp-snap kp-grain relative min-h-[100svh] overflow-hidden">
      {/* Portrait media slot — right bleed, full height incl. behind the nav */}
      <ImageSlot
        src="/hero-athlete.jpg"
        position="79% top"
        placeholder="none"
        label="Ritratto atleta"
        className="absolute inset-0 lg:left-auto lg:right-0 lg:w-[66%]"
      >
        {/* neural 'brain' glow over the head area */}
        <div className="kp-brainglow kp-float absolute left-[22%] top-[13%] hidden h-56 w-56 lg:block" />
        {/* legibility + depth scrims */}
        <div className="absolute inset-0 bg-gradient-to-r from-kp-ink via-kp-ink/75 to-transparent lg:via-kp-ink/35" />
        <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-kp-ink via-kp-ink/55 to-transparent" />
        <div className="kp-vignette absolute inset-0" />
      </ImageSlot>

      {/* Floating stat widgets */}
      <div className="absolute right-48 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-6 xl:flex">
        {SIDE_STATS.map((s, i) => (
          <Reveal key={s.label} delay={0.45 + i * 0.12}>
            <div className={`kp-glass w-52 rounded-2xl px-4 py-3 ${s.float}`}>
              <p className="kp-eyebrow text-[0.65rem] text-kp-mid">{s.label}</p>
              <div className="mt-1 flex items-end justify-between gap-3">
                <span className="font-display text-3xl font-bold text-kp-red">
                  {s.value}
                </span>
                <Sparkline />
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-5 pb-16 pt-24 sm:px-8">
        <div className="max-w-xl">
          <img
            src="/logo-transparent-clean.png"
            alt="Kai Pai — Mental Coaching"
            width={626}
            height={178}
            className="mb-6 h-64 w-auto sm:h-[22rem]"
          />
          <h1 className="kp-display text-[clamp(2rem,5.2vw,4.25rem)] uppercase text-kp-hi">
            <span className="block whitespace-nowrap">Allena la mente.</span>
            <span className="block whitespace-nowrap">
              Cambia il <span className="text-kp-red">gioco.</span>
            </span>
          </h1>

          <Reveal delay={0.15} className="mt-6 max-w-lg">
            <p className="text-lg leading-relaxed text-kp-mid">
              Kai Pai è la piattaforma che unisce Mental Coach certificati, un
              metodo <span className="text-kp-red">scientifico</span> e strumenti
              digitali per potenziare la performance mentale di atleti,
              allenatori e squadre.
            </p>
          </Reveal>

          <Reveal delay={0.25} className="mt-9">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/coaches"
                className="kp-cta group inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 font-semibold text-white"
              >
                Trova un Coach
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a
                href="#metodo"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-kp-line px-6 py-3.5 font-medium text-kp-hi backdrop-blur-sm transition-colors hover:border-kp-hi/30"
              >
                Scopri il Metodo
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </Reveal>
        </div>

        {/* "Watch the video" widget (left) beside the trust badges */}
        <Reveal
          delay={0.35}
          className="mt-8 flex flex-col gap-6 lg:mt-10 lg:flex-row lg:items-center lg:gap-8"
        >
          <VideoCta />
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
            {TRUST.map((t) => (
              <span
                key={t.label}
                className="inline-flex items-center gap-2 text-sm text-kp-mid"
              >
                <t.icon className="h-4 w-4 text-kp-red" />
                {t.label}
              </span>
            ))}
          </div>
        </Reveal>
      </div>

      {/* scroll hint */}
      <div className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 text-kp-low">
        <div className="mx-auto h-10 w-[1px] bg-gradient-to-b from-kp-mid to-transparent" />
      </div>
    </section>
  );
}

function Sparkline() {
  return (
    <svg width="52" height="26" viewBox="0 0 52 26" fill="none" aria-hidden>
      <polyline
        points="2,22 14,16 24,19 34,9 50,3"
        stroke="#e11d2a"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="50" cy="3" r="2" fill="#f5333f" />
    </svg>
  );
}
