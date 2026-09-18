import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateValidatedAcademyRecap,
  AcademyRecapGenerationError,
  type AcademyRecapProvider,
  type AcademyRecapGenerationInput,
} from './provider';
import { ACADEMY_RECAP_SCHEMA_VERSION, type AcademyRecapContent } from './contract';

const input: AcademyRecapGenerationInput = {
  sessionId: 1,
  courseTitle: 'Soccer Mental Coaching Mastery Level',
  moduleTitle: 'Il Pitch di Carriera',
  transcriptText: 'Docente: oggi parliamo di...\nCoach: ho un dubbio su...',
  generatedAt: '2026-09-18T10:00:00.000Z',
};

function validContent(): AcademyRecapContent {
  return {
    schemaVersion: ACADEMY_RECAP_SCHEMA_VERSION,
    keyConcepts: ['Concetto uno'],
    toolsAndProtocols: ['Strumento uno'],
    practicalCases: ['Caso uno'],
    openQuestions: ['Domanda uno'],
    nextAction: 'Fai una cosa concreta.',
    topicsCovered: ['Il Pitch di Carriera'],
    generation: { provider: 'fake', model: 'fake-model', generatedAt: input.generatedAt },
  };
}

function fakeProvider(content: AcademyRecapContent | (() => Promise<AcademyRecapContent>)): AcademyRecapProvider {
  return {
    providerName: 'fake',
    modelName: 'fake-model',
    generateRecap: async () => (typeof content === 'function' ? content() : content),
  };
}

test('un output valido attraversa la validazione senza modifiche', async () => {
  const result = await generateValidatedAcademyRecap(input, fakeProvider(validContent()));
  assert.deepEqual(result, validContent());
});

test('un output col campo obbligatorio mancante viene rifiutato', async () => {
  const broken = { ...validContent(), nextAction: '' };
  await assert.rejects(
    () => generateValidatedAcademyRecap(input, fakeProvider(broken)),
    (error: unknown) => {
      assert.ok(error instanceof AcademyRecapGenerationError);
      assert.equal(error.code, 'INVALID_PROVIDER_OUTPUT');
      return true;
    }
  );
});

test('un provider che lancia viene incapsulato come PROVIDER_FAILED', async () => {
  const provider: AcademyRecapProvider = {
    providerName: 'fake',
    modelName: 'fake-model',
    generateRecap: async () => {
      throw new Error('rete giù');
    },
  };
  await assert.rejects(
    () => generateValidatedAcademyRecap(input, provider),
    (error: unknown) => {
      assert.ok(error instanceof AcademyRecapGenerationError);
      assert.equal(error.code, 'PROVIDER_FAILED');
      return true;
    }
  );
});

test('più di 5 concetti chiave viene rifiutato anche qui', async () => {
  const broken = { ...validContent(), keyConcepts: ['a', 'b', 'c', 'd', 'e', 'f'] };
  await assert.rejects(() => generateValidatedAcademyRecap(input, fakeProvider(broken)));
});
