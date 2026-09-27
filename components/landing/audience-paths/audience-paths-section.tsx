'use client';

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight, ChevronDown } from 'lucide-react';
import {
  AUDIENCE_CARDS,
  type AudienceCard,
  type AudienceId,
} from './audience-cards';
import { ContactModal } from '../contact-modal';
import { useRouter } from 'next/navigation';
import {
  audiencePhotoName,
  isPlainClick,
  navigateWithMorph,
} from './morph-navigation';

const WRAP = 'mx-auto max-w-7xl px-5 sm:px-8';

/** Le due tonalità della card desktop: velo, testo e CTA cambiano insieme. */
const TONE = {
  dark: {
    scrim: 'from-kp-ink/80 via-transparent via-45% to-kp-ink/55',
    side: 'from-kp-ink/85 via-kp-ink/45 via-40% to-transparent',
    hi: 'text-kp-hi',
    mid: 'text-kp-mid',
    card: 'bg-kp-ink2',
    fade: 'from-kp-ink2',
    badge: 'bg-white/12 text-white ring-1 ring-white/15 backdrop-blur-sm',
    row: '',
  },
  light: {
    scrim: 'from-white/90 via-white/45 via-35% to-transparent to-60%',
    side: '',
    hi: 'text-kp2-dayhi',
    mid: 'text-kp2-daymid',
    card: 'bg-white',
    fade: 'from-white',
    badge: 'bg-kp2-dayhi text-white shadow-sm',
    // Sulla foto chiara il testo scuro da solo non basta: un alone chiaro
    // sfumato, non una base visibile.
    row: '[text-shadow:0_0_10px_rgba(255,255,255,0.95),0_0_2px_rgba(255,255,255,0.9)]',
  },
} as const;

/**
 * "Qual è il tuo percorso?" — the interactive audience selector, immediately
 * below the Hero.
 *
 * Desktop (xl+): five equal-width portrait cards in one row. Hovering or
 * focusing one grows it (flex-grow, CSS-only transition) while the other
 * four shrink together; a click opens the audience's own page, the button is
 * the shortcut for who is ready. Mobile/tablet: a vertical accordion, one
 * panel open at a time, with both links inside.
 *
 * La sezione è chiara, le card restano scure: le foto sono notturne e il
 * contrasto fra pagina e card è ciò che le fa leggere come oggetti.
 *
 * Foto: una per card, in `public/landing/audience/`. Famiglie e Academy
 * sono luminose e usano la tonalità chiara (velo bianco, testo scuro).
 */
export function AudiencePathsSection() {
  const [contactOpen, setContactOpen] = useState(false);
  const returnedId = useReturnedAudience();

  return (
    <section
      id="percorsi"
      className="kp-snap relative flex min-h-svh flex-col justify-center bg-kp2-day2 py-20 sm:py-24"
    >
      <div className={`${WRAP} w-full min-w-0`}>
        <div className="max-w-2xl">
          <p className="kp-eyebrow text-kp-red">I tuoi percorsi</p>
          <h2 className="kp-display mt-4 text-[clamp(1.9rem,4.5vw,3.5rem)] text-kp2-dayhi">
            Qual è il tuo percorso?
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-kp2-daymid">
            Scopri cosa KaiPai può fare per te.
          </p>
        </div>

        <DesktopRow
          returnedId={returnedId}
          onRequestContact={() => setContactOpen(true)}
        />
        <MobileAccordion
          returnedId={returnedId}
          onRequestContact={() => setContactOpen(true)}
        />
      </div>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </section>
  );
}

/* ── Desktop: hover/focus-to-expand row (xl and up) ── */
/**
 * Da quale pagina dedicata si torna: `?percorso=` scritto dalla barra dei
 * percorsi. Letto dopo il montaggio (la home resta statica) e poi tolto
 * dall'indirizzo, così un ricaricamento non riapre la card.
 */
