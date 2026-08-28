import { CANONICAL_APP_URL } from '@/lib/core/site';

/**
 * Dati strutturati (JSON-LD) per le pagine pubbliche.
 *
 * Funzioni pure: prendono dati gia' letti dal database e restituiscono nodi
 * schema.org. Nessuna query qui dentro, cosi' il contratto — quali campi
 * finiscono davvero nel markup — si verifica senza rete e senza browser.
 *
 * **La regola che governa questo file: non si dichiara cio' che la pagina non
 * mostra.** I dati strutturati che descrivono qualcosa di invisibile all'utente
 * sono, per le linee guida di Google, markup ingannevole; e per un modello che
 * cita sono peggio ancora, perche' diventano un'affermazione su una persona
 * reale che nessuno ha mai letto sullo schermo. E' il motivo per cui i prezzi
 * dei coach entrano solo dietro `publishPrices`.
 */
export type JsonLdNode = Record<string, unknown>;

const ORGANIZATION_ID = `${CANONICAL_APP_URL}/#organization`;
const WEBSITE_ID = `${CANONICAL_APP_URL}/#website`;

/** Rende assoluto un percorso interno; lascia intatto cio' che e' gia' assoluto. */
export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const separator = pathOrUrl.startsWith('/') ? '' : '/';
  return `${CANONICAL_APP_URL}${separator}${pathOrUrl}`;
}

/** Toglie le chiavi vuote: un campo assente e' meglio di un campo nullo. */
function compact(node: JsonLdNode): JsonLdNode {
  return Object.fromEntries(
    Object.entries(node).filter(([, value]) => {
      if (value == null) return false;
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    })
  );
}

/**
 * L'entita' KaiPai.
 *
 * `sameAs` e' volutamente assente finche' i profili social non sono
 * confermati: dichiarare un account che non e' nostro insegna ai motori
 * un'identita' sbagliata, ed e' un errore molto piu' difficile da correggere
 * di un link mancante nel footer.
 */
export function organizationJsonLd(): JsonLdNode {
  return {
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: 'KaiPai',
    alternateName: 'KaiPai Coaching',
    url: CANONICAL_APP_URL,
    logo: absoluteUrl('/logo.jpg'),
    image: absoluteUrl('/logo.jpg'),
    description:
      'KaiPai è la piattaforma italiana di coaching mentale per lo sport: mette in contatto atleti, squadre e famiglie con mental coach verificati e ospita le sessioni in videochiamata.',
    email: 'info@kaipaicoaching.com',
    telephone: '+39 328 6212598',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Genova',
      addressCountry: 'IT',
    },
    areaServed: { '@type': 'Country', name: 'Italia' },
    knowsLanguage: ['it'],
  };
}

export function websiteJsonLd(): JsonLdNode {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: CANONICAL_APP_URL,
    name: 'KaiPai',
    inLanguage: 'it-IT',
    publisher: { '@id': ORGANIZATION_ID },
  };
}

/** Lunghezza oltre la quale una description viene troncata nei risultati. */
const META_DESCRIPTION_MAX = 155;

/**
 * Compone una meta description da pezzi che possono mancare.
 *
 * Taglia all'ultimo spazio invece che al carattere esatto: una description
 * troncata a meta' parola non e' un dettaglio estetico, e' la prima riga che
 * un motore mostra e che un modello legge per decidere di cosa parla la
 * pagina.
 */
