import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  areSourcesApproved,
  createContextChunks,
  isGeneratedOutputReleasable,
  isInputPermitted,
  moderateInput,
  ModerationGatewayError,
  validateRetrievedContext
} from '../src/scripts/utilities/moderationGateway.js';

const gatewayEnvironmentKeys = [
  'MODERATION_GATEWAY_ENABLED',
  'MODERATION_GATEWAY_URL',
  'MODERATION_GATEWAY_JWT_SECRET',
  'MODERATION_GATEWAY_TENANT_ID',
  'MODERATION_GATEWAY_RAG_ROLES',
  'MODERATION_GATEWAY_APPLICATION_ID',
  'MODERATION_GATEWAY_TIMEOUT_MS'
];

function withGatewayEnvironment(overrides, callback) {
  const previous = new Map(
    gatewayEnvironmentKeys.map((key) => [key, process.env[key]]),
  );
  const previousFetch = globalThis.fetch;
  for (const key of gatewayEnvironmentKeys) {
    delete process.env[key];
  }
  Object.assign(process.env, overrides);
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      globalThis.fetch = previousFetch;
    });
}

test('creates minimal context chunks with supported source identifiers', () => {
  const chunks = createContextChunks([
    {
      id: 'TC_0001',
      title: 'Login flow',
      description: 'Verify the sign-in flow.',
      embedding: [0.1, 0.2]
    },
    {
      key: 'STORY-12',
      summary: 'Session expiry',
      acceptanceCriteria: ['Session expires', 'User is redirected']
    }
  ]);

  assert.deepEqual(chunks, [
    {
      sourceId: 'TC_0001',
      text: 'title: Login flow\ndescription: Verify the sign-in flow.'
    },
    {
      sourceId: 'STORY-12',
      text: 'summary: Session expiry\nacceptanceCriteria: ["Session expires","User is redirected"]'
    }
  ]);
});

test('rejects retrieved context without valid unique IDs or text', () => {
  assert.throws(
    () => createContextChunks([{ title: 'No source identifier' }]),
    ModerationGatewayError,
  );
  assert.throws(
    () => createContextChunks([
      { id: 'TC_1', title: 'First' },
      { id: 'TC_1', title: 'Duplicate' }
    ]),
    ModerationGatewayError,
  );
  assert.throws(
    () => createContextChunks([{ id: 'TC_1', title: 'x'.repeat(10001) }]),
    ModerationGatewayError,
  );
});

test('allows only safe ALLOW or MASK input with sanitized content', () => {
  assert.equal(isInputPermitted({
    decision: 'ALLOW',
    safe: true,
    sanitizedContent: 'safe'
  }), true);
  assert.equal(isInputPermitted({
    decision: 'MASK',
    safe: true,
    sanitizedContent: 'masked'
  }), true);
  assert.equal(isInputPermitted({
    decision: 'WARN',
    safe: false,
    sanitizedContent: 'untrusted'
  }), false);
  assert.equal(isInputPermitted({
    decision: 'ALLOW',
    safe: false,
    sanitizedContent: 'unsafe'
  }), false);
});

test('signs a short-lived service JWT and sends moderation requests', async () => {
  await withGatewayEnvironment({
    MODERATION_GATEWAY_ENABLED: 'true',
    MODERATION_GATEWAY_URL: 'http://localhost:3000',
    MODERATION_GATEWAY_JWT_SECRET: 'test-secret-with-more-than-thirty-two-bytes',
    MODERATION_GATEWAY_TENANT_ID: 'LOCAL-DEMO',
    MODERATION_GATEWAY_RAG_ROLES: 'rag-reader,claims-agent',
    MODERATION_GATEWAY_APPLICATION_ID: 'rag-integration-test'
  }, async () => {
    let captured;
    globalThis.fetch = async (url, options) => {
      captured = { url: String(url), options };
      return new Response(JSON.stringify({
        requestId: 'request-123',
        decision: 'ALLOW',
        safe: true,
        sanitizedContent: 'hello'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const response = await moderateInput('hello');
    assert.equal(response.decision, 'ALLOW');
    assert.equal(captured.url, 'http://localhost:3000/api/v1/moderate');
    assert.deepEqual(JSON.parse(captured.options.body), {
      content: 'hello',
      applicationId: 'rag-integration-test'
    });

    const token = captured.options.headers.Authorization.slice('Bearer '.length);
    const [headerPart, payloadPart, signature] = token.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(headerPart, 'base64url').toString()), {
      alg: 'HS256',
      typ: 'JWT'
    });
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString());
    assert.equal(payload.iss, 'genai-guardrail-gateway-local');
    assert.equal(payload.sub, 'rag-mongo-demo-service');
    assert.deepEqual(payload.roles, ['moderation.user']);
    assert.equal(payload.tenantId, 'LOCAL-DEMO');
    assert.deepEqual(payload.ragRoles, ['rag-reader', 'claims-agent']);
    assert.ok(payload.exp - payload.iat <= 300);
    assert.equal(
      signature,
      createHmac('sha256', 'test-secret-with-more-than-thirty-two-bytes')
        .update(`${headerPart}.${payloadPart}`)
        .digest('base64url'),
    );
  });
});

test('fails closed on unavailable source mappings and unevaluated output checks', () => {
  assert.equal(areSourcesApproved({
    decision: 'ALLOW',
    approvedChunkIds: ['TC_1']
  }, ['TC_1']), true);
  assert.equal(areSourcesApproved({
    decision: 'ALLOW',
    approvedChunkIds: ['TC_1']
  }, ['TC_1', 'TC_2']), false);
  assert.equal(isGeneratedOutputReleasable({
    decision: 'WARN',
    safe: false,
    checks: {
      safetyCategories: 'NOT_EVALUATED',
      sourceAuthorization: 'PASSED',
      businessPolicy: 'PASSED'
    }
  }, {
    citationValid: true,
    groundingSignal: 'NOT_EVALUATED',
    recommendedAction: 'WARN'
  }, ['TC_1']), false);
});

test('rejects insecure non-local gateway URLs', async () => {
  await withGatewayEnvironment({
    MODERATION_GATEWAY_ENABLED: 'true',
    MODERATION_GATEWAY_URL: 'http://gateway.example.com',
    MODERATION_GATEWAY_JWT_SECRET: 'test-secret-with-more-than-thirty-two-bytes'
  }, async () => {
    await assert.rejects(
      validateRetrievedContext('query', [{ id: 'TC_1', title: 'Document' }]),
      ModerationGatewayError,
    );
  });
});
