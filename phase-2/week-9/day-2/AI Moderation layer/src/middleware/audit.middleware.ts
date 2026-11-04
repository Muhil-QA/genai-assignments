import { RequestHandler, Response } from "express";
import { Logger } from "pino";
import { logger } from "../utils/logger";

const validDecision = new Set([
  "ALLOW",
  "WARN",
  "MASK",
  "SAFE_RESPONSE",
  "ESCALATE",
  "BLOCK",
]);
const identifierPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const maximumLoggedFindings = 50;

interface AuditContext {
  findingCategories: string[];
  ruleIds: string[];
  reviewId?: string;
}

function safeIdentifiers(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(
        (item): item is string =>
          typeof item === "string" && identifierPattern.test(item),
      ),
    ),
  ].slice(0, maximumLoggedFindings);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function captureFindingMetadata(
  body: Record<string, unknown>,
  res: Response,
): void {
  const findings = Array.isArray(body.findings)
    ? body.findings.filter(isRecord)
    : [];
  const categories = [
    ...safeIdentifiers(body.categories),
    ...safeIdentifiers([
      body.category,
      body.matched === true ? body.classification : undefined,
    ]),
    ...safeIdentifiers(findings.map((finding) => finding.category)),
  ];
  const ruleIds = [
    ...safeIdentifiers([body.ruleId]),
    ...safeIdentifiers(findings.map((finding) => finding.ruleId)),
  ];

  if (categories.length > 0) {
    recordAuditDetails(res, { findingCategories: categories });
  }
  if (ruleIds.length > 0) {
    recordAuditDetails(res, { ruleIds });
  }
}

export function recordAuditDetails(
  res: Response,
  details: Partial<AuditContext>,
): void {
  const context = res.locals.audit as AuditContext;
  if (details.findingCategories) {
    context.findingCategories = safeIdentifiers(details.findingCategories);
  }
  if (details.ruleIds) {
    context.ruleIds = safeIdentifiers(details.ruleIds);
  }
  if (details.reviewId && identifierPattern.test(details.reviewId)) {
    context.reviewId = details.reviewId;
  }
}

export function createAuditMiddleware(
  policyVersion?: string,
  auditLogger: Pick<Logger, "info"> = logger,
): RequestHandler {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const context: AuditContext = { findingCategories: [], ruleIds: [] };
    res.locals.audit = context;

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (isRecord(body)) {
        const action = body.decision ?? body.recommendedAction;
        if (typeof action === "string" && validDecision.has(action)) {
          res.locals.auditDecision = action;
        }
        if (
          typeof body.policyVersion === "string" &&
          body.policyVersion.length <= 128
        ) {
          res.locals.auditPolicyVersion = body.policyVersion;
        }
        if (typeof body.reviewId === "string") {
          recordAuditDetails(res, { reviewId: body.reviewId });
        }
        captureFindingMetadata(body, res);
        if (Array.isArray(body.findingCategories)) {
          recordAuditDetails(res, {
            findingCategories: safeIdentifiers(body.findingCategories),
          });
        }
        if (Array.isArray(body.ruleIds)) {
          recordAuditDetails(res, {
            ruleIds: safeIdentifiers(body.ruleIds),
          });
        }
      }
      return originalJson(body);
    }) as typeof res.json;

    res.on("finish", () => {
      const principal = res.locals.principal as
        | { subject?: unknown }
        | undefined;
      const subject =
        typeof principal?.subject === "string" &&
        principal.subject.length <= 256
          ? principal.subject
          : undefined;
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;

      auditLogger.info({
        event: "audit_event",
        requestId: res.locals.requestId,
        timestamp: new Date().toISOString(),
        subject,
        applicationId: "genai-moderation-gateway",
        policyVersion:
          res.locals.auditPolicyVersion ?? policyVersion ?? "unknown",
        decision: res.locals.auditDecision ?? "NOT_RECORDED",
        findingCategories: context.findingCategories,
        ruleIds: context.ruleIds,
        durationMs: Number(durationMs.toFixed(3)),
        httpStatus: res.statusCode,
        reviewId: context.reviewId,
        method: req.method,
        route: req.route?.path ?? req.path,
      });
    });

    next();
  };
}
