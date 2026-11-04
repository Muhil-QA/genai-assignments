import { Tiktoken } from "js-tiktoken";
import { AuthenticatedPrincipal } from "./authorization.middleware";
import {
  ConfidentialPolicy,
  detectConfidential,
} from "./confidential-detector";
import {
  detectInjection,
  InjectionPolicy,
} from "./injection-detector";
import {
  isRagDocumentRecordAuthorized,
  RagDocument,
} from "./rag-authorization";
import { countInputTokens, ResourceLimits } from "./resource-limits";
import { detectSecret, SecretRule } from "./secret-detector";
import { detectPii, PiiRule } from "./pii-detector";
import {
  NormalizationPolicy,
  normalizeText,
} from "./text-normalizer";

export interface RagContextChunk {
  sourceId: string;
  text: string;
}

export interface RagContextRequest {
  query: string;
  chunks: RagContextChunk[];
}

export interface RagContextValidationResult {
  decision: "ALLOW" | "BLOCK";
  approvedChunkIds: string[];
  rejectedChunkIds: string[];
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const maximumTextLength = 10_000;

export function validateRagContextRequest(
  body: unknown,
): RagContextRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const payload = body as Record<string, unknown>;
  if (
    Object.keys(payload).length !== 2 ||
    !Object.hasOwn(payload, "query") ||
    !Object.hasOwn(payload, "chunks") ||
    typeof payload.query !== "string" ||
    payload.query.trim().length === 0 ||
    [...payload.query].length > maximumTextLength ||
    !Array.isArray(payload.chunks) ||
    payload.chunks.length === 0
  ) {
    return null;
  }

  const sourceIds = new Set<string>();
  const chunks: RagContextChunk[] = [];
  for (const chunk of payload.chunks) {
    if (typeof chunk !== "object" || chunk === null || Array.isArray(chunk)) {
      return null;
    }

    const chunkRecord = chunk as Record<string, unknown>;
    if (
      Object.keys(chunkRecord).length !== 2 ||
      !Object.hasOwn(chunkRecord, "sourceId") ||
      !Object.hasOwn(chunkRecord, "text") ||
      typeof chunkRecord.sourceId !== "string" ||
      !identifierPattern.test(chunkRecord.sourceId) ||
      sourceIds.has(chunkRecord.sourceId) ||
      typeof chunkRecord.text !== "string" ||
      chunkRecord.text.trim().length === 0 ||
      [...chunkRecord.text].length > maximumTextLength
    ) {
      return null;
    }

    sourceIds.add(chunkRecord.sourceId);
    chunks.push({
      sourceId: chunkRecord.sourceId,
      text: chunkRecord.text,
    });
  }

  return { query: payload.query, chunks };
}

export function validateRagContext(
  request: RagContextRequest,
  principal: AuthenticatedPrincipal,
  documents: RagDocument[],
  secretRules: SecretRule[],
  piiRules: PiiRule[],
  confidentialPolicy: ConfidentialPolicy,
  injectionPolicy: InjectionPolicy,
  normalizationPolicy: NormalizationPolicy,
  resourceLimits: ResourceLimits,
  tokenEncoding: Tiktoken,
): RagContextValidationResult {
  const combinedContent = [
    request.query,
    ...request.chunks.map((chunk) => chunk.text),
  ].join("\n");
  if (
    countInputTokens(combinedContent, tokenEncoding) >
    resourceLimits.tokenLimit.maxInputTokens
  ) {
    return {
      decision: "BLOCK",
      approvedChunkIds: [],
      rejectedChunkIds: request.chunks.map((chunk) => chunk.sourceId),
    };
  }

  const approvedChunkIds: string[] = [];
  const rejectedChunkIds: string[] = [];

  for (const chunk of request.chunks) {
    const document = documents.find(
      (entry) => entry.documentId === chunk.sourceId,
    );
    if (!document || !isRagDocumentRecordAuthorized(document, principal)) {
      rejectedChunkIds.push(chunk.sourceId);
      continue;
    }

    const normalized = normalizeText(chunk.text, normalizationPolicy);
    const content = normalized.analysisText;
    const pii = detectPii(content, piiRules);
    const secret = detectSecret(content, secretRules);
    const confidentiality = detectConfidential(content, confidentialPolicy);
    const injection = detectInjection(content, injectionPolicy);
    const unsafe =
      pii.matched ||
      secret.matched ||
      confidentiality.recommendedAction !== "ALLOW" ||
      injection.recommendedAction !== "ALLOW" ||
      normalized.metadata.suspiciousEncodingDetected;

    if (unsafe) {
      rejectedChunkIds.push(chunk.sourceId);
    } else {
      approvedChunkIds.push(chunk.sourceId);
    }
  }

  return {
    decision: rejectedChunkIds.length === 0 ? "ALLOW" : "BLOCK",
    approvedChunkIds:
      rejectedChunkIds.length === 0 ? approvedChunkIds : [],
    rejectedChunkIds,
  };
}
