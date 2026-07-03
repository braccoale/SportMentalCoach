'use client';

import { useEffect, useState } from 'react';
import { Play, X } from 'lucide-react';

/**
 * "Guarda il video" widget that opens a popup playing the presentation video
 * (public/kaipai.mp4) instead of scrolling to a section.
 */
export function VideoCta() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="kp-glass kp-float-slow group hidden items-center gap-3 rounded-full py-2 pl-2 pr-5 text-left lg:flex"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-kp-red text-white transition-transform group-hover:scale-105">
          <Play className="h-4 w-4 fill-current" />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold text-kp-hi">
            Guarda il video
          </span>
          <span className="block text-xs text-kp-mid">
            Scopri Kai Pai in 1:30
          </span>
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Video di presentazione"
        >
          <button
            type="button"
            aria-label="Chiudi"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/80 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-3xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Chiudi"
              className="absolute -top-10 right-0 text-kp-mid transition-colors hover:text-kp-hi"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-kp-line bg-black">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                className="absolute inset-0 h-full w-full"
                src="/kaipai.mp4"
                controls
                autoPlay
                playsInline
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
