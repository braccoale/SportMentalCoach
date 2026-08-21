import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ImageSlot } from './image-slot';

/**
 * Scena 1 — l'hero.
 *
 * Una sola idea: allenare la mente. Un titolo, una riga, una CTA primaria.
 *
 * Rispetto alla versione precedente sono usciti i tre widget di vetro con le
 * percentuali, le sinapsi animate e gli anelli pulsanti: erano la cosa più
 * riconoscibilmente "software" della pagina, e competevano con il titolo
 * proprio nei tre secondi in cui il titolo deve vincere. I numeri reali non
 * sono spariti — vivono nella scena 4, dove parlare di piattaforma ha senso.
 *
 * Nessun movimento allo scroll qui: l'hero è già in cima, non c'è nulla da
 * rivelare. Il primo movimento della pagina arriva nella scena 2, e proprio
 * per questo si nota.
 */
export function SceneHero() {
  return (
    <section className="kp-grain relative flex min-h-[100svh] flex-col justify-end overflow-hidden bg-kp-ink">
      {/* Slot marcato — l'immagine che questa pagina merita non esiste ancora.
          Serve un volto in primo piano, pre-gara, 2560px. `hero-athlete.jpg`
          è 1535×569: su uno schermo alto viene stirata. */}
      <ImageSlot
        src="/hero-athlete.jpg"
        position="70% 30%"
        placeholder="none"
        label="Atleta prima della gara"
        className="absolute inset-0"
      >
        {/* Tre veli sovrapposti spegnevano la foto fino a 20/255: il ritratto
            c'era ma non si vedeva. Ora il velo verticale copre solo la fascia
            bassa dove sta il testo, e quello orizzontale si ferma a metà. La
            fotografia è la cosa che deve reggere questa schermata. */}
        <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-kp-ink via-kp-ink/75 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-kp-ink/80 via-kp-ink/25 to-transparent" />
      </ImageSlot>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-20 sm:px-8 sm:pb-28">
        {/* Nessun logo qui: `SiteNav` ne mostra già uno fisso in alto a
            sinistra, e i due finivano impilati uno sotto l'altro nella stessa
            colonna. Il primo elemento della pagina dev'essere il titolo. */}
        <h1 className="kp-display max-w-4xl text-[clamp(2.6rem,9vw,7.5rem)] font-bold leading-[0.9] tracking-tight text-kp-hi">
          ALLENA LA MENTE.
          <br />
          CAMBIA IL <span className="text-kp-red">GIOCO</span>.
        </h1>

        <p className="mt-8 max-w-lg text-lg leading-relaxed text-kp-mid">
          Il metodo, la scuola e la rete di coach che allenano la testa di chi
          fa sport.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Link
            href="/coaches"
            className="kp-cta group inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-semibold text-white"
          >
            Inizia il tuo percorso
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <a
            href="#metodo"
            className="text-base font-medium text-kp-mid underline-offset-8 transition-colors hover:text-kp-hi hover:underline"
          >
            Scopri il Metodo
          </a>
        </div>
      </div>
    </section>
  );
}
