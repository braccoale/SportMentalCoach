import type { AudienceId } from './audience-cards';

/**
 * Il morph fra la foto di una card percorso e la hero della sua pagina.
 *
 * Nome fisso, non assegnato dal framework: la foto nella card e la foto nella
 * hero portano lo stesso `view-transition-name`, e il browser le accoppia. Il
 * `<ViewTransition>` di React non bastava: al momento dell'istantanea la
 * pagina nuova era ancora allo scroll della home, la hero fuori schermo, e
 * l'accoppiamento saltava — si vedeva un taglio netto.
 */
export function audiencePhotoName(id: AudienceId): string {
  return `kp-aud-photo-${id}`;
}

type Router = { push: (href: string) => void };

type DocumentWithTransitions = Document & {
  startViewTransition?: (update: () => Promise<void>) => unknown;
};

/** Quanto si aspetta la pagina nuova prima di rinunciare all'effetto. */
const MAX_WAIT_MS = 1500;

function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

/**
 * Naviga dentro una View Transition e fa scattare l'istantanea solo quando
 * `targetSelector` è sulla pagina nuova e dentro lo schermo — cioè dopo che
 * Next ha anche sistemato lo scroll. Senza supporto (Firefox) o con
 * `prefers-reduced-motion`, è una navigazione normale.
 */
export function navigateWithMorph(
  router: Router,
  href: string,
  targetSelector: string
): void {
  const doc = document as DocumentWithTransitions;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced) {
    router.push(href);
    return;
  }

  const targetPath = new URL(href, window.location.href).pathname;
  doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const started = performance.now();
        router.push(href);
        const check = () => {
          const arrived = window.location.pathname === targetPath;
          const target = arrived ? document.querySelector(targetSelector) : null;
          if (target && inViewport(target)) {
            resolve();
            return;
          }
          if (performance.now() - started > MAX_WAIT_MS) {
            resolve();
            return;
          }
          // setTimeout, non requestAnimationFrame: mentre la transizione
          // aspetta l'aggiornamento il disegno è sospeso e rAF non scatta —
          // il controllo si fermava e il browser annullava per timeout.
          window.setTimeout(check, 16);
        };
        check();
      })
  );
}

/** Un click «normale»: senza tasti che chiedono una nuova scheda o finestra. */
export function isPlainClick(e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
