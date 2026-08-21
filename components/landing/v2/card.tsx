import type { ReactNode } from 'react';

/**
 * La card della v2.
 *
 * Sostituisce il «biglietto» in vetro smerigliato con cui questa pagina era
 * partita. Il biglietto era una bella forma e una cattiva idea: le tacche e la
 * perforazione portavano il discorso su un viaggio con partenza e arrivo,
 * mentre qui si racconta un lavoro che si ripete ogni settimana. E il vetro,
 * sul nero pieno, non è vetro: è un rettangolo grigio.
 *
 * Una superficie piena, un filo di bordo, un'ombra corta. Il contenuto scritto
 * dentro è la cosa che si guarda — che è poi la ragione per cui le card del
 * percorso funzionavano già prima: non per come erano fatte, per che cosa
 * c'era scritto.
 *
 * Il colore lo prende dai ruoli (`--kp2-card`, `--kp2-card-line`), quindi la
 * stessa card attraversa l'alba insieme al resto della pagina.
 */
export function SceneCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`kp2-card ${className}`}>{children}</div>;
}

/** Il filo che separa la testa di una card dal suo contenuto. */
export function CardDivider({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`kp2-card-line h-px w-full ${className}`} />;
}

/**
 * Il prima e il dopo.
 *
 * Due righe, non due colonne con una freccia in mezzo: affiancate, le due
 * frasi si leggono come alternative fra cui scegliere. Una sopra l'altra si
 * leggono come sono — la stessa cosa, in due momenti.
 */
export function BeforeAfter({
  before,
  after,
  beforeLabel = 'Prima',
  afterLabel = 'Dopo',
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  return (
    <dl className="space-y-4">
      <div className="flex items-baseline gap-4">
        <dt className="kp2-eyebrow kp2-mid w-16 shrink-0">{beforeLabel}</dt>
        <dd className="kp2-mid text-base leading-snug">{before}</dd>
      </div>

      <CardDivider />

      <div className="flex items-baseline gap-4">
        <dt className="kp2-eyebrow w-16 shrink-0 text-kp-red">{afterLabel}</dt>
        <dd className="kp2-display kp2-fg text-lg leading-snug sm:text-xl">
          {after}
        </dd>
      </div>
    </dl>
  );
}
