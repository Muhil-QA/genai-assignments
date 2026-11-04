import { createHmac } from 'node:crypto';

const GATEWAY_ISSUER = 'genai-guardrail-gateway-local';
const DEFAULT_APPLICATION_ID = 'rag-mongo-demo';
const DEFAULT_TIMEOUT_MS = 5000;
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const maxContextChunkLength = 10000;
const maxContextChunks = 100;

export class ModerationGatewayError extends Error {
  constructor(message, statusCode = 503) {
    super(message);
    this.name = 'ModerationGatewayError';
    this.statusCode = statusCode;
  }
}

export function isModerationGatewayEnabled() {
  return process.env.MODERATION_GATEWAY_ENABLED === 'true';
}

function getGatewayConfig() {
  if (!isModerationGatewayEnabled()) {
    return null;
  }

  const rawUrl = process.env.MODERATION_GATEWAY_URL || 'http://127.0.0.1:3000';
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ModerationGatewayError('Moderation gateway URL is invalid.');
  }
  const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) {
    throw new ModerationGatewayError(
      'Moderation gateway must use HTTPS except for a local development URL.',
    );
  }

  const secret = process.env.MODERATION_GATEWAY_JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new ModerationGatewayError(
      'Moderation gateway JWT secret must contain at least 32 bytes.',
    );
  }

  const timeoutMs = Number(process.env.MODERATION_GATEWAY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new ModerationGatewayError(
      'Moderation gateway timeout must be between 100 and 30000 milliseconds.',
    );
  }

  const tenantId = process.env.MODERATION_GATEWAY_TENANT_ID;
  if (tenantId && !identifierPattern.test(tenantId)) {
    throw new ModerationGatewayError('Moderation gateway tenant ID is invalid.');
  }
  const ragRoles = (process.env.MODERATION_GATEWAY_RAG_ROLES || '')
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
  if (ragRoles.some((role) => !identifierPattern.test(role))) {
    throw new ModerationGatewayError('Moderation gateway RAG role is invalid.');
  }

  return {
    baseUrl: url.toString().replace(/\/+$/, ''),
    secret,
    timeoutMs,
    tenantId,
    ragRoles: [...new Set(ragRoles)],
    applicationId: process.env.MODERATION_GATEWAY_APPLICATION_ID || DEFAULT_APPLICATION_ID
  };
}

function createServiceToken(config) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: 'rag-mongo-demo-service',
    roles: ['moderation.user'],
    ...(config.tenantId ? { tenantId: config.tenantId } : {}),
    ...(config.ragRoles.length > 0 ? { ragRoles: config.ragRoles } : {}),
    iss: GATEWAY_ISSUER,
    iat: now,
    exp: now + 300
  })).toString('base64url');
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac('sha256', config.secret)
    .update(unsignedToken)
    .digest('base64url');
  return `${unsignedToken}.${signature}`;
}

async function postToGateway(endpoint, body) {
  const config = getGatewayConfig();
  if (!config) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const response = await fetch(`${config.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${createServiceToken(config)}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    let responseBody;
    try {
      responseBody = await response.json();
    } catch {
      throw new ModerationGatewayError('Moderation gateway returned an invalid response.');
    }
    if (!response.ok || !responseBody || typeof responseBody !== 'object') {
      throw new ModerationGatewayError(
        `Moderation gateway rejected the request with HTTP ${response.status}.`,
      );
    }
    return responseBody;
  } catch (error) {
    if (error instanceof ModerationGatewayError) {
      throw error;
    }
    const message = error?.name === 'AbortError'
      ? 'Moderation gateway request timed out.'
      : 'Moderation gateway is unavailable.';
    throw new ModerationGatewayError(message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function moderateInput(content) {
  const config = getGatewayConfig();
  if (!config) {
    return null;
  }
  return postToGateway('/api/v1/moderate', {
    content,
    applicationId: config.applicationId
  });
}

function asDocumentText(document) {
  const fields = [
    'title',
    'summary',
    'description',
    'module',
    'steps',
    'expectedResults',
    'acceptanceCriteria',
    'dependencies',
    'notes'
  ];
  const parts = [];
  for (const field of fields) {
    const value = document[field];
    if (value === undefined || value === null || value === '') {
      continue;
    }
    parts.push(`${field}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
  }
  const text = parts.join('\n');
  if (!text || [...text].length > maxContextChunkLength) {
    throw new ModerationGatewayError(
      'Retrieved context is empty or exceeds the gateway chunk limit.',
      422,
    );
  }
  return text;
}

export function createContextChunks(documents) {
  if (!Array.isArray(documents) || documents.length > maxContextChunks) {
    throw new ModerationGatewayError('Retrieved documents must be an array.', 422);
  }

  const ids = new Set();
  return documents.map((document) => {
    if (!document || typeof document !== 'object') {
      throw new ModerationGatewayError('A retrieved document is invalid.', 422);
    }
    const rawId = document.id
      ?? document.testCaseId
      ?? document.userStoryId
      ?? document.storyId
      ?? document.key
      ?? document._id;
    const sourceId = rawId === undefined || rawId === null ? '' : String(rawId);
    if (!identifierPattern.test(sourceId) || ids.has(sourceId)) {
      throw new ModerationGatewayError(
        'Retrieved documents must have unique, valid source IDs.',
        422,
      );
    }
    ids.add(sourceId);
    return { sourceId, text: asDocumentText(document) };
  });
}

export async function validateRetrievedContext(query, documents) {
  const chunks = createContextChunks(documents);
  if (chunks.length === 0) {
    return null;
  }
  return postToGateway('/api/v1/rag/validate-context', { query, chunks });
}

export async function moderateGeneratedOutput(originalRequestId, content, sourceIds) {
  return postToGateway('/api/v1/moderate/output', {
    originalRequestId,
    content,
    sourceIds
  });
}

export async function validateGeneratedGrounding(query, response, chunks) {
  return postToGateway('/api/v1/rag/validate-grounding', {
    query,
    response,
    sources: chunks
  });
}

export function isInputPermitted(result) {
  return result
    && (result.decision === 'ALLOW' || result.decision === 'MASK')
    && result.safe === true
    && typeof result.sanitizedContent === 'string';
}

export function areSourcesApproved(result, expectedSourceIds) {
  return result
    && result.decision === 'ALLOW'
    && Array.isArray(result.approvedChunkIds)
    && expectedSourceIds.every((sourceId) => result.approvedChunkIds.includes(sourceId));
}

export function isGeneratedOutputReleasable(outputResult, groundingResult, expectedSourceIds) {
  return outputResult
    && outputResult.decision === 'ALLOW'
    && outputResult.safe === true
    && typeof outputResult.sanitizedContent === 'string'
    && outputResult.checks?.safetyCategories === 'PASSED'
    && outputResult.checks?.businessPolicy === 'PASSED'
    && (expectedSourceIds.length === 0
      ? outputResult.checks?.sourceAuthorization === 'NOT_EVALUATED'
      : outputResult.checks?.sourceAuthorization === 'PASSED')
    && (!groundingResult || (
      groundingResult.citationValid === true
      && groundingResult.groundingSignal === 'PASSED'
      && groundingResult.recommendedAction === 'ALLOW'
    ));
}
