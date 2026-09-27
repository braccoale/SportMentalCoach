'use client';

import { useState, type FocusEvent, type ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { AUDIENCE_CARDS, type AudienceCard } from './audience-cards';
import { ContactModal } from '../contact-modal';

const WRAP = 'mx-auto max-w-7xl px-5 sm:px-8';

/**
 * "Qual è il tuo percorso?" — the interactive audience selector, immediately
 * below the Hero.
 *
 * Desktop (lg+): five equal-width portrait cards in one row. Hovering or
 * focusing one grows it (flex-grow, CSS-only transition) while the other
 * four shrink together; a click pins the expansion until another card is
 * chosen. Mobile/tablet: a vertical accordion, one panel open at a time.
 *
 * Photo credit: athlete/families/coach crops are cropped from the brand's
 * own reference mockups (face-only regions, no baked-in text); the academy
 * photo is cropped from the existing `/academy/session-card-bg.png`; the
 * teams photo reuses `/squadra.jpg`, already used elsewhere on this page.
 * All are placeholders for a dedicated shoot — see the final report for the
 * full list.
 */
export function AudiencePathsSection() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <section
      id="percorsi"
      className="kp-snap relative flex min-h-svh flex-col justify-center bg-kp-ink py-20 sm:py-24"
    >
      <div className={`${WRAP} min-w-0`}>
        <div className="max-w-2xl">
          <p className="kp-eyebrow text-kp-red">I tuoi percorsi</p>
          <h2 className="kp-display mt-4 text-[clamp(1.9rem,4.5vw,3.5rem)] text-kp-hi">
            Qual è il tuo percorso?
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-kp-mid">
            Scopri cosa KaiPai può fare per te.
          </p>
        </div>

        <DesktopRow onRequestContact={() => setContactOpen(true)} />
        <MobileAccordion onRequestContact={() => setContactOpen(true)} />
      </div>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </section>
  );
}

