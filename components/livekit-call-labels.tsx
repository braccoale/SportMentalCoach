'use client';

import { useEffect } from 'react';

/** Testi generati dal prefab LiveKit, e come li diciamo noi. */
const SCREEN_SHARE_TEXT: Record<string, string> = {
  'Share screen': 'Condividi',
  'Stop screen share': 'Interrompi condivisione',
};

/**
 * The LiveKit `VideoConference` prefab hard-codes its visible control text and
 * does not expose label props. Keep the vendor prefab (and its
 * accessibility/focus behaviour) intact, but localize only its generated
 * text nodes and accessible names while it is mounted.
 *
 * La condivisione schermo resta visibile ovunque, telefono compreso: e' una
 * funzione richiesta esplicitamente e il supporto dei browser mobili cambia
 * nel tempo, quindi la decisione la prende chi prova a premerla, non noi.
 */
export function LocalizeLiveKitControls() {
  useEffect(() => {
    const localize = () => {
      document
        .querySelectorAll<HTMLButtonElement>('button.lk-disconnect-button')
        .forEach((button) => {
          button.setAttribute('aria-label', 'Chiudi videochiamata');
          for (const node of Array.from(button.childNodes)) {
            if (
              node.nodeType === Node.TEXT_NODE &&
              node.textContent?.trim() === 'Leave'
            ) {
              node.textContent = 'Chiudi';
            }
          }
        });

      document
        .querySelectorAll<HTMLButtonElement>(
          'button[data-lk-source="screen_share"]'
        )
        .forEach((button) => {
          const active = button.getAttribute('data-lk-enabled') === 'true';
          button.setAttribute(
            'aria-label',
            active ? 'Interrompi condivisione schermo' : 'Condividi schermo'
          );
          for (const node of Array.from(button.childNodes)) {
            if (node.nodeType !== Node.TEXT_NODE) continue;
            const current = node.textContent?.trim() ?? '';
            const translated = SCREEN_SHARE_TEXT[current];
            if (translated) node.textContent = translated;
          }
        });
    };

    localize();
    const observer = new MutationObserver(localize);
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
      // Solo l'attributo che ci riguarda: durante una chiamata LiveKit ne
      // aggiorna in continuazione (chi sta parlando, la qualita' della rete)
      // e osservarli tutti farebbe girare questa funzione a ogni frame.
      attributes: true,
      attributeFilter: ['data-lk-enabled'],
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
