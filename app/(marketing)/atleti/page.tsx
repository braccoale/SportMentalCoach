import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { ScrollProgress } from '@/components/landing/smooth-scroll';
import { SnapScroll } from '@/components/landing/snap-scroll';
import { Footer } from '@/components/footer';
import { JsonLd } from '@/components/json-ld';
import {
  AudienceFaq,
  FAQ_SECONDARY_LINK,
} from '@/components/landing/audience-paths/audience-faq';
import { DemoRequestButton } from '@/components/landing/demo-request-button';
import {
  audienceJsonLd,
  audienceMetadata,
} from '@/components/landing/audience-paths/audience-seo';
import { CoachVsPsychologist } from '@/components/landing/audience-paths/coach-vs-psychologist';
import { ATHLETE_FAQ } from '@/components/landing/audience-paths/audience-faqs';
import { AudiencePathsDock } from '@/components/landing/audience-paths/audience-paths-dock';
import { AUDIENCE_PRIMARY_CTA } from '@/components/landing/audience-paths/audience-page-hero';
import { AthleteHowItWorks } from '@/components/landing/audience-paths/athlete-how-it-works';
import { AthleteFocusDashboard } from '@/components/landing/audience-paths/athlete-focus-dashboard';

export const metadata: Metadata = audienceMetadata({
  path: '/atleti',
  title: 'Mental coaching per atleti: la testa si allena | KaiPai',
  description:
    'Mental coaching per atleti: concentrazione, pressione, motivazione e routine pre-gara con un mental coach sportivo, in videochiamata.',
  shareTitle: 'KaiPai per gli atleti',
  shareDescription:
    'Più forte nella testa, più lontano nel tuo sport: il mental coaching sportivo, passo per passo.',
  image: '/og/athletes.jpg',
});


export default function AtletiPage() {
  return (
    <div className="kp-root kp-snap-page flex min-h-screen flex-col bg-kp-ink text-kp-hi">
      <SnapScroll />
      <ScrollProgress />
      <SiteNav />

      <main className="kp-alt flex-1">
        <AthleteHowItWorks />

        <AthleteFocusDashboard />

        <CoachVsPsychologist />

        <AudienceFaq
          title="Prima di"
          emphasis="iniziare"
          intro="Le risposte essenziali per capire come funziona KaiPai e iniziare il percorso con serenità."
          faq={ATHLETE_FAQ}
          photo={{ src: '/landing/audience/faq-atleta.webp', alt: '' }}
          action={
            <Link href="/coaches" className={AUDIENCE_PRIMARY_CTA}>
              Trova il tuo coach
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          }
          secondary={
            <DemoRequestButton
              plain
              label="Hai ancora dubbi? Parla con noi"
              className={FAQ_SECONDARY_LINK}
            />
          }
        />

      </main>

      <Footer />
      <AudiencePathsDock current="athletes" />
      <JsonLd nodes={audienceJsonLd({ name: 'Atleti', path: '/atleti', faq: ATHLETE_FAQ })} />
    </div>
  );
}
