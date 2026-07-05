import { Reveal } from './reveal';
import { ImageSlot } from './image-slot';

const SECTION =
  'kp-snap relative flex min-h-svh flex-col justify-center py-20 sm:py-24';
const WRAP = 'mx-auto max-w-7xl px-5 sm:px-8';

/**
 * "L'ecosistema dell'atleta" — the radial diagram (athlete + allenatori +
 * genitori, with their focus areas) is supplied as a single pre-composed image
 * at `public/ecosystem-diagram.jpg`; only the eyebrow + headline stay as live
 * text. Swap the asset to restyle the diagram — no layout code to touch.
 */
export function EcosystemAthlete() {
  return (
    <section
      id="ecosistema-atleta"
      className={`${SECTION} overflow-hidden bg-kp-ink2`}
    >
      <ImageSlot
        src="/orizzonte.jpg"
        position="center"
        placeholder="none"
        className="absolute inset-0"
      >
        <div className="absolute inset-0 bg-kp-ink/80" />
        <div className="kp-vignette absolute inset-0" />
      </ImageSlot>
      <div className={`relative z-10 ${WRAP}`}>
        {/* Header */}
        <div className="mx-auto max-w-5xl text-center">
          <Reveal>
            <p className="kp-eyebrow text-kp-red">Nessuno cresce da solo</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="kp-display mt-4 text-[clamp(1.7rem,4vw,3rem)] text-kp-hi">
              <span className="block lg:whitespace-nowrap">
                Non alleniamo solo l&apos;atleta.
              </span>
              <span className="block lg:whitespace-nowrap">
                Alleniamo tutto il suo{' '}
                <span className="text-kp-red">ecosistema</span>.
              </span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-kp-mid">
              Un ragazzo cresce dove crescono anche il suo allenatore e la sua
              famiglia. Per questo il percorso Kai Pai li unisce.
            </p>
          </Reveal>
        </div>

        {/* Radial diagram — single composed asset */}
        <Reveal delay={0.1} className="mt-12">
          <img
            src="/ecosystem-diagram.jpg"
            alt="L'ecosistema Kai Pai: attorno all'atleta lavoriamo con allenatori e genitori. Atleta: gestione della pressione, concentrazione, ansia e stress, recupero infortuni, autostima e fiducia. Allenatori: leadership e comunicazione, gestione del gruppo, motivazione e obiettivi, performance mindset. Genitori: aspettative consapevoli, supporto positivo, comunicazione efficace, benessere emotivo. Un metodo integrato per far crescere atleti migliori, persone migliori."
            className="mx-auto w-full max-w-5xl"
          />
        </Reveal>
      </div>
    </section>
  );
}
