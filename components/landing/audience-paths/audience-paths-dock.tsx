'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutGrid } from 'lucide-react';
import {
  AUDIENCE_CARDS,
  audienceReturnHref,
  type AudienceId,
} from './audience-cards';
import { isPlainClick, navigateWithMorph } from './morph-navigation';

/**
 * La barra dei percorsi sulle pagine dedicate (/diventa-coach, /societa,
 * /famiglie): le cinque card in miniatura, sempre a un tocco.
 *
 * Compare appena si lascia la prima schermata — sopra la hero sarebbe solo
 * rumore — e resta, scendendo e risalendo. Permette di passare di lato da un
 * percorso all'altro senza tornare alla home. «Tutti» riporta alle card con quella di provenienza già
 * aperta (`audienceReturnHref`).
 */
export function AudiencePathsDock({ current }: { current: AudienceId }) {
  const [visible, setVisible] = useState(false);
  const router = useRouter();
  const currentCard = AUDIENCE_CARDS.find((card) => card.id === current);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      // Visibile appena si lascia la prima schermata, sia scendendo sia
      // risalendo: è la via per passare a un altro percorso, deve esserci
      // quando serve e non solo quando si torna indietro.
      setVisible(window.scrollY > window.innerHeight * 0.4);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <nav
      aria-label="Gli altri percorsi KaiPai"
      data-visible={visible}
      className="kp-aud-dock fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-6"
    >
      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-kp-ink/90 p-1.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md">
        <Link
          href={audienceReturnHref(current)}
          onClick={(e) => {
            // Il morph all'indietro solo dove la card esiste come foto: la
            // riga desktop. Su mobile la fisarmonica non ha la foto grande.
            if (
              !currentCard?.morph ||
              !isPlainClick(e) ||
              !window.matchMedia('(min-width: 1280px)').matches
            ) {
              return;
            }
            e.preventDefault();
            navigateWithMorph(
              router,
              audienceReturnHref(current),
              `[data-aud-photo="${current}"]`
            );
          }}
          className="flex h-10 items-center gap-2 rounded-full px-3 text-xs font-semibold text-kp-hi transition-colors hover:bg-white/10 sm:px-4 sm:text-sm"
        >
          <LayoutGrid className="h-4 w-4 text-kp-red" aria-hidden />
          <span className="hidden sm:inline">Tutti i percorsi</span>
          <span className="sm:hidden">Tutti</span>
        </Link>
        <span aria-hidden className="mx-1 h-6 w-px bg-white/10" />
        {AUDIENCE_CARDS.map((card) => {
          const isCurrent = card.id === current;
          const content = (
            <>
              <span
                className={`relative block h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 transition-[box-shadow] ${
                  isCurrent ? 'ring-kp-red' : 'ring-transparent'
                }`}
              >
                <Image
                  src={card.image.src}
                  alt=""
                  fill
                  sizes="36px"
                  className="object-cover"
                  style={{ objectPosition: card.image.position }}
                />
              </span>
              <span
                className={`hidden pr-2 text-xs font-semibold lg:inline ${
                  isCurrent ? 'text-kp-hi' : 'text-kp-mid'
                }`}
              >
                {card.short}
              </span>
            </>
          );
          const className = `flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-white/10 ${
            isCurrent ? 'bg-white/[0.06]' : ''
          }`;
          return card.page.startsWith('/#') ? (
            <a
              key={card.id}
              href={card.page}
              title={card.short}
              aria-label={card.short}
              className={className}
            >
              {content}
            </a>
          ) : (
            <Link
              key={card.id}
              href={card.page}
              title={card.short}
              aria-label={card.short}
              aria-current={isCurrent ? 'page' : undefined}
              className={className}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
