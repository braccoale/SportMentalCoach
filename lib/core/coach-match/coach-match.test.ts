import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasEnoughToMatch, mentionsDistress, normalizeMatchAnswers, MAX_FREE_TEXT_LENGTH } from './answers';
import { runCoachMatch } from './match';
import { parseAffinity } from './openai-provider';
import type { CoachAffinityProvider } from './provider';
import { createRateLimiter } from './rate-limit';
import { applyHardFilters, lexicalAffinity, selectTop, type MatchCandidate } from './scoring';

const coach = (id: number, extra: Partial<MatchCandidate> = {}): MatchCandidate => ({
  providerId: id,
  slug: `coach-${id}`,
  displayName: `Coach ${id}`,
  headline: null,
  description: null,
  avatarUrl: null,
  categories: ['tennis'],
  specialties: [],
  athleteLevels: [],
  minPriceCents: 5000,
  currency: 'EUR',
  yearsExperience: null,
  ...extra,
});

const answers = (extra: Record<string, unknown> = {}) => normalizeMatchAnswers({ themes: ['anxiety'], ...extra });
const deps = (provider: CoachAffinityProvider | null = null) => ({
  provider,
  specialtyLabel: (k: string) => k,
  sportLabel: (k: string) => k,
});

describe('normalizeMatchAnswers', () => {
  it('tiene solo valori ammessi e taglia il testo', () => {
    const a = normalizeMatchAnswers({
      sport: 'tennis',
      level: 'Pro; DROP',
      themes: ['anxiety', 'focus', 'confidence', 'inventato'],
      styles: ['direct', 'x'],
      freeText: 'a'.repeat(5000),
      budgetMaxCents: -4,
    });
    assert.equal(a.sport, 'tennis');
    assert.equal(a.level, null);
    assert.deepEqual(a.themes, ['anxiety', 'focus']);
    assert.deepEqual(a.styles, ['direct']);
    assert.equal(a.freeText.length, MAX_FREE_TEXT_LENGTH);
    assert.equal(a.budgetMaxCents, null);
  });
  it('un corpo non valido diventa risposte vuote, senza eccezioni', () => {
    for (const bad of [null, 'x', 12, [], undefined]) {
      const a = normalizeMatchAnswers(bad);
      assert.equal(hasEnoughToMatch(a), false);
    }
  });
  it('basta un tema o un testo di una frase per cercare', () => {
    assert.equal(hasEnoughToMatch(normalizeMatchAnswers({ themes: ['focus'] })), true);
    assert.equal(hasEnoughToMatch(normalizeMatchAnswers({ freeText: 'ho paura di sbagliare' })), true);
    assert.equal(hasEnoughToMatch(normalizeMatchAnswers({ freeText: 'ciao' })), false);
  });
});

describe('mentionsDistress', () => {
  it('riconosce espressioni esplicite e non scambia il linguaggio sportivo', () => {
    assert.equal(mentionsDistress('a volte penso di farla finita'), true);
    assert.equal(mentionsDistress('Ho pensieri suicidi'), true);
    assert.equal(mentionsDistress('mi sento morire dalla fatica nel finale'), false);
    assert.equal(mentionsDistress('ansia prima della partita'), false);
  });
});

describe('applyHardFilters', () => {
  it('esclude chi non segue il livello e chi costa oltre il budget', () => {
    const all = [
      coach(1, { athleteLevels: ['amateur'] }),
      coach(2, { athleteLevels: ['pro'] }),
      coach(3, { athleteLevels: [], minPriceCents: 9000 }),
      coach(4, { athleteLevels: [], minPriceCents: null }),
    ];
    const out = applyHardFilters(all, answers({ level: 'pro', budgetMaxCents: 6000 }));
    assert.deepEqual(out.candidates.map((c) => c.providerId), [2, 4]);
  });
  it('lo sport è rigido finché qualcuno lo segue, poi si rilassa e lo dichiara', () => {
    const all = [coach(1, { categories: ['golf'] }), coach(2, { categories: ['tennis'] })];
    const strict = applyHardFilters(all, answers({ sport: 'tennis' }));
    assert.deepEqual(strict.candidates.map((c) => c.providerId), [2]);
    assert.equal(strict.sportRelaxed, false);
    const relaxed = applyHardFilters(all, answers({ sport: 'rugby' }));
    assert.equal(relaxed.candidates.length, 2);
    assert.equal(relaxed.sportRelaxed, true);
  });
});

describe('lexicalAffinity', () => {
  it('trova radici in comune e ignora le parole vuote', () => {
    const high = lexicalAffinity(
      'Ho tanta ansia prima delle gare e perdo la concentrazione',
      'Aiuto gli atleti a gestire ansia e concentrazione nelle gare importanti'
    );
    const none = lexicalAffinity('Ho tanta ansia prima delle gare', 'Tecniche di respirazione per il nuoto');
    assert.ok(high > 0.5, `high ${high}`);
    assert.equal(none, 0);
    assert.equal(lexicalAffinity('', 'qualcosa'), 0);
  });
});

