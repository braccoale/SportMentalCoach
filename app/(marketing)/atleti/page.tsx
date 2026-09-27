import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteNav } from '@/components/landing/site-nav';
import { ScrollProgress } from '@/components/landing/smooth-scroll';
import { SnapScroll } from '@/components/landing/snap-scroll';
import { Footer } from '@/components/footer';
import { JsonLd } from '@/components/json-ld';
import { AudienceFaq } from '@/components/landing/audience-paths/audience-faq';
import {
  audienceJsonLd,
  audienceMetadata,
} from '@/components/landing/audience-paths/audience-seo';
import { CoachVsPsychologist } from '@/components/landing/audience-paths/coach-vs-psychologist';
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

const FAQ = [
  {
    q: 'Che differenza c’è tra mental coach e psicologo dello sport?',
    a: 'Il mental coach allena abilità mentali legate alla prestazione sportiva; lo psicologo dello sport è uno psicologo iscritto all’Albo, che può valutare e, se psicoterapeuta, curare. Su KaiPai lavorano mental coach: se emerge un bisogno clinico, il coach indirizza verso un professionista sanitario.',
  },
  {
    q: 'Ho meno di 18 anni: posso iniziare?',
    a: 'Dai 15 anni puoi registrarti ed esplorare. Per richiedere sedute serve l’autorizzazione di un genitore: la piattaforma gli manda un’email con un link, e conferma in un minuto.',
  },
  {
    q: 'Le sedute vengono registrate?',
    a: 'Solo se lo accetti. Se il coach usa gli Appunti AI, ti viene chiesto il consenso prima di iniziare e puoi rifiutare: la seduta si svolge normalmente. Se sei minorenne serve anche che il genitore abbia autorizzato la registrazione, non solo le sedute. Il riepilogo lo rivede il coach prima di condividerlo con te.',
  },
  {
    q: 'Il mental coaching è una terapia?',
    a: 'No. Allena abilità mentali legate alla prestazione sportiva. Se emerge un bisogno di natura clinica, il coach ti indirizza verso un professionista sanitario.',
  },
  {
    q: 'Quando pago?',
    a: 'La prima sessione conoscitiva, di 20 minuti, è gratis. Per le altre la prenotazione è una richiesta: nulla è dovuto finché il coach non accetta e la seduta non è confermata.',
  },
];

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
          title="Prima di iniziare."
          faq={FAQ}
          action={
            <Link href="/coaches" className={AUDIENCE_PRIMARY_CTA}>
              Trova il tuo coach
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          }
        />

      </main>

      <Footer />
      <AudiencePathsDock current="athletes" />
      <JsonLd nodes={audienceJsonLd({ name: 'Atleti', path: '/atleti', faq: FAQ })} />
    </div>
  );
}
