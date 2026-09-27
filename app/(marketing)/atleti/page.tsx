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
  type FaqItem,
} from '@/components/landing/audience-paths/audience-faq';
import { DemoRequestButton } from '@/components/landing/demo-request-button';
import { INTRO_SESSION } from '@/lib/core/services/introduction';
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

const FAQ: FaqItem[] = [
  {
    q: 'Che differenza c’è tra mental coach e psicologo dello sport?',
    a: 'Il mental coach allena abilità mentali legate alla prestazione sportiva; lo psicologo dello sport è uno psicologo iscritto all’Albo, che può valutare e, se psicoterapeuta, curare. Su KaiPai lavorano mental coach: se emerge un bisogno clinico, il coach indirizza verso un professionista sanitario.',
  },
  {
    q: 'Come scelgo il coach giusto per me?',
    a: 'Nella lista dei coach puoi filtrare per sport, specializzazione, livello e lingua, e leggere il profilo di ognuno. Se hai un dubbio, la sessione conoscitiva gratuita serve proprio a capire se è la persona giusta.',
    link: { href: '/coaches', label: 'Vai alla lista dei coach' },
  },
  {
    q: 'Ho meno di 18 anni: posso iniziare?',
    a: 'Dai 15 anni puoi registrarti ed esplorare. Per richiedere sedute serve l’autorizzazione di un genitore o del tutore legale: la piattaforma gli manda un’email con un link, e conferma in un minuto.',
  },
  {
    q: 'La prima sessione è gratuita?',
    a: `Sì. La prima sessione con ogni coach è una sessione conoscitiva di ${INTRO_SESSION.durationMin} minuti, gratuita, in videochiamata: vi conoscete e parlate dei tuoi obiettivi.`,
  },
  {
    q: 'Le sedute vengono registrate o trascritte?',
    a: 'Solo se lo accetti. Se il coach usa gli Appunti AI, ti viene chiesto il consenso prima di iniziare e puoi rifiutare: la seduta si svolge normalmente. Se sei minorenne serve anche che il genitore abbia autorizzato la registrazione, non solo le sedute. Il riepilogo lo rivede il coach prima di condividerlo con te.',
  },
  {
    q: 'Il mental coaching è una terapia?',
    a: 'No. Allena abilità mentali legate alla prestazione sportiva. Se emerge un bisogno di natura clinica, il coach ti indirizza verso un professionista sanitario.',
  },
  {
    q: 'Cosa succede se non mi trovo bene con il coach?',
    a: 'Puoi sceglierne un altro in qualsiasi momento. Anche con il nuovo coach la prima sessione conoscitiva è gratuita.',
  },
  {
    q: 'Come vengono monitorati i miei progressi?',
    a: 'Nella tua pagina del percorso trovi gli obiettivi concordati con il coach, le azioni prese seduta dopo seduta e l’andamento nel tempo. I riepiloghi li scrive e li approva il coach.',
  },
  {
    q: 'Si paga qualcosa, e posso spostare un appuntamento?',
    a: 'La prima sessione conoscitiva è gratis. Oggi KaiPai non ti addebita nulla e non chiede dati di pagamento: l’accesso alle sedute passa da accordi con club e organizzazioni. Se verranno introdotti pagamenti, le condizioni saranno aggiornate e comunicate prima. Un appuntamento non ancora svolto puoi spostarlo tu o il coach, su un orario libero del suo calendario.',
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
          title="Prima di"
          emphasis="iniziare"
          intro="Le risposte essenziali per capire come funziona KaiPai e iniziare il percorso con serenità."
          faq={FAQ}
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
      <JsonLd nodes={audienceJsonLd({ name: 'Atleti', path: '/atleti', faq: FAQ })} />
    </div>
  );
}
