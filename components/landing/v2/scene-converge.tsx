'use client';

import { useRef } from 'react';
import {
  Archive,
  BarChart3,
  Bell,
  Calendar,
  CalendarCheck,
  FileText,
  ListChecks,
  Mail,
  MessageCircle,
  MessagesSquare,
  Sparkles,
  Table,
  Target,
  Video,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * Scena 2 — il confronto.
 *
 * A sinistra gli strumenti che un coach usa oggi, uno per riga. Al centro il
 * marchio, con i fili che ci arrivano dentro. A destra le stesse cose, ma in
 * un posto solo.
 *
 * La prima versione di questa scena metteva gli otto strumenti su orbite
 * lente in una sezione bloccata, e li faceva cadere verso il centro. Era più
 * spettacolare e diceva meno: otto pastiglie sparse nel buio si contano male,
 * e il «dopo» non si vedeva affatto — il confronto aveva una metà sola. Due
 * colonne affiancate si leggono in tre secondi, che è quanto dura l'attenzione
 * per un argomento come questo.
 *
 * Nessun pin: la pagina ne ha già due, e questa scena non ha niente da
 * raccontare nel tempo. I fili si disegnano mentre passa, e basta.
 */

type Tool = { label: string; icon: LucideIcon };

const SCATTERED: readonly Tool[] = [
  { label: 'Calendario', icon: Calendar },
  { label: 'Google Meet / Zoom', icon: Video },
  { label: 'WhatsApp', icon: MessageCircle },
  { label: 'Note e documenti', icon: FileText },
  { label: 'ChatGPT', icon: Sparkles },
  { label: 'Email', icon: Mail },
  { label: 'Fogli di calcolo', icon: Table },
  { label: 'Promemoria sparsi', icon: Bell },
];

/**
 * La colonna di destra non è la lista dei desideri: ogni riga è una cosa che
 * esiste nel prodotto oggi. Una funzione in più qui è una bugia che nessun
 * test può cogliere.
 */
const CONNECTED: readonly (Tool & { detail: string })[] = [
  {
    label: 'Calendario e prenotazioni',
    detail: 'Le tue disponibilità, prenotate dall’atleta',
    icon: CalendarCheck,
  },
  {
    label: 'Videochiamata integrata',
    detail: 'Dentro la piattaforma, senza app di mezzo',
    icon: Video,
  },
  {
    label: 'Messaggi con l’atleta',
    detail: 'La conversazione resta accanto alla seduta',
    icon: MessagesSquare,
  },
  {
    label: 'Appunti AI e Session Compass',
    detail: 'Con il consenso di entrambi, dopo ogni seduta',
    icon: Sparkles,
  },
  {
    label: 'Impegni e prossimi passi',
    detail: 'Quello che avete deciso, tracciato',
    icon: ListChecks,
  },
  {
    label: 'Percorso mentale',
    detail: 'I temi che tornano, seduta dopo seduta',
    icon: Target,
  },
  {
    label: 'Indicatori della seduta',
    detail: 'Sei letture su scala 1–5, sempre con evidenza',
    icon: BarChart3,
  },
  {
    label: 'Storico e promemoria',
    detail: 'L’archivio delle sedute e le email che partono da sole',
    icon: Archive,
  },
];

const RAIL_H = 480;

/**
 * Il filo fra la riga i-esima e il marchio.
 *
 * Finisce al centro della colonna (x = 80 di 160), non al suo bordo destro:
 * con l'arrivo sul bordo gli otto fili passavano *dietro* il marchio e si
 * chiudevano alla sua destra, nel vuoto. Il punto di convergenza e il logo
 * devono essere lo stesso punto, altrimenti il disegno dice che le cose
 * convergono da qualche altra parte.
 */
function threadPath(index: number, total: number): string {
  const y = ((index + 0.5) / total) * RAIL_H;
  const mid = RAIL_H / 2;
  return `M 0 ${y.toFixed(1)} C 34 ${y.toFixed(1)}, 46 ${mid}, 80 ${mid}`;
}

export function SceneConverge() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
        const section = root.current;
        if (!section) return;

        gsap.fromTo(
          '[data-scattered]',
          { autoAlpha: 0, x: -18 },
          {
            autoAlpha: 1,
            x: 0,
            duration: 0.5,
            stagger: 0.06,
            ease: 'power2.out',
            scrollTrigger: { trigger: section, start: 'top 65%' },
          },
        );

        gsap.to('[data-thread]', {
          strokeDashoffset: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top 60%',
            end: 'center 45%',
            scrub: 0.6,
          },
        });

        gsap.fromTo(
          '[data-mark]',
          { autoAlpha: 0, scale: 0.7 },
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.8,
            ease: 'back.out(1.6)',
            scrollTrigger: { trigger: section, start: 'top 52%' },
          },
        );

        gsap.fromTo(
          '[data-connected]',
          { autoAlpha: 0, x: 20 },
          {
            autoAlpha: 1,
            x: 0,
            duration: 0.5,
            stagger: 0.06,
            ease: 'power2.out',
            scrollTrigger: { trigger: '[data-connected-panel]', start: 'top 78%' },
          },
        );
      });
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="kp2-grain relative overflow-hidden bg-kp-ink py-24 sm:py-32"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <p className="kp2-eyebrow text-kp-red">Oggi</p>
        <h2 className="kp2-display mt-4 max-w-3xl text-[clamp(1.9rem,4.4vw,3.4rem)]">
          Il lavoro di un coach vive
          <br />
          in otto posti diversi.
        </h2>

        <div className="mt-16 grid items-stretch gap-8 lg:grid-cols-[minmax(0,0.85fr)_140px_minmax(0,1.25fr)] lg:gap-0">
          {/* ── Sparso ─────────────────────────────────────────────────── */}
          <div>
            <p className="kp2-eyebrow text-kp-mid">Il coaching oggi</p>
            <ul className="mt-5 space-y-2.5">
              {SCATTERED.map((tool) => (
                <li
                  key={tool.label}
                  data-scattered
                  className="kp2-anim flex items-center gap-3 rounded-xl border border-kp-line bg-kp-surface/70 px-4 py-3"
                >
                  <tool.icon className="h-4 w-4 shrink-0 text-kp-mid" aria-hidden />
                  <span className="truncate text-sm text-kp-hi">{tool.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ── I fili ─────────────────────────────────────────────────────
              Solo da tablet in su. In colonna non collegherebbero niente:
              partirebbero da sopra e arriverebbero da sotto, che è il disegno
              di una coda, non di una convergenza. */}
          <div className="relative hidden lg:block">
            <svg
              aria-hidden
              viewBox={`0 0 160 ${RAIL_H}`}
              preserveAspectRatio="none"
              className="absolute inset-y-0 left-0 h-full w-full"
              fill="none"
            >
              {SCATTERED.map((tool, index) => (
                <path
                  key={tool.label}
                  data-thread
                  className="kp2-draw"
                  d={threadPath(index, SCATTERED.length)}
                  stroke="rgba(225,29,42,.5)"
                  strokeWidth="1"
                  pathLength={1}
                  strokeDasharray="1"
                  strokeDashoffset="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>

            <div
              data-mark
              className="kp2-anim absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
            >
              <div
                aria-hidden
                className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(225,29,42,.35), transparent 65%)',
                }}
              />
              <img
                src="/logo.jpg"
                alt="KaiPai"
                width={127}
                height={141}
                className="relative h-16 w-16 rounded-2xl ring-1 ring-kp-line"
              />
            </div>
          </div>

          {/* ── Connesso ───────────────────────────────────────────────── */}
          <div
            data-connected-panel
            className="rounded-2xl border border-kp-line bg-kp-ink2 p-6 sm:p-8"
          >
            <p className="kp2-eyebrow text-kp-red">Con KaiPai</p>
            <p className="kp2-display mt-3 text-2xl">È tutto nello stesso posto.</p>

            <ul className="mt-7 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {CONNECTED.map((item) => (
                <li key={item.label} data-connected className="kp2-anim flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-kp-red/12 text-kp-red">
                    <item.icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-kp-hi">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-kp-mid">
                      {item.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
