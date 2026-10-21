import test from 'node:test';
import assert from 'node:assert/strict';
import { createLangChainChatModel } from '../src/scripts/utilities/langChainModelFactory.js';
import { isRateLimitOrRecoverableError } from '../src/scripts/utilities/llmService.js';

const providers = [
  ['groq', 'ChatGroq'],
  ['openai', 'ChatOpenAI'],
  ['claude', 'ChatAnthropic'],
  ['gemini', 'ChatGoogleGenerativeAI'],
  ['mistral', 'ChatMistralAI'],
  ['nvidia', 'ChatOpenAI']
];

for (const [provider, expectedClass] of providers) {
  test(`creates a LangChain model for ${provider}`, async () => {
    const chatModel = await createLangChainChatModel({
      provider,
      model: 'test-model',
      apiKey: 'test-api-key'
    });

    assert.equal(chatModel.constructor.name, expectedClass);
  });
}

test('rejects providers without a LangChain adapter', async () => {
  await assert.rejects(
    createLangChainChatModel({ provider: 'unknown', model: 'test-model', apiKey: 'test-api-key' }),
    /Unsupported LangChain provider/
  );
});

test('identifies rate limits and unavailable models as recoverable', () => {
  assert.equal(isRateLimitOrRecoverableError({ status: 429 }), true);
  assert.equal(isRateLimitOrRecoverableError({ status: 503 }), true);
  assert.equal(isRateLimitOrRecoverableError(new Error('model_not_found')), true);
  assert.equal(isRateLimitOrRecoverableError({ status: 401, message: 'invalid API key' }), false);
});