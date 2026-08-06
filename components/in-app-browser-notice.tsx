'use client';

import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import {
  detectInAppBrowser,
  type InAppBrowser,
} from '@/lib/core/video/capabilities';

/**
 * Avviso per chi è arrivato dal browser interno di un'app social.
 *
 * Non blocca il passaggio: su Android quei WebView a volte funzionano, e
 * sbarrare la strada a chi sarebbe potuto entrare è un danno peggiore di un
 * avviso ignorato. Su iOS, dove camera e microfono non sono proprio
 * disponibili, l'avviso è rosso e non si può chiudere: lì proseguire non porta
 * da nessuna parte, e fingere il contrario farebbe perdere la sessione.
 *
 * Il rilevamento gira solo nel browser: lo user-agent lato server è quello
 * della richiesta HTML e in una app installata come PWA non corrisponde a
 * quello del WebView che poi esegue la chiamata.
 */
export function InAppBrowserNotice({ className }: { className?: string }) {
  const [detected, setDetected] = useState<InAppBrowser | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDetected(detectInAppBrowser(navigator.userAgent));
  }, []);

  if (!detected || dismissed) return null;

  const blocking = detected.severity === 'blocking';

  return (
    <div
      role="alert"
      data-testid="in-app-browser-notice"
      data-severity={detected.severity}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
        blocking
          ? 'border-red-300 bg-red-50 text-red-900'
          : 'border-amber-300 bg-amber-50 text-amber-900'
      } ${className ?? ''}`}
    >
      <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">
          {blocking
            ? `La videochiamata non funziona dentro ${detected.label}`
            : `Stai usando il browser interno di ${detected.label}`}
        </p>
        <p className="mt-1 leading-5">{detected.howToExit}</p>
        {!blocking && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="mt-2 text-xs font-semibold underline underline-offset-2"
          >
            Ho capito, continua qui
          </button>
        )}
      </div>
    </div>
  );
}
