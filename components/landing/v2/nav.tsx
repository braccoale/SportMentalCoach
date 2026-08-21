'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/**
 * La barra della v2.
 *
 * Non è la `SiteNav` della home e non vuole esserlo: quella porta cinque voci
 * di sezione, la modale di accesso, il menu mobile e lo stato utente via SWR.
 * Qui la pagina è un racconto lineare con una sola uscita, e cinque ancore
 * verso sezioni pinnate sarebbero cinque modi di uscire dal racconto a metà.
 *
 * Resta il logo — il vincolo esplicito del brief — una via d'accesso per chi
 * è già cliente, e una sola azione.
 *
 * Il colore non è deciso qui: la barra legge la stagione della pagina dalla
 * classe `kp2-day` su `html`, che è la stessa cosa che guarda il resto del
 * foglio. Una barra che si schiarisce da sola, con una sua soglia di scroll,
 * prima o poi si schiarisce mentre la scena sotto è ancora buia.
 */
export function NavV2() {
  const [scrolled, setScrolled] = useState(false);
  const progress = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
      if (progress.current) {
        progress.current.style.transform = `scaleX(${ratio})`;
      }
      setScrolled(window.scrollY > 40);
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div
        aria-hidden
        ref={progress}
        className="fixed left-0 top-0 z-[80] h-[2px] w-full origin-left bg-kp-red"
        style={{ transform: 'scaleX(0)' }}
      />

      <header
        className={`kp2-nav fixed inset-x-0 top-0 z-[70] transition-[background-color,backdrop-filter] duration-500 ${
          scrolled ? 'kp2-nav-solid' : ''
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="KaiPai — home">
            <img
              src="/logo.jpg"
              alt=""
              width={127}
              height={141}
              className="h-10 w-10 rounded-lg"
            />
            <span className="font-display text-lg font-semibold tracking-tight">
              KaiPai
            </span>
          </Link>

          <div className="flex items-center gap-5 sm:gap-7">
            <Link
              href="/sign-in"
              className="hidden text-sm font-medium opacity-70 transition-opacity hover:opacity-100 sm:block"
            >
              Accedi
            </Link>
            <Link
              href="/sign-up"
              className="kp2-cta group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white"
            >
              Prova KaiPai
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
