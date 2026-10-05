import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/landing/reveal';
import { ImageSlot } from '@/components/landing/image-slot';

const SECTION =
  'kp-snap relative flex min-h-svh flex-col justify-center py-20 sm:py-24';
const WRAP = 'mx-auto max-w-7xl px-5 sm:px-8';

/**
 * Francesco Borrelli e l’origine di KaiPai. Stava in home; ora apre la pagina
 * /chi-siamo, che Google può indicizzare come pagina a sé. Con
 * `asPageHeading` la riga sopra la citazione è l’H1 della pagina.
 */
export function FounderSection({ asPageHeading = false }: { asPageHeading?: boolean } = {}) {
  const chips = ['Certificato ACSI–CONI', 'Autore', 'Al fianco di atleti olimpici e calciatori pro'];
  return (
    <section id="origine" className={`${SECTION} overflow-hidden`}>
      {/* Lo stadio di sera: lo sfondo che era di «Il mondo è già cambiato». */}
      <ImageSlot
        src="/stadio.jpg"
        position="center"
        placeholder="none"
        className="absolute inset-0"
      >
        <div className="absolute inset-0 bg-kp-ink/80" />
        <div className="kp-vignette absolute inset-0" />
      </ImageSlot>
      <div className={`relative z-10 ${WRAP} grid items-center gap-14 lg:grid-cols-[0.8fr_1.2fr]`}>
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
            {asPageHeading ? (
              <h1 className="kp-eyebrow text-kp-red">Chi siamo · L’origine di KaiPai</h1>
            ) : (
              <p className="kp-eyebrow text-kp-red">L’origine</p>
            )}
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
