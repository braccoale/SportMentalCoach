import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from './reveal';
import { ImageSlot } from './image-slot';
import { VideoCta } from './video-cta';
import { ParallaxGroup, ParallaxLayer, AnimatedHeadline } from './hero-fx';
import { Synapses } from './synapses';
import { LiveStats } from './live-stats';
import type { LandingStats } from '@/lib/db/schema';

const SIDE_STATS = [
  { label: 'Concentrazione', value: '+28%', float: 'kp-float' },
  { label: 'Resilienza', value: '+35%', float: 'kp-float-slow' },
  { label: 'Gestione stress', value: '+42%', float: 'kp-float' },
];

/**
 * Cinematic hero — the trust-in-5-seconds moment. A large portrait bleeds
 * full-height on the right (behind the transparent nav), lit by a neural glow,
 * with floating glass widgets alongside. Drop the portrait at
 * `public/hero-athlete.jpg`; until then the slot shows an elegant dark
 * placeholder with the glow, never a broken frame.
 */
export function Hero({ stats }: { stats: LandingStats }) {
  return (
    <section className="kp-snap kp-grain relative min-h-[100svh] overflow-hidden">
      <ParallaxGroup className="absolute inset-0">
      {/* Portrait media slot — right bleed, drifts gently against the cursor.
          Slightly overscanned (-inset) so the parallax never shows edges. */}
      <ParallaxLayer
        depth={-9}
        className="absolute -inset-3 lg:left-auto lg:-right-3 lg:w-[66%]"
      >
        <ImageSlot
          src="/hero-athlete.jpg"
          position="70% top"
          placeholder="none"
          label="Ritratto atleta"
          imageClassName="kp-breathe-img"
          className="absolute inset-0"
        >
          {/* Neural brain: heartbeat glow + radiating pulse waves + live synapses */}
          <div className="absolute left-[40%] top-[6%] hidden h-64 w-64 lg:block">
            <div className="kp-pulse-ring absolute inset-10" />
            <div className="kp-pulse-ring kp-pulse-ring-delayed absolute inset-10" />
            <div className="kp-brainglow kp-glow-anim absolute inset-4" />
            <Synapses className="absolute inset-0 h-full w-full" />
          </div>
          {/* legibility + depth scrims */}
          <div className="absolute inset-0 bg-gradient-to-r from-kp-ink via-kp-ink/75 to-transparent lg:via-kp-ink/35" />
          <div className="absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-kp-ink via-kp-ink/55 to-transparent" />
          <div className="kp-vignette absolute inset-0" />
        </ImageSlot>
      </ParallaxLayer>

      {/* Floating stat widgets — deepest layer, follow the cursor */}
      <ParallaxLayer
        depth={26}
        className="absolute right-48 top-1/2 z-20 hidden -translate-y-1/2 xl:block"
      >
        <div className="flex flex-col gap-6">
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
      </ParallaxLayer>
      </ParallaxGroup>

      {/* Content */}
      <div className="pointer-events-none relative z-10 mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-5 pb-16 pt-24 sm:px-8 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <div className="max-w-xl">
          <img
            src="/logo-transparent-clean.png"
            alt="KaiPai — Mental Coaching"
            width={626}
            height={178}
            className="mb-6 h-64 w-auto sm:h-[22rem]"
          />
          <AnimatedHeadline />

          <Reveal delay={0.15} className="mt-6 max-w-lg">
            <p className="text-lg leading-relaxed text-kp-mid">
              Non formiamo solo atleti più forti. Accompagniamo le persone a
              diventare la <span className="text-kp-red">versione migliore</span>{' '}
              di sé — attraverso lo sport, con un metodo e una guida al fianco.
            </p>
          </Reveal>

          <Reveal delay={0.25} className="mt-9">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/coaches"
                className="kp-cta group inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 font-semibold text-white"
              >
                Inizia il tuo percorso
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

        {/* "Watch the video" widget (left) accanto ai numeri reali */}
        <Reveal
          delay={0.35}
          className="mt-8 flex flex-col gap-6 lg:mt-10 lg:flex-row lg:items-center lg:gap-8"
        >
          <VideoCta />
          <LiveStats stats={stats} />
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
