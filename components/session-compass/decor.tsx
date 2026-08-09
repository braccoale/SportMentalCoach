import Image from 'next/image';

/**
 * Ornamenti del riepilogo sessione.
 *
 * Immagini vere e non geometria disegnata: la profondità e la grana di
 * queste non si ottengono con qualche ellisse in SVG, e il tentativo di
 * farlo aveva prodotto qualcosa di visibilmente più povero.
 *
 * Passano tutte da `next/image`. Gli originali pesano fra 1 e 2 MB l'uno:
 * serviti così affosserebbero la pagina. L'ottimizzatore li converte in
 * formati moderni e li ridimensiona alla larghezza che servono davvero,
 * quindi il peso reale è una frazione.
 *
 * Nessuna porta contenuto: sono `aria-hidden`, non entrano nel flusso di
 * lettura e non intercettano il mouse. Un ornamento che ruba un clic smette
 * di essere un ornamento.
 */

type DecorProps = {
  className?: string;
  /** Larghezze previste, per far scegliere a Next la versione giusta. */
  sizes?: string;
};

function Decor({
  src,
  className = '',
  sizes = '(max-width: 1024px) 0px, 400px',
  objectPosition = 'center',
}: DecorProps & { src: string; objectPosition?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute select-none ${className}`}
    >
      <Image
        src={src}
        alt=""
        fill
        sizes={sizes}
        className="object-cover"
        style={{ objectPosition }}
      />
    </span>
  );
}

/** Onda scura: fondo della fascia della conversazione. */
export function BandWaveDecor({ className = '' }: DecorProps) {
  return (
    <Decor
      src="/decor/band-wave.png"
      className={className}
      sizes="(max-width: 640px) 100vw, 1200px"
      objectPosition="center bottom"
    />
  );
}

/** Sfera in orbita: intestazione della sessione. */
export function OrbitDecor({ className = '' }: DecorProps) {
  return <Decor src="/decor/orbit.png" className={className} sizes="320px" />;
}

/** Sfera a rete: accanto alla lettura AI. */
export function NetworkDecor({ className = '' }: DecorProps) {
  return <Decor src="/decor/network.png" className={className} sizes="420px" />;
}

/** Onda verticale: fianco dei segnali narrativi. */
export function WaveDecor({ className = '' }: DecorProps) {
  return (
    <Decor
      src="/decor/wave.png"
      className={className}
      sizes="(max-width: 640px) 0px, 220px"
    />
  );
}

/** Fondo dei segnali emersi dalla conversazione. */
export function PortraitDecor({ className = '' }: DecorProps) {
  return (
    <Decor
      src="/decor/uomo.png"
      className={className}
      sizes="(max-width: 1024px) 0px, 520px"
      objectPosition="right center"
    />
  );
}