describe('selectTop', () => {
  it('al massimo quattro, e scarta chi è molto lontano dal migliore', () => {
    const mk = (id: number, score: number) => ({
      candidate: coach(id),
      score,
      matchedSpecialties: [],
      sportMatch: false,
      reason: null,
    });
    const top = selectTop([mk(1, 90), mk(2, 80), mk(3, 70), mk(4, 60), mk(5, 55), mk(6, 30)]);
    assert.deepEqual(top.map((t) => t.candidate.providerId), [1, 2, 3, 4]);
    const lonely = selectTop([mk(1, 90), mk(2, 20)]);
    assert.equal(lonely.length, 1);
    assert.equal(selectTop([mk(1, 10)]).length, 1, 'il migliore resta anche se basso');
  });
});

describe('runCoachMatch', () => {
  const anxious = coach(1, {
    specialties: ['performance_anxiety', 'pre_competition_routine'],
    description: 'Lavoro con atleti sull ansia da prestazione prima della gara.',
  });
  const focus = coach(2, { specialties: ['focus_concentration'] });
  const other = coach(3, { specialties: ['team_dynamics'] });

  it('mette in cima chi copre il tema scelto, senza provider', async () => {
    const r = await runCoachMatch([other, focus, anxious], answers({ sport: 'tennis' }), deps());
    assert.equal(r.status, 'ok');
    assert.equal(r.coaches[0].providerId, 1);
    assert.equal(r.usedAi, false);
    assert.ok(r.coaches[0].reasons.some((x) => x.startsWith('Lavora su')));
  });
  it('senza né tema né testo non cerca', async () => {
    const r = await runCoachMatch([anxious], normalizeMatchAnswers({ sport: 'tennis' }), deps());
    assert.equal(r.status, 'not_enough');
    assert.equal(r.coaches.length, 0);
  });
  it('il testo libero con il provider sposta l\'ordine e porta il motivo', async () => {
    const provider: CoachAffinityProvider = {
      async evaluate({ coaches }) {
        return coaches.map((c) => ({
          providerId: c.providerId,
          affinity: c.providerId === 2 ? 1 : 0,
          reason: c.providerId === 2 ? 'Lavora proprio su questo.' : null,
        }));
      },
    };
    const r = await runCoachMatch(
      [anxious, focus],
      answers({ themes: ['anxiety', 'focus'], freeText: 'perdo la lucidita nel finale di set' }),
      deps(provider)
    );
    assert.equal(r.usedAi, true);
    assert.equal(r.coaches[0].providerId, 2);
    assert.equal(r.coaches[0].reasons[0], 'Lavora proprio su questo.');
  });
  it('se il provider fallisce usa il confronto lessicale e non rompe', async () => {
    let failures = 0;
    const broken: CoachAffinityProvider = {
      async evaluate() {
        throw new Error('boom');
      },
    };
    const r = await runCoachMatch(
      [anxious, focus],
      answers({ freeText: 'ansia prima della gara' }),
      { ...deps(broken), onProviderFailure: () => (failures += 1) }
    );
    assert.equal(failures, 1);
    assert.equal(r.usedAi, false);
    assert.equal(r.coaches[0].providerId, 1);
  });
  it('segnala il disagio nel testo e nessun coach adatto resta una lista vuota', async () => {
    const r = await runCoachMatch([coach(9, { athleteLevels: ['amateur'] })], answers({ level: 'pro', freeText: 'penso di farla finita' }), deps());
    assert.equal(r.distress, true);
    assert.equal(r.coaches.length, 0);
  });
});

describe('parseAffinity', () => {
  it('limita l\'affinità, scarta coach ignoti e accorcia il motivo', () => {
    const out = parseAffinity(
      JSON.stringify({
        coaches: [
          { providerId: 1, affinity: 7, reason: 'x'.repeat(900) },
          { providerId: 99, affinity: 0.5, reason: 'ignoto' },
          { providerId: 2, affinity: -3, reason: '' },
        ],
      }),
      new Set([1, 2])
    );
    assert.equal(out.length, 2);
    assert.equal(out[0].affinity, 1);
    assert.equal(out[0].reason?.length, 300);
    assert.equal(out[1].affinity, 0);
    assert.equal(out[1].reason, null);
    assert.throws(() => parseAffinity('{"coaches":3}', new Set([1])));
  });
});

describe('createRateLimiter', () => {
  it('ammette fino al massimo nella finestra e poi riparte', () => {
    const rl = createRateLimiter(2, 1000);
    assert.equal(rl.allow('a', 0), true);
    assert.equal(rl.allow('a', 10), true);
    assert.equal(rl.allow('a', 20), false);
    assert.equal(rl.allow('b', 20), true);
    assert.equal(rl.allow('a', 1500), true);
  });
});
