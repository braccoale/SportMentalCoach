import { ShieldCheck, Lock, HeartHandshake } from 'lucide-react';
import { getVerticalConfig, t } from '@/lib/core/config';
import { JsonLd } from '@/components/json-ld';
import { faqJsonLd } from '@/lib/core/seo';

/**
 * Platform-level trust content shown on coach profiles. Generic and reusable —
 * the brand name comes from the active vertical config. These remove the
 * biggest objections (safety for minors, confidentiality, GDPR) that block
 * parents and clubs from booking.
 */
export function TrustAndSafeguarding() {
  const brand = t('brand.name', getVerticalConfig());
  const items = [
    {
      icon: ShieldCheck,
      title: 'Coach verificati',
      body: `Ogni coach su ${brand} è approvato dal nostro team: identità, esperienza e credenziali controllate prima della pubblicazione.`,
    },
    {
      icon: HeartHandshake,
      title: 'Tutela dei minori',
      body: 'Per gli under 18 è richiesto il consenso di un genitore. Tutte le sessioni seguono le nostre linee guida di tutela.',
    },
    {
      icon: Lock,
      title: 'Riservatezza e privacy',
      body: 'I contenuti delle sessioni sono riservati e trattati nel rispetto del GDPR. Tu decidi cosa condividere.',
    },
  ];
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-gray-900">Sicurezza e tutela</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.title}
            className="rounded-lg border border-gray-200 p-4"
          >
            <it.icon className="h-5 w-5 text-red-600" />
            <p className="mt-2 text-sm font-medium text-gray-900">{it.title}</p>
            <p className="mt-1 text-sm text-gray-600">{it.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Il coaching mentale sportivo non sostituisce un percorso clinico. In caso
        di emergenza o difficoltà psicologica grave, contatta i servizi sanitari
        locali o il 112.
      </p>
    </section>
  );
}

/**
 * Le domande frequenti del marketplace.
 *
 * Esportate perche' la stessa lista alimenta due cose: il `<details>` che
 * l'utente apre e il nodo `FAQPage` che descrive la pagina ai motori. Devono
 * restare la stessa lista — dichiarare una risposta che sullo schermo non
 * c'e' e' markup ingannevole, e in questo repository e' anche l'unico modo
 * per cui le due potrebbero divergere senza che nessuno se ne accorga.
 */
export const MARKETPLACE_FAQS = [
  {
    q: 'Come funziona una sessione?',
    a: 'Scegli un servizio, indichi una data/ora preferita e invii la richiesta. Quando il coach accetta, ricevi conferma e potete parlare in chat e in videochiamata.',
  },
  {
    q: 'Posso prenotare per mio figlio/a?',
    a: 'Sì. Per gli atleti minorenni la prenotazione è gestita da un genitore, che fornisce il consenso e mantiene il controllo del percorso.',
  },
  {
    q: 'Quando pago?',
    a: 'La prenotazione è una richiesta: paghi solo quando il coach accetta e la sessione è confermata. Nessun costo nascosto.',
  },
  {
    q: 'Posso annullare?',
    a: 'Sì, puoi annullare una richiesta o una sessione accettata dalla tua dashboard. Vedi la politica di cancellazione qui sotto.',
  },
];

export function MarketplaceFaq() {
  return (
    <section className="mt-10">
      <JsonLd nodes={[faqJsonLd(MARKETPLACE_FAQS)]} />
      <h2 className="text-xl font-semibold text-gray-900">Domande frequenti</h2>
      <div className="mt-4 divide-y divide-gray-100 rounded-lg border border-gray-200">
        {MARKETPLACE_FAQS.map((f) => (
          <details key={f.q} className="group p-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-gray-900 marker:hidden">
              {f.q}
            </summary>
            <p className="mt-2 text-sm text-gray-600">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function CancellationPolicy() {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-gray-900">
        Politica di cancellazione
      </h2>
      <p className="mt-2 text-sm text-gray-600">
        Puoi annullare una richiesta non ancora accettata in qualsiasi momento,
        senza costi. Per le sessioni accettate, annulla con anticipo dalla tua
        dashboard. In Fase 1 nessun importo viene addebitato finché la sessione
        non è confermata.
      </p>
    </section>
  );
}
