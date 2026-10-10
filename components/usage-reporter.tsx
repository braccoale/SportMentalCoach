'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { connectionType, sendUsageBeacon } from '@/lib/core/usage/client';

type Vital = { n: string; v: number };

/**
 * Misura, per ogni pagina, quanto ci mette ad aprirsi e a rispondere (le misure
 * standard dei browser: LCP, INP, CLS, TTFB, FCP) e conta le visite alle pagine
 * pubbliche. Le manda a gruppi, quando la persona lascia la pagina, così non
 * pesa e non costa una richiesta per misura.
 *
 * Non porta nessun utente: il server sa solo il percorso come modello, il tipo
 * di dispositivo e la connessione. Non fa niente fuori dalla produzione.
 */
export function UsageReporter() {
  const pathname = usePathname();
  const first = useRef(true);
  const current = useRef(pathname);
  const buffer = useRef<Map<string, Vital[]>>(new Map());

  // Una visita per ogni pagina aperta; il referrer solo alla prima.
  useEffect(() => {
    current.current = pathname;
    const isFirst = first.current;
    first.current = false;
    sendUsageBeacon({
      r: pathname,
      pv: 1,
      ref: isFirst ? document.referrer : '',
      n: isFirst ? 0 : 1,
      c: connectionType(),
    });
  }, [pathname]);

  useReportWebVitals((metric) => {
    const route = current.current;
    const list = buffer.current.get(route) ?? [];
    // INP e CLS si aggiornano: vale l'ultimo valore.
    const next = list.filter((m) => m.n !== metric.name);
    next.push({ n: metric.name, v: metric.name === 'CLS' ? metric.value : Math.round(metric.value) });
    buffer.current.set(route, next);
  });

  useEffect(() => {
    const flush = () => {
      for (const [route, metrics] of buffer.current) {
        if (metrics.length > 0) sendUsageBeacon({ r: route, m: metrics, c: connectionType() });
      }
      buffer.current.clear();
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  return null;
}
