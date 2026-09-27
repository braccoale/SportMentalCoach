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
  type FaqItem,
} from '@/components/landing/audience-paths/audience-faq';
import { DemoRequestButton } from '@/components/landing/demo-request-button';
import { INTRO_SESSION } from '@/lib/core/services/introduction';
import { CoachVsPsychologist } from '@/components/landing/audience-paths/coach-vs-psychologist';
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

/**
 * Le domande dei genitori. Le regole sui minori sono quelle di
 * `lib/core/guardians` (15–17 anni: serve l’autorizzazione, e a parte quella
 * alla registrazione); non vanno scritte qui in modo diverso da là.
 */
const FAQ: FaqItem[] = [
  {
    q: 'Come funziona il percorso per mio figlio?',
    a: `Scegliete insieme un coach, fate la sessione conoscitiva gratuita di ${INTRO_SESSION.durationMin} minuti in videochiamata e, se vi convince, si parte con le sedute: ognuna è una richiesta che il coach conferma. Obiettivi e progressi restano scritti nella pagina del percorso.`,
  },
  {
    q: 'Se mio figlio è minorenne, cosa devo fare?',
    a: 'Un atleta fra i 15 e i 17 anni può registrarsi ed esplorare, ma non può richiedere sedute finché non autorizzi tu, come genitore o tutore legale. Ricevi un’email con un link, leggi cosa stai autorizzando e confermi in un minuto, senza creare un account. Puoi revocare l’autorizzazione in qualsiasi momento.',
  },
  {
    q: 'Possiamo fare la sessione conoscitiva insieme?',
    a: 'Sì. La sessione conoscitiva è gratuita e potete farla insieme, genitore e figlio: è il momento per conoscere il coach, raccontare da dove parte il ragazzo e capire se è la persona giusta.',
  },
  {
    q: 'Come scelgo il coach più adatto?',
    a: 'Nella lista dei coach puoi filtrare per sport, specializzazione, livello e lingua, e leggere il profilo di ognuno. Ogni coach è approvato dal team KaiPai prima di comparire. Se hai un dubbio, scrivici: ti aiutiamo a orientarti.',
    link: { href: '/coaches', label: 'Vai alla lista dei coach' },
  },
  {
    q: 'Posso partecipare anch’io al percorso?',
    a: 'Resti il primo riferimento, e puoi chiedere al coach un confronto sull’andamento e sugli obiettivi. Alle sedute, con gli adolescenti, di norma funziona meglio uno spazio suo: per i più giovani la modalità si concorda con il coach.',
  },
  {
    q: 'Cosa mi viene condiviso delle sedute?',
    a: 'Non i contenuti: uno spazio riservato è ciò che permette al ragazzo di aprirsi. Ricevi invece il quadro generale del percorso. La riservatezza non è mai un ostacolo alla tutela: se emerge qualcosa che riguarda la sua salute o la sua sicurezza, vieni sempre coinvolto.',
  },
  {
    q: 'Le sedute vengono registrate o trascritte?',
    a: 'Solo con il consenso. Se il coach usa gli Appunti AI, per un minorenne serve che tu abbia autorizzato anche la registrazione, a parte rispetto alle sedute; e il ragazzo può comunque rifiutare all’inizio della seduta, che si svolge normalmente. Il riepilogo lo rivede il coach prima di condividerlo.',
  },
  {
    q: 'Come vengono monitorati i progressi?',
    a: 'Nella pagina del percorso ci sono gli obiettivi concordati con il coach, le azioni prese seduta dopo seduta e l’andamento nel tempo. I riepiloghi li scrive e li approva il coach.',
  },
  {
    q: 'Cosa succede se emergono difficoltà che vanno oltre lo sport?',
    a: 'Il mental coaching non è una terapia: allena abilità mentali legate alla prestazione. Se emerge un bisogno di natura clinica, il coach lo dice chiaramente, coinvolge la famiglia e indirizza verso un professionista sanitario.',
  },
  {
    q: 'Come vengono trattati i dati di mio figlio?',
    a: 'Nel rispetto del GDPR, solo per erogare il servizio. Puoi accedere ai dati, chiederne la rettifica o la cancellazione in ogni momento scrivendo a privacy@kaipaicoaching.com. I dettagli sono nella Privacy Policy.',
  },
  {
    q: 'Quando pago, e posso spostare un appuntamento?',
    a: 'La prima sessione conoscitiva è gratis. Per le altre la prenotazione è una richiesta: nulla è dovuto finché il coach non accetta e la seduta non è confermata. Un appuntamento non ancora svolto si può spostare su un orario libero del calendario del coach.',
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
            <p className="kp-eyebrow text-kp-red">Il ruolo dei genitori</p>
            <ul className="mt-5 grid gap-4 md:grid-cols-3">
              {ROLE.map((r) => (
                <li
                  key={r.t}
                  className="rounded-2xl border border-white/10 bg-kp-ink/60 p-5 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-3">
                    <r.icon className="h-5 w-5 shrink-0 text-kp-red" aria-hidden />
                    <h2 className="font-display text-base font-semibold text-kp-hi">{r.t}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-kp-mid">{r.b}</p>
                </li>
              ))}
            </ul>
          </div>
        </AudiencePageHero>

        <CoachVsPsychologist />

        <AudienceFaq
          id="faq"
          title="Per le"
          emphasis="famiglie"
          intro="Le risposte essenziali per genitori e famiglie, prima di iniziare un percorso di mental coaching con KaiPai."
          faq={FAQ}
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
      </main>

      <Footer />
      <AudiencePathsDock current="families" />
      <JsonLd nodes={audienceJsonLd({ name: 'Famiglie', path: '/famiglie', faq: FAQ })} />
    </div>
  );
}
