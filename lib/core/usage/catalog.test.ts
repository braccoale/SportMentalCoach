import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  USAGE_EVENTS,
  clientIpFromHeaders,
  deviceClassFromUserAgent,
  isBotUserAgent,
  isExcludedIp,
  isPublicPageRoute,
  isNavigationTrackedFor,
  isTrackablePageRoute,
  pageLabel,
  isUiErrorKind,
  isUsageEvent,
  normalizeIp,
  rateVital,
  referrerKind,
  routeTemplate,
  sanitizeErrorCode,
  sanitizeMetric,
  sanitizeProps,
} from './catalog';

describe('eventi', () => {
  it('l’elenco è chiuso, senza doppioni, e si riconosce', () => {
    assert.equal(new Set(USAGE_EVENTS).size, USAGE_EVENTS.length);
    assert.ok(isUsageEvent('demo_opened'));
    assert.equal(isUsageEvent('qualcosa_di_inventato'), false);
    assert.equal(isUsageEvent(42), false);
  });
  it('i dettagli si ripuliscono: poche voci, valori semplici e corti', () => {
    assert.deepEqual(sanitizeProps({ role: 'coach', step: 3, ok: true }), { role: 'coach', step: 3, ok: true });
    assert.equal(sanitizeProps({ nome: 'x'.repeat(61) }), null);
    assert.equal(sanitizeProps({ 'chiave con spazi': 'a', nested: { a: 1 } }), null);
    assert.equal(sanitizeProps(['a']), null);
    assert.equal(sanitizeProps(null), null);
    const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, i]));
    assert.equal(Object.keys(sanitizeProps(many)!).length, 8);
  });
});

describe('percorsi come modello', () => {
  it('numeri e identificativi non finiscono nei dati', () => {
    assert.equal(routeTemplate('/dashboard/coach/athletes/42'), '/dashboard/coach/athletes/:id');
    assert.equal(routeTemplate('/appointments/9f1c2b3a-1111-4222-8333-444455556666'), '/appointments/:id');
  });
  it('nomi di coach e articoli diventano un segnaposto, le pagine fisse restano', () => {
    assert.equal(routeTemplate('/coaches/mario-rossi?x=1#top'), '/coaches/:slug');
    assert.equal(routeTemplate('/coaches/aiutami-a-scegliere'), '/coaches/aiutami-a-scegliere');
    assert.equal(routeTemplate('/blog/come-scegliere-un-mental-coach-sportivo'), '/blog/:slug');
    assert.equal(routeTemplate('/mental-coach/calcio'), '/mental-coach/:sport');
    assert.equal(routeTemplate('/invita/ABC123'), '/invita/:code');
    assert.equal(routeTemplate('/coaches'), '/coaches');
    assert.equal(routeTemplate('/'), '/');
    assert.equal(routeTemplate(''), '/');
  });
  it('sempre in minuscolo e mai oltre il limite', () => {
    assert.equal(routeTemplate('/Dashboard/Coach'), '/dashboard/coach');
    assert.ok(routeTemplate('/' + 'a'.repeat(300)).length <= 120);
  });
  it('si contano solo le visite alle pagine pubbliche', () => {
    assert.ok(isPublicPageRoute('/coaches/:slug'));
    assert.ok(isPublicPageRoute('/'));
    assert.equal(isPublicPageRoute('/dashboard/coach'), false);
    assert.equal(isPublicPageRoute('/dashboard/admin/utilizzo'), false);
  });
});

describe('dispositivo e robot', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
  const ipad = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
  const androidPhone = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
  const androidTablet = 'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
  it('riconosce telefono, tablet e computer', () => {
    assert.equal(deviceClassFromUserAgent(iphone), 'mobile');
    assert.equal(deviceClassFromUserAgent(androidPhone), 'mobile');
    assert.equal(deviceClassFromUserAgent(ipad), 'tablet');
    assert.equal(deviceClassFromUserAgent(androidTablet), 'tablet');
    assert.equal(deviceClassFromUserAgent(desktop), 'desktop');
    assert.equal(deviceClassFromUserAgent(null), null);
  });
  it('scarta robot e strumenti automatici, non i browser veri', () => {
    assert.ok(isBotUserAgent('Googlebot/2.1 (+http://www.google.com/bot.html)'));
    assert.ok(isBotUserAgent('Mozilla/5.0 HeadlessChrome/120'));
    assert.ok(isBotUserAgent('WhatsApp/2.23'));
    assert.ok(isBotUserAgent(null));
    assert.equal(isBotUserAgent(desktop), false);
    assert.equal(isBotUserAgent(iphone), false);
  });
});

