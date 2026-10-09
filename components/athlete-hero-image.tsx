'use client';

import { useState } from 'react';

/**
 * L'immagine in alto a destra nella dashboard dell'atleta.
 *
 * Riceve un elenco ordinato di candidati (`heroImageCandidates`): prova il
 * primo e, se il file non c'è, passa al successivo, fino all'immagine neutra.
 * Se non ne trova nessuna non mostra niente: la pagina resta com'è, senza un
 * riquadro rotto. È decorativa (nessun testo alternativo, nascosta ai lettori
 * di schermo) e non intercetta i clic.
 *
 * L'immagine si fonde con lo sfondo: `mix-blend-multiply` rende invisibile un
 * fondo bianco, e la maschera la sfuma a sinistra e in basso, così qualunque
 * foto con il soggetto a destra sta bene senza ritagli. `object-contain` in
 * alto a destra: una foto orizzontale e una verticale entrano intere, nessuna
 * viene tagliata. Sotto `md` si
 * nasconde: su un telefono la foto toglierebbe spazio al titolo.
 */
export function AthleteHeroImage({ candidates }: { candidates: string[] }) {
  const [index, setIndex] = useState(0);
  const src = candidates[index];
  if (!src) return null;

  const mask =
    'linear-gradient(to right, transparent 0%, #000 38%), linear-gradient(to top, transparent 0%, #000 22%), linear-gradient(to bottom, transparent 0%, #000 8%), linear-gradient(to left, transparent 0%, #000 6%)';

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -top-[8.5rem] right-0 hidden h-[24rem] w-[min(58%,48rem)] md:block"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={src}
        src={src}
        alt=""
        decoding="async"
        onError={() => setIndex((i) => i + 1)}
        className="h-full w-full object-contain object-right-top mix-blend-multiply"
        style={{
          WebkitMaskImage: mask,
          maskImage: mask,
          WebkitMaskComposite: 'source-in',
          maskComposite: 'intersect',
        }}
      />
    </div>
  );
}
