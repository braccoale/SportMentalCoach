/**
 * L'ecosistema dell'atleta.
 *
 * Il diagramma è un'unica immagine già composta (`public/ecosystem-diagram.jpg`):
 * per restilizzarlo si cambia l'asset, non il layout. Il testo alternativo
 * descrive per intero le tre aree e le loro voci, perché tutto il contenuto di
 * questa scena vive dentro un file JPEG e altrimenti sarebbe inaccessibile a
 * chi non lo vede — e invisibile a chi indicizza la pagina.
 *
 * Sta qui, subito prima di «Scegli il tuo percorso», perché insieme fanno una
 * coppia: prima il sistema — atleta, allenatori, genitori — poi la porta da
 * cui ci entri.
 *
 * Due differenze rispetto alla versione precedente di questa sezione:
 *
 * 1. Niente `<Reveal>`. Quel componente parte a `opacity: 0` e conta su
 *    `RevealProvider` per accendersi; il provider non è più montato nella home,
 *    quindi reincollare la sezione com'era l'avrebbe resa semplicemente
 *    invisibile — senza errori e senza che nulla lo segnalasse.
 *
 * 2. Niente `orizzonte.png` come sfondo. È un PNG da 1,7 MB per una fotografia,
 *    e stava sotto un velo all'80%: costava quanto tutto il resto della pagina
 *    e non si vedeva. Il diagramma è il contenuto; il fondo può essere fondo.
 */
export function SceneEcosystem() {
  return (
    <section
      id="ecosistema-atleta"
      className="relative overflow-hidden bg-kp-ink py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <p className="kp-eyebrow text-kp-red">Nessuno cresce da solo</p>
          <h2 className="kp-display mt-5 text-[clamp(1.9rem,4.4vw,3.4rem)] font-bold leading-[1.02] tracking-tight text-kp-hi">
            Non alleniamo solo l&apos;atleta.
            <br />
            Alleniamo tutto il suo{' '}
            <span className="text-kp-red">ecosistema</span>.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-kp-mid">
            Un ragazzo cresce dove crescono anche il suo allenatore e la sua
            famiglia. Per questo il percorso KaiPai li unisce.
          </p>
        </div>

        <img
          src="/ecosystem-diagram.jpg"
          alt="L'ecosistema KaiPai: attorno all'atleta lavoriamo con allenatori e genitori. Atleta: gestione della pressione, concentrazione, ansia e stress, recupero infortuni, autostima e fiducia. Allenatori: leadership e comunicazione, gestione del gruppo, motivazione e obiettivi, performance mindset. Genitori: aspettative consapevoli, supporto positivo, comunicazione efficace, benessere emotivo. Un metodo integrato per far crescere atleti migliori, persone migliori."
          loading="lazy"
          decoding="async"
          className="mx-auto mt-16 w-full max-w-5xl"
        />
      </div>
    </section>
  );
}