describe('provenienza', () => {
  const own = ['kaipaicoaching.com', 'www.kaipaicoaching.com'];
  it('cinque categorie e mai l’indirizzo', () => {
    assert.equal(referrerKind('', own), 'diretto');
    assert.equal(referrerKind(null, own), 'diretto');
    assert.equal(referrerKind('boh', own), 'diretto');
    assert.equal(referrerKind('https://www.kaipaicoaching.com/coaches', own), 'interno');
    assert.equal(referrerKind('https://www.google.com/', own), 'ricerca');
    assert.equal(referrerKind('https://www.google.it/search?q=x', own), 'ricerca');
    assert.equal(referrerKind('https://l.facebook.com/l.php', own), 'social');
    assert.equal(referrerKind('https://www.instagram.com/', own), 'social');
    assert.equal(referrerKind('https://t.co/abc', own), 'social');
    assert.equal(referrerKind('https://esempio.it/articolo', own), 'altro');
  });
});

describe('esclusione degli indirizzi', () => {
  it('normalizza IPv4 e IPv4 dentro IPv6', () => {
    assert.equal(normalizeIp(' 93.48.145.78 '), '93.48.145.78');
    assert.equal(normalizeIp('::ffff:93.48.145.78'), '93.48.145.78');
    assert.equal(normalizeIp('999.1.1.1'), null);
    assert.equal(normalizeIp('boh'), null);
    assert.equal(normalizeIp(null), null);
  });
  it('un IPv6 si riduce alla rete: cambiare la parte finale non cambia la persona', () => {
    const a = normalizeIp('2001:db8:85a3:1234:aaaa:bbbb:cccc:dddd');
    const b = normalizeIp('2001:db8:85a3:1234:1111:2222:3333:4444');
    assert.equal(a, '2001:db8:85a3:1234');
    assert.equal(a, b);
    assert.equal(normalizeIp('2001:db8::1'), '2001:db8:0:0');
    assert.equal(normalizeIp('::1'), '0:0:0:0');
  });
  it('un indirizzo nell’elenco non si traccia, gli altri sì', () => {
    const list = ['93.48.145.78', '2001:db8:85a3:1234:1:2:3:4'];
    assert.ok(isExcludedIp('93.48.145.78', list));
    assert.ok(isExcludedIp('::ffff:93.48.145.78', list));
    assert.ok(isExcludedIp('2001:db8:85a3:1234:ffff:eeee:dddd:cccc', list));
    assert.equal(isExcludedIp('151.50.106.148', list), false);
    assert.equal(isExcludedIp(null, list), false);
    assert.equal(isExcludedIp('93.48.145.78', []), false);
  });
  it('dall’intestazione prende il primo indirizzo, quello del visitatore', () => {
    const headers: Record<string, string> = { 'x-forwarded-for': '93.48.145.78, 10.0.0.1, 10.0.0.2' };
    assert.equal(clientIpFromHeaders((n) => headers[n] ?? null), '93.48.145.78');
    assert.equal(clientIpFromHeaders((n) => ({ 'x-real-ip': '151.50.106.148' } as Record<string, string>)[n] ?? null), '151.50.106.148');
    assert.equal(clientIpFromHeaders(() => null), null);
  });
});

