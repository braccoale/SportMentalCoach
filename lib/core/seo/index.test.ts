import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  absoluteUrl,
  breadcrumbJsonLd,
  coachJsonLd,
  coachListJsonLd,
  faqJsonLd,
  jsonLdGraph,
  metaDescription,
  serializeJsonLd,
  organizationJsonLd,
  websiteJsonLd,
  type CoachSeoInput,
} from './index';
import { renderLlmsTxt } from './llms-txt';

/**
 * Cosa protegge questo file.
 *
 * I dati strutturati falliscono in silenzio: un campo sbagliato non lancia
 * eccezioni, non rompe una pagina e non compare in nessun log — semplicemente
 * il motore scarta il nodo, e la valutazione o il profilo non arrivano mai
 * nella risposta. Sono quindi i test l'unico posto in cui quel tipo di errore
 * puo' farsi vedere.
 *
 * Le due proprieta' che contano piu' delle altre: non dichiarare prezzi che la
 * pagina non mostra, e non appendere `aggregateRating` a un tipo che non la
 * ammette.
 */

const coach: CoachSeoInput = {
  slug: 'giulia-rossi',
  name: 'Giulia Rossi',
  headline: 'Mental coach · Calcio',
  description: 'Lavoro con portieri e giovani del vivaio.',
  avatarUrl: '/uploads/giulia.jpg',
  languages: ['Italiano', 'Inglese'],
  certifications: ['Master in Psicologia dello Sport'],
  topics: ['Calcio', 'Ansia da prestazione'],
  rating: { average: 4.8, count: 12 },
  reviews: [
    {
      authorName: 'Marco',
      rating: 5,
      body: 'Percorso molto concreto.',
      createdAt: new Date('2026-03-14T10:00:00Z'),
    },
  ],
  services: [
    {
      title: 'Sessione individuale',
      description: 'Un incontro da 50 minuti.',
      durationMin: 50,
      price: 6000,
      currency: 'EUR',
    },
  ],
  publishPrices: false,
};

function serviceNodeOf(nodes: ReturnType<typeof coachJsonLd>) {
  const node = nodes.find((n) => n['@type'] === 'Service');
  assert.ok(node, 'il profilo coach deve produrre un nodo Service');
  return node;
}

function personNodeOf(nodes: ReturnType<typeof coachJsonLd>) {
  const node = nodes.find((n) => n['@type'] === 'Person');
  assert.ok(node, 'il profilo coach deve produrre un nodo Person');
  return node;
}

test('con le tariffe nascoste il markup non contiene nessun prezzo', () => {
  const nodes = coachJsonLd(coach);
  const service = serviceNodeOf(nodes);

  assert.equal(
    service.offers,
    undefined,
    'SHOW_COACH_HOURLY_RATE e’ spento: nessuna offerta va dichiarata'
  );
  assert.ok(
    !JSON.stringify(nodes).includes('60'),
    'la cifra della tariffa non deve comparire da nessuna parte nel markup'
  );
});

test('con le tariffe pubbliche le offerte compaiono, in euro e non in centesimi', () => {
  const service = serviceNodeOf(coachJsonLd({ ...coach, publishPrices: true }));
  const offers = service.offers as Record<string, unknown>[];

  assert.equal(offers.length, 1);
  assert.equal(offers[0].price, 60);
  assert.equal(offers[0].priceCurrency, 'EUR');
});

test('la valutazione sta sul Service, mai sulla Person', () => {
  const nodes = coachJsonLd(coach);

  assert.equal(
    personNodeOf(nodes).aggregateRating,
    undefined,
    'schema.org non ammette aggregateRating su Person: li’ verrebbe scartata'
  );

  const rating = serviceNodeOf(nodes).aggregateRating as Record<
    string,
    unknown
  >;
  assert.equal(rating.ratingValue, 4.8);
  assert.equal(rating.reviewCount, 12);
});

test('un coach senza recensioni non dichiara una valutazione vuota', () => {
  const service = serviceNodeOf(
    coachJsonLd({
      ...coach,
      rating: { average: null, count: 0 },
      reviews: [],
    })
  );

  assert.equal(service.aggregateRating, undefined);
  assert.equal(service.review, undefined);
});

test('i campi assenti spariscono invece di diventare null', () => {
  const person = personNodeOf(
    coachJsonLd({
      ...coach,
      description: null,
      avatarUrl: null,
      certifications: [],
      languages: null,
    })
  );

  assert.equal(person.description, undefined);
  assert.equal(person.image, undefined);
  assert.equal(person.hasCredential, undefined);
  assert.equal(person.knowsLanguage, undefined);
  assert.equal(person.name, 'Giulia Rossi');
});

test('gli URL del profilo sono assoluti e con lo slug codificato', () => {
  const nodes = coachJsonLd({ ...coach, slug: 'giulia rossi' });
  const person = personNodeOf(nodes);

  assert.equal(
    person.url,
    'https://www.kaipaicoaching.com/coaches/giulia%20rossi'
  );
  assert.ok(String(person['@id']).endsWith('#coach'));
});

test('avatar remoto e avatar locale finiscono entrambi su un URL assoluto', () => {
  assert.equal(
    absoluteUrl('/uploads/a.jpg'),
    'https://www.kaipaicoaching.com/uploads/a.jpg'
  );
  assert.equal(
    absoluteUrl('https://cdn.supabase.co/a.jpg'),
    'https://cdn.supabase.co/a.jpg'
  );
});

test('la data della recensione e’ una data, non un istante', () => {
  const service = serviceNodeOf(coachJsonLd(coach));
  const reviews = service.review as Record<string, unknown>[];

  assert.equal(reviews[0].datePublished, '2026-03-14');
});

