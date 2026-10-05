import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Reveal } from './reveal';
import { ImageSlot } from './image-slot';
import { ParallaxGroup, ParallaxLayer, AnimatedHeadline } from './hero-fx';
import { Synapses } from './synapses';
import { LiveStats } from './live-stats';
import type { LandingStats } from '@/lib/db/schema';

/**
 * Cinematic hero — the trust-in-5-seconds moment. A large portrait bleeds
 * full-height on the right (behind the transparent nav), lit by a neural glow,
 * with the headline and the action row on the left. Drop the portrait at
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

      </ParallaxGroup>

      {/* Content */}
      <div className="pointer-events-none relative z-10 mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-5 pb-16 pt-24 sm:px-8 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <div className="max-w-xl">
          {/* Il logo era alto 22rem e spingeva il titolo a metà schermo. Ora
              è dimensionato per lasciare il titolo nella parte alta della
              hero, che è quello che si deve leggere per primo. */}
          <img
            src="/logo-transparent-clean.png"
            alt="KaiPai — Mental Coaching"
            width={626}
            height={178}
            className="mb-4 h-40 w-auto sm:h-56"
          />
          <AnimatedHeadline />

          <Reveal delay={0.15} className="mt-6 max-w-lg">
            <p className="text-lg leading-relaxed text-kp-mid">
              Non formiamo solo atleti più forti. Accompagniamo le persone a
              diventare la <span className="text-kp-red">versione migliore</span>{' '}
              di sé — attraverso lo sport, con un metodo e una guida al fianco.
            </p>
          </Reveal>
        </div>

        {/* Riga d'azione: le due CTA sulla stessa linea. */}
        <Reveal delay={0.25} className="mt-9 max-w-3xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Porta alle cinque card subito sotto: prima di scegliere un
                coach, chi arriva sceglie il proprio percorso. */}
            <a
              href="#percorsi"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-7 py-3.5 font-semibold text-white transition-colors hover:bg-green-700"
            >
              Inizia il tuo percorso
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </a>
            <Link
              href="/coaches"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-kp-line px-6 py-3.5 font-medium text-kp-hi backdrop-blur-sm transition-colors hover:border-kp-hi/30"
            >
              Scegli un coach
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>

        {/* I numeri reali, sotto la riga d'azione. Ritardo corto: sono
            contenuto della prima schermata, non una sorpresa da scoprire. */}
        <Reveal delay={0.1} className="mt-8 lg:mt-10">
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