/* ── Desktop: hover/pin-to-expand row (lg and up) ── */
function DesktopRow({ onRequestContact }: { onRequestContact: () => void }) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const expandedId = pinnedId ?? activeId;

  return (
    <div className="mt-12 hidden h-[600px] gap-3 lg:flex">
      {AUDIENCE_CARDS.map((card) => {
        const isExpanded = expandedId === card.id;
        const anyExpanded = expandedId !== null;
        return (
          <div
            key={card.id}
            data-expanded={isExpanded}
            className="kp-aud-card group relative min-w-[13rem] flex-1 flex-grow overflow-hidden bg-kp-ink2"
            style={{
              flexGrow: isExpanded ? 7 : anyExpanded ? 0.62 : 1,
              flexBasis: 0,
              minWidth: isExpanded ? '30rem' : '13rem',
            }}
            onMouseEnter={() => setActiveId(card.id)}
            onMouseLeave={() =>
              setActiveId((cur) => (cur === card.id ? null : cur))
            }
            onFocus={() => setActiveId(card.id)}
            onBlur={(e: FocusEvent<HTMLDivElement>) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setActiveId((cur) => (cur === card.id ? null : cur));
              }
            }}
          >
            <button
              type="button"
              className="kp-aud-toggle absolute inset-0 z-0 h-full w-full cursor-pointer"
              aria-expanded={isExpanded}
              aria-controls={`${card.id}-detail`}
              aria-label={`${card.label}: ${card.headlineLead} ${card.headlineEmphasis} ${
                isExpanded ? '— comprimi dettagli' : '— espandi dettagli'
              }`}
              onClick={() =>
                setPinnedId((cur) => (cur === card.id ? null : card.id))
              }
            />

            <Image
              src={card.image.src}
              alt={card.image.alt}
              fill
              sizes="(min-width: 1024px) 40vw, 100vw"
              className="kp-aud-img object-cover"
              style={{ objectPosition: card.image.position }}
              priority={card.id === 'athletes'}
            />
            {/* legibility scrims: left-heavy (text column) + bottom (CTA) */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-kp-ink via-kp-ink/60 to-kp-ink/15" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-kp-ink/85 via-transparent to-kp-ink/25" />

            {/* dashboard-mockup slot — coach card only, revealed when expanded */}
            {card.splitOnExpand && (
              <div
                aria-hidden
                className="kp-aud-laptop pointer-events-none absolute bottom-20 right-5 hidden w-[44%] max-w-[220px] xl:block"
              >
                <div className="rounded-[10px] border border-white/15 bg-kp-ink2/90 p-2.5 shadow-2xl">
                  <div className="flex items-center gap-1 pb-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-2 w-2/3 rounded bg-white/20" />
                    <div className="h-1.5 w-full rounded bg-white/10" />
                    <div className="h-1.5 w-5/6 rounded bg-white/10" />
                    <div className="h-1.5 w-4/6 rounded bg-kp-red/40" />
                  </div>
                </div>
                <div className="mx-auto h-1.5 w-[92%] rounded-b-md bg-white/10" />
                <p className="mt-2 text-center text-[0.58rem] uppercase tracking-wide text-kp-low">
                  Anteprima dashboard — screenshot in arrivo
                </p>
              </div>
            )}

            <div className="relative z-10 flex h-full flex-col p-6">
              {card.brand && (
                <p className="font-display text-sm font-semibold text-kp-hi">
                  KaiPai <span className="text-kp-red">Academy</span>
                </p>
              )}
              <div className={card.brand ? 'mt-3' : ''}>
                <span className="kp-eyebrow block text-[0.62rem] text-kp-mid">
                  {card.label}
                </span>
                <span className="mt-1.5 block h-[2px] w-8 bg-kp-red" />
              </div>
              <h3 className="kp-display mt-3 text-[1.35rem] leading-[1.08] text-kp-hi xl:text-[1.55rem]">
                {card.headlineLead}
                <br />
                <span className="text-kp-red">{card.headlineEmphasis}</span>
              </h3>

              <div id={`${card.id}-detail`} className="kp-aud-detail mt-4">
                <p className="max-w-[26rem] text-sm leading-relaxed text-kp-mid">
                  {card.description}
                </p>
                <ul className="mt-5 space-y-3">
                  {card.benefits.map((b) => (
                    <li
                      key={b.label}
                      className="flex items-center gap-3 text-sm text-kp-hi"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-kp-red/10 text-kp-red">
                        <b.icon className="h-3.5 w-3.5" strokeWidth={2} />
                      </span>
                      {b.label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-auto pt-5">
                <CardCta card={card} onRequestContact={onRequestContact} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Mobile/tablet: vertical accordion (below lg) ── */
function MobileAccordion({
  onRequestContact,
}: {
  onRequestContact: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="mt-10 flex min-w-0 flex-col gap-3 lg:hidden">
      {AUDIENCE_CARDS.map((card) => {
        const isOpen = openId === card.id;
        return (
          <div
            key={card.id}
            data-expanded={isOpen}
            className="kp-aud-acc-item min-w-0 overflow-hidden rounded-2xl border border-kp-line bg-white/[0.02]"
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
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-kp-red/10 text-kp-red">
                          <b.icon className="h-3.5 w-3.5" strokeWidth={2} />
                        </span>
                        {b.label}
                      </li>
                    ))}
                  </ul>
                  <CardCta card={card} onRequestContact={onRequestContact} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── shared CTA — never red: a translucent white pill on dark photos ── */
function CardCta({
  card,
  onRequestContact,
}: {
  card: AudienceCard;
  onRequestContact: () => void;
}) {
  const content: ReactNode = (
    <>
      {card.ctaLabel}
      <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-1" />
    </>
  );
  const className =
    'kp-aud-cta group/cta pointer-events-auto relative z-20 inline-flex w-fit items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-2.5 text-xs font-semibold text-kp-hi backdrop-blur-sm hover:border-white/40 hover:bg-white/20 sm:text-sm';

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