export function metaDescription(
  parts: (string | null | undefined)[],
  maxLength: number = META_DESCRIPTION_MAX
): string {
  const text = parts
    .map((part) => part?.replace(/\s+/g, ' ').trim())
    .filter((part): part is string => !!part)
    .join(' · ');

  if (text.length <= maxLength) return text;

  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[ ·,;.]+$/, '')}…`;
}

export type BreadcrumbItem = { name: string; path: string };

export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export type FaqEntry = { q: string; a: string };

export function faqJsonLd(entries: FaqEntry[]): JsonLdNode {
  return {
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.q,
      acceptedAnswer: { '@type': 'Answer', text: entry.a },
    })),
  };
}

export type CoachSeoInput = {
  slug: string;
  name: string;
  headline: string | null;
  /** Bio o descrizione lunga, gia' scelta dalla pagina. */
  description: string | null;
  avatarUrl: string | null;
  languages: string[] | null;
  certifications: string[] | null;
  /** Etichette leggibili di sport e specialita', non chiavi di tassonomia. */
  topics: string[];
  rating: { average: number | null; count: number };
  reviews?: {
    authorName: string;
    rating: number;
    body: string | null;
    createdAt: Date;
  }[];
  services?: {
    title: string | null;
    description: string | null;
    durationMin: number | null;
    price: number | null;
    currency: string;
  }[];
  /**
   * Le tariffe sono visibili sulla pagina? In produzione
   * `SHOW_COACH_HOURLY_RATE` e' spento e la risposta e' no: senza questo
   * interruttore il markup dichiarerebbe prezzi che nessun visitatore vede.
   */
  publishPrices: boolean;
};

/** Massimo di recensioni riportate nel markup: il resto resta sulla pagina. */
const MAX_REVIEWS_IN_MARKUP = 5;

/**
 * Il profilo di un coach come coppia di nodi: la persona e il servizio che
 * offre.
 *
 * Sono due e non uno per un motivo preciso: `aggregateRating` in schema.org
 * **non** e' una proprieta' di `Person`. Appenderlo li' produce markup non
 * valido che i motori scartano in silenzio — la valutazione sparirebbe senza
 * che nessun errore lo segnali. `Service` la accetta, e regge anche le offerte.
 */
export function coachJsonLd(coach: CoachSeoInput): JsonLdNode[] {
  const url = `${CANONICAL_APP_URL}/coaches/${encodeURIComponent(coach.slug)}`;
  const personId = `${url}#coach`;

  const person = compact({
    '@type': 'Person',
    '@id': personId,
    name: coach.name,
    url,
    image: coach.avatarUrl ? absoluteUrl(coach.avatarUrl) : null,
    jobTitle: coach.headline ?? 'Mental coach sportivo',
    description: coach.description,
    knowsLanguage: coach.languages ?? [],
    knowsAbout: coach.topics,
    worksFor: { '@id': ORGANIZATION_ID },
    hasCredential: (coach.certifications ?? []).map((name) => ({
      '@type': 'EducationalOccupationalCredential',
      name,
    })),
  });

  const offers = coach.publishPrices
    ? (coach.services ?? [])
        .filter((service) => service.price != null)
        .map((service) =>
          compact({
            '@type': 'Offer',
            name: service.title,
            description: service.description,
            price: (service.price as number) / 100,
            priceCurrency: service.currency,
            availability: 'https://schema.org/InStock',
            url,
          })
        )
    : [];

  const service = compact({
    '@type': 'Service',
    '@id': `${url}#service`,
    name: `Coaching mentale sportivo con ${coach.name}`,
    serviceType: 'Coaching mentale sportivo',
    url,
    provider: { '@id': personId },
    areaServed: { '@type': 'Country', name: 'Italia' },
    availableChannel: {
      '@type': 'ServiceChannel',
      serviceUrl: url,
      availableLanguage: coach.languages ?? ['Italiano'],
    },
    aggregateRating:
      coach.rating.count > 0 && coach.rating.average != null
        ? {
            '@type': 'AggregateRating',
            ratingValue: coach.rating.average,
            reviewCount: coach.rating.count,
            bestRating: 5,
            worstRating: 1,
          }
        : null,
    review: (coach.reviews ?? [])
      .slice(0, MAX_REVIEWS_IN_MARKUP)
      .map((review) =>
        compact({
          '@type': 'Review',
          author: { '@type': 'Person', name: review.authorName },
          reviewRating: {
            '@type': 'Rating',
            ratingValue: review.rating,
            bestRating: 5,
            worstRating: 1,
          },
          reviewBody: review.body,
          datePublished: review.createdAt.toISOString().slice(0, 10),
        })
      ),
    offers,
  });

  return [person, service];
}

export type CoachListEntry = { slug: string; name: string };

/** L'elenco dei coach come `ItemList`: dice al motore che e' una lista. */
export function coachListJsonLd(coaches: CoachListEntry[]): JsonLdNode {
  return {
    '@type': 'ItemList',
    name: 'Mental coach sportivi su KaiPai',
    numberOfItems: coaches.length,
    itemListElement: coaches.map((coach, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: coach.name,
      url: `${CANONICAL_APP_URL}/coaches/${encodeURIComponent(coach.slug)}`,
    })),
  };
}

/** Impacchetta piu' nodi in un unico `@graph`, pronto per lo `<script>`. */
export function jsonLdGraph(nodes: JsonLdNode[]): JsonLdNode {
  return { '@context': 'https://schema.org', '@graph': nodes };
}

/**
 * Il grafo come testo da mettere dentro `<script type="application/ld+json">`.
 *
 * Ogni `<` diventa la sequenza `\\u003c`, che JSON rilegge come lo stesso
 * carattere e che l'HTML non riconosce come inizio di tag. Serve perche' React
 * **non** escapa il testo dentro `script`: lo scrive tale e quale. Senza questo
 * passaggio, un titolo di servizio o una frase di recensione contenente
 * `</script>` chiuderebbe il tag in anticipo e rovescerebbe il resto del JSON —
 * e il markup — dentro la pagina.
 */
export function serializeJsonLd(nodes: JsonLdNode[]): string {
  return JSON.stringify(jsonLdGraph(nodes)).replace(/</g, '\\u003c');
}
