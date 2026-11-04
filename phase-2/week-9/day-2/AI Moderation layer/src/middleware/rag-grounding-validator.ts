import { Tiktoken } from "js-tiktoken";
import { AuthenticatedPrincipal } from "./authorization.middleware";
import { ConfidentialPolicy } from "./confidential-detector";
import { InjectionPolicy } from "./injection-detector";
import { RagDocument } from "./rag-authorization";
import {
  RagContextChunk,
  validateRagContext,
} from "./rag-context-moderator";
import { PiiRule } from "./pii-detector";
import { ResourceLimits, countInputTokens } from "./resource-limits";
import { SecretRule } from "./secret-detector";
import { NormalizationPolicy } from "./text-normalizer";

export interface RagGroundingRequest {
  query: string;
  response: string;
  sources: RagContextChunk[];
}

export interface RagGroundingResult {
  citationValid: boolean;
  groundingSignal: "NOT_EVALUATED" | "UNSUPPORTED";
  recommendedAction: "WARN" | "BLOCK";
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const maximumTextLength = 10_000;
const uncertainResponsePattern =
  /\b(?:i\s+(?:do\s+not|don't|cannot|can't|am\s+unable\s+to)\s+(?:have|determine|confirm|verify|answer)|not\s+enough\s+(?:approved\s+)?(?:information|evidence)|insufficient\s+(?:approved\s+)?(?:information|evidence))\b/i;
const citationPattern = /\[([^\]]*)\]/g;

export function validateRagGroundingRequest(
  body: unknown,
): RagGroundingRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const payload = body as Record<string, unknown>;
  if (
    Object.keys(payload).length !== 3 ||
    !Object.hasOwn(payload, "query") ||
    !Object.hasOwn(payload, "response") ||
    !Object.hasOwn(payload, "sources") ||
    typeof payload.query !== "string" ||
    payload.query.trim().length === 0 ||
    [...payload.query].length > maximumTextLength ||
    typeof payload.response !== "string" ||
    payload.response.trim().length === 0 ||
    [...payload.response].length > maximumTextLength ||
    !Array.isArray(payload.sources)
  ) {
    return null;
  }

  const sourceIds = new Set<string>();
  const sources: RagContextChunk[] = [];
  for (const source of payload.sources) {
    if (typeof source !== "object" || source === null || Array.isArray(source)) {
      return null;
    }

    const sourceRecord = source as Record<string, unknown>;
    if (
      Object.keys(sourceRecord).length !== 2 ||
      !Object.hasOwn(sourceRecord, "sourceId") ||
      !Object.hasOwn(sourceRecord, "text") ||
      typeof sourceRecord.sourceId !== "string" ||
      !identifierPattern.test(sourceRecord.sourceId) ||
      sourceIds.has(sourceRecord.sourceId) ||
      typeof sourceRecord.text !== "string" ||
      sourceRecord.text.trim().length === 0 ||
      [...sourceRecord.text].length > maximumTextLength
    ) {
      return null;
    }

    sourceIds.add(sourceRecord.sourceId);
    sources.push({
      sourceId: sourceRecord.sourceId,
      text: sourceRecord.text,
    });
  }

  return {
    query: payload.query,
    response: payload.response,
    sources,
  };
}

function extractCitationIds(response: string): string[] | null {
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  let cursor = 0;
  citationPattern.lastIndex = 0;
  while ((match = citationPattern.exec(response)) !== null) {
    if (
      /[\[\]]/.test(response.slice(cursor, match.index)) ||
      !identifierPattern.test(match[1])
    ) {
      return null;
    }
    ids.push(match[1]);
    cursor = match.index + match[0].length;
  }

  if (ids.length === 0 || /[\[\]]/.test(response.slice(cursor))) {
    return null;
  }

  return [...new Set(ids)];
}

export function validateRagGrounding(
  request: RagGroundingRequest,
  principal: AuthenticatedPrincipal,
  documents: RagDocument[],
  secretRules: SecretRule[],
  piiRules: PiiRule[],
  confidentialPolicy: ConfidentialPolicy,
  injectionPolicy: InjectionPolicy,
  normalizationPolicy: NormalizationPolicy,
  resourceLimits: ResourceLimits,
  tokenEncoding: Tiktoken,
): RagGroundingResult {
  const allText = [
    request.query,
    request.response,
    ...request.sources.map((source) => source.text),
  ].join("\n");
  if (
    countInputTokens(allText, tokenEncoding) >
    resourceLimits.tokenLimit.maxInputTokens
  ) {
    return {
      citationValid: false,
      groundingSignal: "UNSUPPORTED",
      recommendedAction: "BLOCK",
    };
  }

  const citationIds = extractCitationIds(request.response);
  if (!citationIds) {
    const noEvidence = request.sources.length === 0;
    const responseAcknowledgesUncertainty =
      uncertainResponsePattern.test(request.response);
    return {
      citationValid: false,
      groundingSignal: noEvidence ? "NOT_EVALUATED" : "UNSUPPORTED",
      recommendedAction:
        noEvidence && responseAcknowledgesUncertainty ? "WARN" : "BLOCK",
    };
  }

  const sourceById = new Map(
    request.sources.map((source) => [source.sourceId, source]),
  );
  const citedSources = citationIds.map((sourceId) => sourceById.get(sourceId));
  if (citedSources.some((source) => source === undefined)) {
    return {
      citationValid: false,
      groundingSignal: "UNSUPPORTED",
      recommendedAction: "BLOCK",
    };
  }

  const citedSourcesAreApproved = citedSources.every((source) => {
    if (!source) {
      return false;
    }

    const result = validateRagContext(
      { query: request.query, chunks: [source] },
      principal,
      documents,
      secretRules,
      piiRules,
      confidentialPolicy,
      injectionPolicy,
      normalizationPolicy,
      resourceLimits,
      tokenEncoding,
    );
    return (
      result.decision === "ALLOW" &&
      result.approvedChunkIds.includes(source.sourceId)
    );
  });

  if (!citedSourcesAreApproved) {
    return {
      citationValid: false,
      groundingSignal: "UNSUPPORTED",
      recommendedAction: "BLOCK",
    };
  }

  return {
    citationValid: true,
    groundingSignal: "NOT_EVALUATED",
    recommendedAction: "WARN",
  };
}
