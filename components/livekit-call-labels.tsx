'use client';

import { useEffect } from 'react';

/**
 * The LiveKit `VideoConference` prefab hard-codes its visible disconnect text
 * to “Leave” and does not expose a label prop. Keep the vendor prefab (and its
 * accessibility/focus behaviour) intact, but localize only its generated
 * text node and accessible name while it is mounted.
 */
export function LocalizeLiveKitLeaveButton() {
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
    };

    localize();
    const observer = new MutationObserver(localize);
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, []);

  return null;
}
