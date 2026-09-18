import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OpenAiAcademyRecapProvider,
  OpenAiAcademyRecapProviderError,
  openAiAcademyRecapProviderFromEnvironment,
} from './openai-provider';
import type { AcademyRecapGenerationInput } from './provider';
import type { OpenAiResponsesClient, OpenAiResponsesResponse } from '../../ai-session-notes/openai-session-report-provider';

const input: AcademyRecapGenerationInput = {
  sessionId: 1,
  courseTitle: 'Soccer Mental Coaching Mastery Level',
  moduleTitle: 'Il Pitch di Carriera',
  transcriptText: 'Docente: oggi parliamo di come gestire la pressione...',
  generatedAt: '2026-09-18T10:00:00.000Z',
};

function responseWith(payload: unknown): OpenAiResponsesResponse {
  return {
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(payload) }],
      },
    ],
  };
}

function fakeClient(response: OpenAiResponsesResponse | (() => never)): OpenAiResponsesClient {
  return {
    create: async () => (typeof response === 'function' ? response() : response),
  };
}

const validPayload = {
  keyConcepts: ['Gestione della pressione'],
  toolsAndProtocols: ['Respirazione 4-7-8'],
  practicalCases: ['Rigore decisivo'],
  openQuestions: ['Come farlo con un minorenne?'],
  nextAction: 'Prova la tecnica con un atleta.',
  topicsCovered: ['Il Pitch di Carriera'],
};

test('costruzione fallisce senza apiKey', () => {
  assert.throws(
    () => new OpenAiAcademyRecapProvider({ apiKey: '', model: 'gpt-5-mini' }),
    OpenAiAcademyRecapProviderError
  );
});

test('costruzione fallisce senza model', () => {
  assert.throws(
    () => new OpenAiAcademyRecapProvider({ apiKey: 'sk-test', model: '' }),
    OpenAiAcademyRecapProviderError
  );
});

test('un output valido produce un AcademyRecapContent conforme', async () => {
  const provider = new OpenAiAcademyRecapProvider({
    apiKey: 'sk-test',
    model: 'gpt-5-mini',
    client: fakeClient(responseWith(validPayload)),
  });
  const result = await provider.generateRecap(input);
  assert.deepEqual(result.keyConcepts, validPayload.keyConcepts);
  assert.equal(result.nextAction, validPayload.nextAction);
  assert.equal(result.generation.provider, 'openai');
  assert.equal(result.generation.model, 'gpt-5-mini');
});

test('un output non conforme al contratto lancia MALFORMED_OUTPUT', async () => {
  const provider = new OpenAiAcademyRecapProvider({
    apiKey: 'sk-test',
    model: 'gpt-5-mini',
    client: fakeClient(responseWith({ nextAction: 'solo questo campo' })),
  });
  await assert.rejects(
    () => provider.generateRecap(input),
    (error: unknown) => {
      assert.ok(error instanceof OpenAiAcademyRecapProviderError);
      assert.equal(error.code, 'MALFORMED_OUTPUT');
      return true;
    }
  );
});

test('un client che lancia produce PROVIDER_FAILED', async () => {
  const provider = new OpenAiAcademyRecapProvider({
    apiKey: 'sk-test',
    model: 'gpt-5-mini',
    client: {
      create: async () => {
        throw new Error('rete giù');
      },
    },
  });
  await assert.rejects(
    () => provider.generateRecap(input),
    (error: unknown) => {
      assert.ok(error instanceof OpenAiAcademyRecapProviderError);
      assert.equal(error.code, 'PROVIDER_FAILED');
      return true;
    }
  );
});

test('la configurazione da ambiente legge OPENAI_API_KEY e AI_NOTES_REPORT_MODEL', () => {
  const provider = openAiAcademyRecapProviderFromEnvironment(
    { OPENAI_API_KEY: 'sk-env', AI_NOTES_REPORT_MODEL: 'gpt-5-mini' },
    fakeClient(responseWith(validPayload))
  );
  assert.equal(provider.modelName, 'gpt-5-mini');
});