function useReturnedAudience(): AudienceId | null {
  const [id, setId] = useState<AudienceId | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('percorso');
    const match = AUDIENCE_CARDS.find((card) => card.id === raw);
    if (!match) return;
    setId(match.id);
    url.searchParams.delete('percorso');
    window.history.replaceState(window.history.state, '', url.toString());
  }, []);
  return id;
}

function DesktopRow({
  returnedId,
  onRequestContact,
}: {
  returnedId: AudienceId | null;
  onRequestContact: () => void;
}) {
  const [expandedId, setActiveId] = useState<string | null>(null);
  // Tornando da «Tutti i percorsi» il puntatore è rimasto dov'era il bottone,
  // in basso: la pagina gli fa scorrere sotto una card qualunque, che si
  // aprirebbe al posto di quella di provenienza. Finché il mouse non si muove
  // davvero, l'hover non conta.
  const hoverLocked = useRef(false);
  useEffect(() => {
    if (!returnedId) return;
    setActiveId(returnedId);
    hoverLocked.current = true;
    const unlock = () => {
      hoverLocked.current = false;
    };
    window.addEventListener('pointermove', unlock, { once: true });
    return () => window.removeEventListener('pointermove', unlock);
  }, [returnedId]);
  const hover = (id: string) => {
    if (!hoverLocked.current) setActiveId(id);
  };

  return (
    <div className="mt-24 hidden h-[600px] gap-3 xl:flex">
      {AUDIENCE_CARDS.map((card) => {
        const isExpanded = expandedId === card.id;
        const tone = TONE[card.tone ?? 'dark'];
        return (
          <div
            key={card.id}
            data-expanded={isExpanded}
            className="kp-aud-slot relative min-w-0"
            style={{
              // Proporzioni, non larghezze minime: con cinque card e una
              // espansa, qualunque somma di minimi fissi sfora il contenitore.
              // 2.7 su 6.7 = ~40% per la card aperta.
              flexGrow: isExpanded ? 2.7 : 1,
              flexBasis: 0,
            }}
            onMouseEnter={() => hover(card.id)}
            onMouseLeave={() => {
              if (hoverLocked.current) return;
              setActiveId((cur) => (cur === card.id ? null : cur));
            }}
            onFocus={() => setActiveId(card.id)}
            onBlur={(e: FocusEvent<HTMLDivElement>) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setActiveId((cur) => (cur === card.id ? null : cur));
              }
            }}
          >
          {/* Tooltip sopra la card, fuori dal suo ritaglio: dice dove porta il
              click senza coprire niente. Sparisce sopra il bottone. */}
          <div aria-hidden className="kp-aud-tip pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 w-72 -translate-x-1/2 rounded-2xl bg-kp-ink px-4 py-3 shadow-xl">
            <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-kp-ink" />
            <p className="relative flex items-center gap-1.5 text-[0.8rem] font-semibold text-kp-hi">
              {card.preview.title}
              <ArrowUpRight className="h-3.5 w-3.5 text-kp-red" />
            </p>
            <p className="relative mt-1 text-xs leading-snug text-kp-mid">
              {card.preview.text}
            </p>
          </div>
          <div
            data-expanded={isExpanded}
            className={`kp-aud-card group absolute inset-0 overflow-hidden ${tone.card} shadow-[0_18px_40px_-24px_rgba(12,12,18,0.55)] ${
              returnedId === card.id ? 'kp-aud-returned' : ''
            }`}
          >
            {/* Tutta la card porta alla pagina del percorso: l'espansione al
                passaggio è già l'anteprima, il click va avanti. Il bottone sta
                sopra questo link, non dentro: due azioni, nessun annidamento. */}
            <CardLink
              card={card}
              label={`${card.label}: ${card.headlineLead} ${card.headlineEmphasis}. ${card.preview.title}: ${card.preview.text}`}
            />

            {/* La foto si ferma sopra la fascia del bottone: il soggetto non
                finisce mai dietro la CTA, e sfuma nel fondo della card. */}
            <div
              data-aud-photo={card.id}
              className="pointer-events-none absolute inset-x-0 top-0 bottom-[84px] overflow-hidden rounded-t-[28px]"
              style={{ viewTransitionName: audiencePhotoName(card.id) }}
            >
              <Image
                src={card.image.src}
                alt={card.image.alt}
                fill
                sizes="(min-width: 1280px) 40vw, 100vw"
                className="kp-aud-img object-cover"
                style={{ objectPosition: card.image.position }}
                priority={card.id === 'athletes'}
              />
              <div className={`absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t ${tone.fade} to-transparent`} />
            </div>
            {/* Chiusa: solo testa (titolo) e piede (CTA) velati, la foto resta
                visibile. Aperta: si aggiunge il velo laterale sotto al testo. */}
            <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${tone.scrim}`} />
            {/* Solo sulle card scure: su quelle chiare un velo in più sbiadiva la
                foto all'apertura. */}
            {tone.side && (
              <div className={`kp-aud-side-scrim pointer-events-none absolute inset-0 bg-gradient-to-r ${tone.side} opacity-0 group-data-[expanded=true]:opacity-100`} />
            )}


            <div className="pointer-events-none relative z-10 flex h-full min-w-0 flex-col p-4 xl:p-5">
              {card.brand && (
                <p className={`font-display text-sm font-semibold ${tone.hi}`}>
                  KaiPai <span className="text-kp-red">Academy</span>
                </p>
              )}
              <div className={card.brand ? 'mt-3' : ''}>
                <span className={`kp-eyebrow block text-[0.62rem] ${tone.mid}`}>
                  {card.label}
                </span>
                <span className="mt-1.5 block h-[2px] w-8 bg-kp-red" />
              </div>
              <h3 className={`kp-display mt-3 text-[1.2rem] leading-[1.08] ${tone.hi} xl:text-[1.45rem]`}>
                {card.headlineLead}
                <br />
                <span className="text-kp-red">{card.headlineEmphasis}</span>
              </h3>

              <div id={`${card.id}-detail`} className="kp-aud-detail mt-4">
                <p className={`max-w-[24rem] text-sm leading-relaxed ${tone.mid}`}>
                  {card.description}
                </p>
              </div>
                <ul className="mt-5 space-y-2.5" aria-label="Cosa trovi">
                  {card.benefits.map((b) => (
                    <li
                      key={b.label}
                      className={`flex w-fit max-w-full min-w-0 items-center gap-2.5 text-[0.8rem] font-medium leading-tight xl:gap-3 xl:text-sm ${tone.hi} ${tone.row}`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.badge}`}>
                        <b.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                      </span>
                      {b.label}
                    </li>
                  ))}
                </ul>

              <div className="mt-auto flex justify-center pt-5">
                <CardCta card={card} onRequestContact={onRequestContact} centered />
              </div>
            </div>
          </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Mobile/tablet: vertical accordion (below xl) ── */