test('organizzazione e sito si collegano tramite @id', () => {
  const organization = organizationJsonLd();
  const website = websiteJsonLd();

  assert.deepEqual(website.publisher, { '@id': organization['@id'] });
});

test('nessun profilo social viene dichiarato finche’ non e’ confermato', () => {
  assert.equal(
    organizationJsonLd().sameAs,
    undefined,
    'un sameAs sbagliato insegna ai motori un’identita’ che non e’ nostra'
  );
});

test('la description salta i pezzi mancanti invece di lasciare separatori vuoti', () => {
  assert.equal(
    metaDescription(['Giulia Rossi', null, 'Calcio', '   ', undefined]),
    'Giulia Rossi · Calcio'
  );
});

test('la description non viene mai tagliata a meta’ parola', () => {
  const long =
    'Lavoro con portieri e giovani del vivaio su ansia da prestazione, concentrazione e recupero dopo infortunio grave';
  const result = metaDescription([long], 60);

  assert.ok(result.length <= 60);
  assert.ok(result.endsWith('…'));
  assert.ok(
    long.startsWith(result.slice(0, -1)),
    'il testo troncato deve essere un prefisso esatto dell’originale'
  );
  assert.ok(
    !/\s…$/.test(result),
    'niente spazio o punteggiatura appesa prima dei puntini'
  );
});

test('una description gia’ corta resta intatta, senza puntini', () => {
  assert.equal(metaDescription(['Mental coach · Calcio']), 'Mental coach · Calcio');
});

test('le FAQ diventano domande e risposte accettate', () => {
  const faq = faqJsonLd([{ q: 'Quando pago?', a: 'Quando il coach accetta.' }]);
  const questions = faq.mainEntity as Record<string, unknown>[];

  assert.equal(questions[0]['@type'], 'Question');
  assert.equal(questions[0].name, 'Quando pago?');
  assert.deepEqual(questions[0].acceptedAnswer, {
    '@type': 'Answer',
    text: 'Quando il coach accetta.',
  });
});

test('le briciole di pane sono numerate a partire da uno', () => {
  const crumbs = breadcrumbJsonLd([
    { name: 'Home', path: '/' },
    { name: 'Coach', path: '/coaches' },
  ]);
  const items = crumbs.itemListElement as Record<string, unknown>[];

  assert.equal(items[0].position, 1);
  assert.equal(items[1].position, 2);
  assert.equal(items[1].item, 'https://www.kaipaicoaching.com/coaches');
});

test('l’elenco coach dichiara quanti sono davvero', () => {
  const list = coachListJsonLd([
    { slug: 'a', name: 'A' },
    { slug: 'b', name: 'B' },
  ]);

  assert.equal(list.numberOfItems, 2);
  assert.equal((list.itemListElement as unknown[]).length, 2);
});

test('il grafo e’ un solo blocco con un solo contesto', () => {
  const graph = jsonLdGraph([organizationJsonLd(), websiteJsonLd()]);

  assert.equal(graph['@context'], 'https://schema.org');
  assert.equal((graph['@graph'] as unknown[]).length, 2);
});

test('una recensione non puo’ chiudere il tag script che la contiene', () => {
  const serialized = serializeJsonLd(
    coachJsonLd({
      ...coach,
      reviews: [
        {
          authorName: 'Marco',
          rating: 5,
          body: 'Ottimo </script><img src=x onerror=alert(1)>',
          createdAt: new Date('2026-03-14T10:00:00Z'),
        },
      ],
    })
  );

  assert.ok(
    !serialized.includes('<'),
    'nessun < deve sopravvivere: React scrive questo testo dentro script senza escaparlo'
  );
  assert.ok(serialized.includes('\\u003c/script>'));
  assert.deepEqual(
    JSON.parse(serialized),
    jsonLdGraph(
      coachJsonLd({
        ...coach,
        reviews: [
          {
            authorName: 'Marco',
            rating: 5,
            body: 'Ottimo </script><img src=x onerror=alert(1)>',
            createdAt: new Date('2026-03-14T10:00:00Z'),
          },
        ],
      })
    ),
    'l’escape non deve cambiare il valore che un parser JSON rilegge'
  );
});

test('llms.txt rispetta la forma del formato e punta al dominio giusto', () => {
  const text = renderLlmsTxt();
  const lines = text.split('\n');

  assert.equal(lines[0], '# KaiPai', 'la prima riga e’ il titolo H1');
  assert.ok(
    lines.some((line) => line.startsWith('> ')),
    'serve una riga di sintesi come citazione'
  );
  assert.ok(text.includes('](https://www.kaipaicoaching.com/coaches)'));
  assert.ok(
    !text.includes('localhost'),
    'il file pubblico non deve mai citare un indirizzo locale'
  );
});

test('llms.txt e’ italiano pubblicato, non italiano con gli apostrofi', () => {
  const text = renderLlmsTxt();
  // «e'», «identita'», «specialita'»: una vocale seguita da apostrofo e da un
  // confine di parola e' un accento che qualcuno ha appiattito. Nei commenti
  // del repository e' una convenzione; qui e' prosa che un modello ricopia
  // dentro la sua risposta, e va letta come la scriverebbe una persona.
  const flattened = text.match(/\b[a-zA-Z]*[aeiou]'(?=\s|$)/gm) ?? [];

  assert.deepEqual(
    flattened,
    [],
    `accenti appiattiti nel testo pubblico: ${flattened.join(', ')}`
  );
});