describe('misure dei tempi', () => {
  it('accetta le misure note nei limiti, scarta il resto', () => {
    assert.deepEqual(sanitizeMetric('LCP', 1800), { metric: 'LCP', value: 1800 });
    assert.deepEqual(sanitizeMetric('CLS', 0.04), { metric: 'CLS', value: 0.04 });
    assert.deepEqual(sanitizeMetric('ready:booking_dialog', 900), { metric: 'ready:booking_dialog', value: 900 });
    assert.equal(sanitizeMetric('LCP', 9_999_999), null);
    assert.equal(sanitizeMetric('LCP', -1), null);
    assert.equal(sanitizeMetric('LCP', NaN), null);
    assert.equal(sanitizeMetric('BOH', 10), null);
    assert.equal(sanitizeMetric('ready:con spazi', 10), null);
    assert.equal(sanitizeMetric(5, 10), null);
  });
  it('giudica con le soglie di Google', () => {
    assert.equal(rateVital('LCP', 2400), 'good');
    assert.equal(rateVital('LCP', 3000), 'needs-improvement');
    assert.equal(rateVital('LCP', 5000), 'poor');
    assert.equal(rateVital('INP', 200), 'good');
    assert.equal(rateVital('CLS', 0.3), 'poor');
    assert.equal(rateVital('ready:x', 800), 'good');
    assert.equal(rateVital('ready:x', 2000), 'needs-improvement');
    assert.equal(rateVital('ready:x', 9000), 'poor');
    assert.equal(rateVital('BOH', 1), null);
  });
});

describe('errori', () => {
  it('tipi e codici ammessi, mai un testo libero', () => {
    assert.ok(isUiErrorKind('offline'));
    assert.equal(isUiErrorKind('boh'), false);
    assert.equal(sanitizeErrorCode('ChunkLoadError'), 'ChunkLoadError');
    assert.equal(sanitizeErrorCode('booking.slot_taken'), 'booking.slot_taken');
    assert.equal(sanitizeErrorCode('Mario Rossi non ha un profilo'), null);
    assert.equal(sanitizeErrorCode(''), null);
    assert.equal(sanitizeErrorCode(7), null);
  });
});

describe('navigazione di chi ha un account', () => {
  it('non si registra dove sarebbe rumore o terreno dell’amministrazione', () => {
    assert.equal(isTrackablePageRoute('/dashboard/admin'), false);
    assert.equal(isTrackablePageRoute('/dashboard/admin/utilizzo'), false);
    assert.equal(isTrackablePageRoute('/api/usage/collect'), false);
    assert.equal(isTrackablePageRoute('/auth/callback'), false);
    assert.equal(isTrackablePageRoute('/video/:room'), false);
  });
  it('si registra il resto, compreso ciò che somiglia a un prefisso', () => {
    assert.equal(isTrackablePageRoute('/dashboard/coach/calendar'), true);
    assert.equal(isTrackablePageRoute('/coaches/:slug'), true);
    assert.equal(isTrackablePageRoute('/dashboard/administrator'), true);
    assert.equal(isTrackablePageRoute('/'), true);
  });
  it('i nomi sono leggibili, e un percorso sconosciuto resta com’è', () => {
    assert.equal(pageLabel('/dashboard/coach/calendar'), 'Calendario (coach)');
    assert.equal(pageLabel('/boh/qualcosa'), '/boh/qualcosa');
  });
});

describe('di chi si registra la navigazione', () => {
  it('mai un amministratore, mai un minorenne o chi ha l’età ignota', () => {
    assert.equal(isNavigationTrackedFor({ isAdmin: true, hasAthleteProfile: false, age: null }), false);
    assert.equal(isNavigationTrackedFor({ isAdmin: false, hasAthleteProfile: true, age: 16 }), false);
    assert.equal(isNavigationTrackedFor({ isAdmin: false, hasAthleteProfile: true, age: 17 }), false);
    assert.equal(isNavigationTrackedFor({ isAdmin: false, hasAthleteProfile: true, age: null }), false);
  });
  it('un adulto sì, e un coach (senza profilo atleta) conta come adulto', () => {
    assert.equal(isNavigationTrackedFor({ isAdmin: false, hasAthleteProfile: true, age: 18 }), true);
    assert.equal(isNavigationTrackedFor({ isAdmin: false, hasAthleteProfile: true, age: 34 }), true);
    assert.equal(isNavigationTrackedFor({ isAdmin: false, hasAthleteProfile: false, age: null }), true);
  });
});
