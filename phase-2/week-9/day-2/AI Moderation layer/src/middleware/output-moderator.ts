import { AuthenticatedPrincipal } from "./authorization.middleware";
import {
  ConfidentialAction,
  ConfidentialPolicy,
  detectConfidential,
} from "./confidential-detector";
import { DecisionAction, DecisionPolicy, evaluateDecision } from "./decision-engine";
import { detectInjection, InjectionPolicy } from "./injection-detector";
import {
  isRagDocumentRecordAuthorized,
  RagDocument,
} from "./rag-authorization";
import { detectPii, PiiRule } from "./pii-detector";
import { detectSecret, SecretRule } from "./secret-detector";
import {
  NormalizationPolicy,
  normalizeText,
} from "./text-normalizer";

export interface OutputModerationRequest {
  originalRequestId: string;
  content: string;
  sourceIds: string[];
}

export interface OutputModerationResult {
  decision: DecisionAction;
  safe: boolean;
  checks: {
    safetyCategories: "NOT_EVALUATED";
    sourceAuthorization: "PASSED" | "BLOCKED" | "NOT_EVALUATED";
    businessPolicy: "PASSED" | "WARNED" | "BLOCKED";
  };
  sanitizedContent?: string;
}

const requestIdPattern = /^[A-Za-z0-9._:-]{1,128}$/;
const sourceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const maximumContentLength = 10_000;
const maximumSourceIds = 100;
const systemPromptLeakPattern =
  /\b(?:reveal|show|print|repeat|disclose|output)\b.{0,50}\b(?:hidden|system|developer)\s+(?:prompt|instructions?|message)\b/i;

export function validateOutputModerationRequest(
  body: unknown,
): OutputModerationRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const payload = body as Record<string, unknown>;
  if (
    Object.keys(payload).length !== 3 ||
    !Object.hasOwn(payload, "originalRequestId") ||
    !Object.hasOwn(payload, "content") ||
    !Object.hasOwn(payload, "sourceIds") ||
    typeof payload.originalRequestId !== "string" ||
    !requestIdPattern.test(payload.originalRequestId) ||
    typeof payload.content !== "string" ||
    payload.content.trim().length === 0 ||
    [...payload.content].length > maximumContentLength ||
    !Array.isArray(payload.sourceIds) ||
    payload.sourceIds.length > maximumSourceIds
  ) {
    return null;
  }

  const sourceIds = new Set<string>();
  for (const sourceId of payload.sourceIds) {
    if (
      typeof sourceId !== "string" ||
      !sourceIdPattern.test(sourceId) ||
      sourceIds.has(sourceId)
    ) {
      return null;
    }
    sourceIds.add(sourceId);
  }

  return {
    originalRequestId: payload.originalRequestId,
    content: payload.content,
    sourceIds: [...sourceIds],
  };
}

function mapConfidentialAction(action: ConfidentialAction): DecisionAction {
  if (action === "MASK") {
    return "MASK";
  }
  if (action === "WARN" || action === "BLOCK") {
    return action;
  }
  return "ALLOW";
}

export function moderateOutput(
  request: OutputModerationRequest,
  principal: AuthenticatedPrincipal,
  ragDocuments: RagDocument[],
  secretRules: SecretRule[],
  piiRules: PiiRule[],
  confidentialPolicy: ConfidentialPolicy,
  injectionPolicy: InjectionPolicy,
  normalizationPolicy: NormalizationPolicy,
  decisionPolicy: DecisionPolicy,
): OutputModerationResult {
  const normalized = normalizeText(request.content, normalizationPolicy);
  const analysisContent = normalized.analysisText;
  const pii = detectPii(normalized.normalizedContent, piiRules);
  const secret = detectSecret(analysisContent, secretRules);
  const confidentiality = detectConfidential(
    analysisContent,
    confidentialPolicy,
  );
  const injection = detectInjection(analysisContent, injectionPolicy);
  const systemPromptLeak = systemPromptLeakPattern.test(analysisContent);

  const sourceAuthorization: OutputModerationResult["checks"]["sourceAuthorization"] =
    request.sourceIds.length === 0
      ? "NOT_EVALUATED"
      : request.sourceIds.every((sourceId) => {
            const document = ragDocuments.find(
              (entry) => entry.documentId === sourceId,
            );
            return (
              document !== undefined &&
              isRagDocumentRecordAuthorized(document, principal)
            );
          })
        ? "PASSED"
        : "BLOCKED";

  const findings: Array<{
    control: string;
    recommendedAction: DecisionAction;
  }> = [
    { control: "PII", recommendedAction: pii.recommendedAction },
    {
      control: "SECRETS",
      recommendedAction: secret.recommendedAction,
    },
    {
      control: "CONFIDENTIALITY",
      recommendedAction: mapConfidentialAction(
        confidentiality.recommendedAction,
      ),
    },
    {
      control: "PROMPT_INJECTION",
      recommendedAction: systemPromptLeak
        ? "BLOCK"
        : injection.recommendedAction,
    },
    {
      control: "ENCODED_CONTENT",
      recommendedAction: normalized.metadata.suspiciousEncodingDetected
        ? "BLOCK"
        : "ALLOW",
    },
    {
      control: "SOURCE_AUTHORIZATION",
      recommendedAction:
        sourceAuthorization === "BLOCKED" ? "BLOCK" : "ALLOW",
    },
    { control: "SAFETY_CATEGORIES", recommendedAction: "WARN" },
    {
      control: "CROSS_TENANT_CONTENT",
      recommendedAction:
        sourceAuthorization === "NOT_EVALUATED" ? "WARN" : "ALLOW",
    },
  ];

  const decision = evaluateDecision({ findings }, decisionPolicy);
  const businessPolicy: OutputModerationResult["checks"]["businessPolicy"] =
    confidentiality.recommendedAction === "ALLOW"
      ? "PASSED"
      : confidentiality.recommendedAction === "WARN"
        ? "WARNED"
        : "BLOCKED";
  const checks = {
    safetyCategories: "NOT_EVALUATED" as const,
    sourceAuthorization,
    businessPolicy,
  };

  if (
    decision === "BLOCK" ||
    decision === "ESCALATE" ||
    decision === "SAFE_RESPONSE"
  ) {
    return { decision, safe: false, checks };
  }

  if (decision === "WARN") {
    return { decision, safe: false, checks };
  }

  if (decision === "MASK") {
    return { decision, safe: false, checks };
  }

  return {
    decision,
    safe: true,
    checks,
    sanitizedContent: normalized.normalizedContent,
  };
}
