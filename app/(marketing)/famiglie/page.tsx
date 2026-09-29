import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  HeartHandshake,
  Sprout,
  MessageSquare,
} from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { ScrollProgress } from '@/components/landing/smooth-scroll';
import { SnapScroll } from '@/components/landing/snap-scroll';
import { Footer } from '@/components/footer';
import { JsonLd } from '@/components/json-ld';
import { audienceJsonLd, audienceMetadata } from '@/components/landing/audience-paths/audience-seo';
import {
  AudienceFaq,
  FAQ_SECONDARY_LINK,
} from '@/components/landing/audience-paths/audience-faq';
import { DemoRequestButton } from '@/components/landing/demo-request-button';
import { CoachVsPsychologist } from '@/components/landing/audience-paths/coach-vs-psychologist';
import { FAMILY_FAQ } from '@/components/landing/audience-paths/audience-faqs';
import { AudiencePathsDock } from '@/components/landing/audience-paths/audience-paths-dock';
import {
  AudiencePageHero,
  AUDIENCE_PRIMARY_CTA,
  AUDIENCE_SECONDARY_LINK,
} from '@/components/landing/audience-paths/audience-page-hero';

export const metadata: Metadata = audienceMetadata({
  path: '/famiglie',
  title: 'Mental coach per ragazzi: la guida per i genitori | KaiPai',
  description:
    'Il ruolo dei genitori nel percorso mentale di un giovane atleta: meno pressione, più fiducia. Tutela dei minori, consenso e riservatezza spiegati con chiarezza.',
  shareTitle: 'KaiPai per le famiglie — Accompagnare tuo figlio',
  shareDescription:
    'Come i genitori possono sostenere la crescita mentale di un giovane atleta. Consenso, minori e riservatezza spiegati con chiarezza.',
  image: '/og/families.jpg',
});

/** Parent-role pillars. */
const ROLE = [
  {
    icon: HeartHandshake,
    t: 'Meno pressione, più fiducia',
    b: 'La spinta a “rendere” pesa più di quanto sembri. Il tuo sostegno vale di più quando è incondizionato: ci sei nella vittoria e nella sconfitta.',
  },
  {
    icon: MessageSquare,
    t: 'Sei un alleato, non un giudice',
    b: 'Dopo la partita la domanda giusta non è “quanti gol hai fatto?” ma “ti sei divertito?”. Il coach lavora sulla testa; tu proteggi la serenità.',
  },
  {
    icon: Sprout,
    t: 'Rispetta i suoi tempi',
    b: 'La crescita mentale non è lineare. Accompagnare significa dare spazio, non accelerare: gli obiettivi restano suoi, non tuoi.',
  },
];


export default function FamigliePage() {
  return (
    <div className="kp-root kp-snap-page flex min-h-screen flex-col bg-kp-ink text-kp-hi">
      <SnapScroll />
      <ScrollProgress />
      <SiteNav />

      <main className="kp-alt flex-1">
        <AudiencePageHero
          id="families"
          eyebrow="Mental coaching per giovani atleti"
          lead="Il tuo sostegno è parte"
          emphasis="dell’allenamento."
          text="La testa di tuo figlio si allena anche fuori dal campo — a casa, nel modo in cui gli parli dopo una partita. Non devi essere il suo coach: devi essere il suo posto sicuro. Ti aiutiamo a farlo."
          position="62% 100%"
          photoClassName="inset-y-0 right-0 w-full md:bottom-[250px] md:top-0 md:w-[58%] md:inset-y-auto"
          titleClassName="max-w-3xl"
          actions={
            <>
              <Link href="/coaches" className={AUDIENCE_PRIMARY_CTA}>
                Trova una guida per tuo figlio
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#faq" className={AUDIENCE_SECONDARY_LINK}>
                Minori, consenso e riservatezza
                <ArrowRight className="h-4 w-4" />
              </a>
            </>
          }
        >
          {/* Il ruolo dei genitori: stava in una sezione a sé, ora chiude la
              prima schermata — è la stessa promessa detta in tre principi. */}
          <div className="mt-12 border-t border-white/15 pt-8">
            <h2 className="kp-eyebrow text-kp-red">Il ruolo dei genitori</h2>
            <ul className="mt-5 grid gap-4 md:grid-cols-3">
              {ROLE.map((r) => (
                <li
                  key={r.t}
                  className="rounded-2xl border border-white/10 bg-kp-ink/60 p-5 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-3">
                    <r.icon className="h-5 w-5 shrink-0 text-kp-red" aria-hidden />
                    <h3 className="font-display text-base font-semibold text-kp-hi">{r.t}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-kp-mid">{r.b}</p>
                </li>
              ))}
            </ul>
          </div>
        </AudiencePageHero>

        <AudienceFaq
          id="faq"
          title="Per le"
          emphasis="famiglie"
          intro="Le risposte essenziali per genitori e famiglie, prima di iniziare un percorso di mental coaching con KaiPai."
          faq={FAMILY_FAQ}
          photo={{ src: '/landing/audience/faq-famiglie.webp', alt: '' }}
          action={
            <Link href="/coaches" className={AUDIENCE_PRIMARY_CTA}>
              Trova il coach giusto
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          }
          secondary={
            <DemoRequestButton
              plain
              label="Hai domande? Parla con noi"
              className={FAQ_SECONDARY_LINK}
            />
          }
        />
        <CoachVsPsychologist />
      </main>

      <Footer />
      <AudiencePathsDock current="families" />
      <JsonLd nodes={audienceJsonLd({ name: 'Famiglie', path: '/famiglie', faq: FAMILY_FAQ })} />
    </div>
  );
}