function MobileAccordion({
  returnedId,
  onRequestContact,
}: {
  returnedId: AudienceId | null;
  onRequestContact: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (returnedId) setOpenId(returnedId);
  }, [returnedId]);

  return (
    <div className="mt-10 flex min-w-0 flex-col gap-3 xl:hidden">
      {AUDIENCE_CARDS.map((card) => {
        const isOpen = openId === card.id;
        return (
          <div
            key={card.id}
            data-expanded={isOpen}
            className={`kp-aud-acc-item min-w-0 overflow-hidden rounded-2xl bg-kp-ink2 shadow-[0_12px_30px_-20px_rgba(12,12,18,0.5)] ${
              returnedId === card.id ? 'kp-aud-returned' : ''
            }`}
          >
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={`${card.id}-m-detail`}
              className="kp-aud-toggle relative flex w-full min-w-0 items-center gap-4 p-4 text-left"
              onClick={() => setOpenId((cur) => (cur === card.id ? null : card.id))}
            >
              <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
                <Image
                  src={card.image.src}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                  style={{ objectPosition: card.image.position }}
                />
                <span className="absolute inset-0 bg-kp-ink/25" />
              </span>
              <span className="min-w-0 flex-1 overflow-hidden">
                <span className="kp-eyebrow line-clamp-1 text-[0.6rem] text-kp-mid">
                  {card.brand ? 'KaiPai Academy' : card.label}
                </span>
                <span className="mt-1 line-clamp-2 font-display text-lg font-semibold leading-snug text-kp-hi">
                  {card.headlineLead}{' '}
                  <span className="text-kp-red">{card.headlineEmphasis}</span>
                </span>
              </span>
              <ChevronDown
                aria-hidden
                className="kp-aud-acc-chevron h-5 w-5 shrink-0 text-kp-mid"
              />
            </button>

            <div
              id={`${card.id}-m-detail`}
              data-expanded={isOpen}
              className="kp-aud-acc-panel min-w-0"
              aria-hidden={!isOpen}
            >
              <div className="kp-aud-acc-inner min-w-0">
                <div className="space-y-4 px-4 pb-5 pt-1">
                  <p className="text-sm leading-relaxed text-kp-mid">
                    {card.description}
                  </p>
                  <ul className="space-y-2.5">
                    {card.benefits.map((b) => (
                      <li
                        key={b.label}
                        className="flex items-center gap-3 text-sm text-kp-hi"
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${TONE.dark.badge}`}>
                          <b.icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                        </span>
                        {b.label}
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap items-center gap-4">
                    <CardCta card={card} onRequestContact={onRequestContact} />
                    {card.cta.kind !== 'link' || card.cta.href !== card.page ? (
                      <Link
                        href={card.page}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-kp-hi underline-offset-4 hover:underline"
                      >
                        Scopri il percorso
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Link a tutta superficie della card. */
function CardLink({ card, label }: { card: AudienceCard; label: string }) {
  const router = useRouter();
  const className =
    'kp-aud-toggle absolute inset-0 z-0 h-full w-full cursor-pointer';
  if (card.page.startsWith('/#')) {
    return <a href={card.page} aria-label={label} className={className} />;
  }
  return (
    <Link
      href={card.page}
      aria-label={label}
      className={className}
      onClick={(e) => {
        if (!card.morph || !isPlainClick(e)) return;
        e.preventDefault();
        navigateWithMorph(router, card.page, `[data-aud-hero="${card.id}"]`);
      }}
    />
  );
}

/* ── shared CTA ── */
function CardCta({
  card,
  onRequestContact,
  centered = false,
}: {
  card: AudienceCard;
  onRequestContact: () => void;
  /** Riga desktop: centrato e della stessa larghezza in tutte le card. */
  centered?: boolean;
}) {
  const content: ReactNode = (
    <>
      {card.ctaLabel}
      <ArrowRight className="kp-aud-cta-arrow h-4 w-4 shrink-0 transition-transform group-hover/cta:translate-x-1" />
    </>
  );
  // Verde come ogni bottone primario di KaiPai (mai rosso), su una riga sola.
  const className =
    (centered ? 'w-full max-w-[11.5rem] justify-center ' : 'w-fit ') +
    'kp-aud-cta group/cta pointer-events-auto relative z-20 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-green-600 px-2.5 py-2.5 text-[0.68rem] font-semibold text-white shadow-sm hover:bg-green-700 xl:px-3 xl:text-[0.78rem] group-data-[expanded=true]:px-4 group-data-[expanded=true]:text-sm';

  if (card.cta.kind === 'contact') {
    return (
      <button type="button" onClick={onRequestContact} className={className}>
        {content}
      </button>
    );
  }
  if (card.cta.href.startsWith('#')) {
    return (
      <a href={card.cta.href} className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={card.cta.href} className={className}>
      {content}
    </Link>
  );
}
