import express, { Express } from "express";
import multer from "multer";
import { AuthenticationConfig, ReadinessState } from "./config";
import { createAuthenticationMiddleware } from "./middleware/auth.middleware";
import {
  AuthenticatedPrincipal,
  requireRole,
} from "./middleware/authorization.middleware";
import {
  createAuditMiddleware,
  recordAuditDetails,
} from "./middleware/audit.middleware";
import { errorMiddleware, notFoundMiddleware } from "./middleware/error.middleware";
import { requestIdMiddleware } from "./middleware/request-id.middleware";
import {
  detectSecret,
  loadSecretRules,
  SecretRule,
} from "./middleware/secret-detector";
import {
  requireJsonContentType,
  validateContentRequest,
  validateModerationRequest,
  validateTokenRequest,
} from "./middleware/request-validation.middleware";
import {
  countInputTokens,
  createResourceGuards,
  getTokenEncoding,
  loadResourceLimits,
  ResourceLimits,
} from "./middleware/resource-limits";
import {
  validateUploadedPdf,
  uploadSingleFile,
} from "./middleware/upload-validation.middleware";
import { detectPii, loadPiiRules, PiiRule } from "./middleware/pii-detector";
import {
  ConfidentialPolicy,
  detectConfidential,
  loadConfidentialPolicy,
} from "./middleware/confidential-detector";
import {
  detectInjection,
  InjectionPolicy,
  loadInjectionPolicy,
} from "./middleware/injection-detector";
import {
  createJailbreakDetector,
  JailbreakPolicy,
  loadJailbreakPolicy,
} from "./middleware/jailbreak-detector";
import {
  loadNormalizationPolicy,
  NormalizationPolicy,
  normalizeText,
} from "./middleware/text-normalizer";
import {
  isRagDocumentAuthorized,
  loadRagDocuments,
  RagDocument,
  validateRagAuthorizationRequest,
} from "./middleware/rag-authorization";
import {
  validateRagContext,
  validateRagContextRequest,
} from "./middleware/rag-context-moderator";
import {
  validateRagGrounding,
  validateRagGroundingRequest,
} from "./middleware/rag-grounding-validator";
import {
  createToolActionValidator,
  loadToolActionPolicy,
  ToolActionPolicyConfig,
  validateToolActionRequest,
} from "./middleware/tool-action-validator";
import {
  DecisionAction,
  DecisionFinding,
  DecisionPolicy,
  evaluateDecision,
  loadDecisionPolicy,
  validateDecisionRequest,
} from "./middleware/decision-engine";
import {
  moderateOutput,
  validateOutputModerationRequest,
} from "./middleware/output-moderator";
import {
  createReviewStore,
  validateCreateReviewRequest,
} from "./middleware/review-escalation";
import {
  ContentSafetyPolicy,
  detectContentSafety,
  loadContentSafetyPolicy,
} from "./middleware/content-safety-detector";
import {
  detectMisuse,
  loadMisusePolicy,
  MisusePolicy,
} from "./middleware/misuse-detector";
import {
  detectHarmfulContent,
  HarmfulContentPolicy,
  loadHarmfulContentPolicy,
} from "./middleware/harmful-content-detector";
import {
  detectViolenceThreats,
  loadViolenceThreatPolicy,
  ViolenceThreatPolicy,
} from "./middleware/violence-threats-detector";
import {
  createChildSafetySecurityEvent,
  detectSexualSafety,
  loadSexualSafetyPolicy,
  SexualSafetyPolicy,
} from "./middleware/sexual-safety-detector";
import {
  detectSelfHarmFixture,
  loadSelfHarmPolicy,
  SelfHarmPolicy,
} from "./middleware/self-harm-detector";
import {
  loadOutputValidationPolicy,
  OutputValidationPolicy,
  validateOutput,
  validateOutputRequest,
} from "./middleware/output-schema-validator";
import { createHealthRouter } from "./routes/health.routes";

export function createApp(
  readiness: ReadinessState,
  authentication: AuthenticationConfig,
  secretRules: SecretRule[] = loadSecretRules(),
  resourceLimits: ResourceLimits = loadResourceLimits(),
  piiRules: PiiRule[] = loadPiiRules(),
  confidentialPolicy: ConfidentialPolicy = loadConfidentialPolicy(),
  injectionPolicy: InjectionPolicy = loadInjectionPolicy(),
  jailbreakPolicy: JailbreakPolicy = loadJailbreakPolicy(),
  normalizationPolicy: NormalizationPolicy = loadNormalizationPolicy(),
  ragDocuments: RagDocument[] = loadRagDocuments(),
  toolActionPolicy: ToolActionPolicyConfig = loadToolActionPolicy(),
  decisionPolicy: DecisionPolicy = loadDecisionPolicy(),
  outputValidationPolicy: OutputValidationPolicy = loadOutputValidationPolicy(),
  contentSafetyPolicy: ContentSafetyPolicy = loadContentSafetyPolicy(),
  misusePolicy: MisusePolicy = loadMisusePolicy(),
  harmfulContentPolicy: HarmfulContentPolicy = loadHarmfulContentPolicy(),
  violenceThreatPolicy: ViolenceThreatPolicy = loadViolenceThreatPolicy(),
  sexualSafetyPolicy: SexualSafetyPolicy = loadSexualSafetyPolicy(),
  selfHarmPolicy: SelfHarmPolicy = loadSelfHarmPolicy(),
): Express {
  const app = express();
  const reviewStore = createReviewStore();

  app.use(requestIdMiddleware);
  app.use(
    createAuditMiddleware(
      readiness.status === "READY" ? readiness.policyVersion : undefined,
    ),
  );
  app.use(express.json({ limit: resourceLimits.requestBodyLimitBytes }));
  app.use(createHealthRouter(readiness));
  const authenticate = createAuthenticationMiddleware(authentication);
  const resourceGuards = createResourceGuards(resourceLimits);
  const tokenEncoding = getTokenEncoding(resourceLimits);
  const detectJailbreak = createJailbreakDetector(jailbreakPolicy);
  const validateToolAction = createToolActionValidator(toolActionPolicy);
  const protectedResourceGuards = [
    resourceGuards.rateLimit,
    resourceGuards.concurrency,
    resourceGuards.timeout,
  ];
  app.post(
    "/api/v1/validate/output",
    authenticate,
    requireRole("moderation.user"),
    requireJsonContentType,
    ...protectedResourceGuards,
    (req, res) => {
      const outputRequest = validateOutputRequest(req.body);
      if (!outputRequest) {
        res.status(400).json({
          requestId: res.locals.requestId,
          error: "INVALID_REQUEST",
          fields: ["body"],
        });
        return;
      }

      const result = validateOutput(outputRequest, outputValidationPolicy);
      res.status(200).json({
        requestId: res.locals.requestId,
        policyVersion: outputValidationPolicy.version,
        ...result,
      });
    },
  );
  app.post(
    "/api/v1/decision",
    authenticate,
    requireRole("moderation.user"),
    requireJsonContentType,
    ...protectedResourceGuards,
    (req, res) => {
      const decisionRequest = validateDecisionRequest(req.body);
      if (!decisionRequest) {
        res.status(400).json({
          requestId: res.locals.requestId,
          error: "INVALID_REQUEST",
          fields: ["findings"],
        });
        return;
      }

      const decision = evaluateDecision(decisionRequest, decisionPolicy);
      let reviewId: string | undefined;
      if (decision === "ESCALATE") {
        const principal = res.locals.principal as AuthenticatedPrincipal;
        const review = reviewStore.create({
          requestId: res.locals.requestId,
          requesterSubject: principal.subject,
          findingCategories: decisionRequest.findings
            .filter((finding) => finding.recommendedAction === "ESCALATE")
            .map((finding) => finding.control),
          ruleIds: ["DECISION_POLICY_ESCALATE"],
        });
        if (!review) {
          res.status(503).json({
            requestId: res.locals.requestId,
            error: "REVIEW_QUEUE_FULL",
          });
          return;
        }
        reviewId = review.reviewId;
        recordAuditDetails(res, {
          findingCategories: review.findingCategories,
          ruleIds: review.ruleIds,
          reviewId,
        });
      }

      res.status(200).json({
        requestId: res.locals.requestId,
        policyVersion: decisionPolicy.version,
        decision,
        ...(reviewId ? { reviewId, reviewStatus: "PENDING" } : {}),
      });
    },
  );
  app.post(
    "/api/v1/moderate",
    authenticate,
    requireRole("moderation.user"),
    requireJsonContentType,
    validateModerationRequest,
    ...protectedResourceGuards,
    (req, res) => {
      if (readiness.status !== "READY") {
        res.status(503).json({
          requestId: res.locals.requestId,
          error: {
            code: "NOT_READY",
            message: "Policy configuration is unavailable.",
          },
        });
        return;
      }

      const { content, metadata } = req.body as {
        content: string;
        metadata?: { locale?: string };
      };
      const startedAt = Date.now();
      const normalized = normalizeText(
        content,
        normalizationPolicy,
        metadata?.locale,
      );
      const principal = res.locals.principal as AuthenticatedPrincipal;
      const decisionFindings: DecisionFinding[] = [];
      const reasons: Array<{
        control: string;
        categories: string[];
        ruleIds: string[];
        recommendedAction: DecisionAction;
      }> = [];
      const addAssessment = (
        control: string,
        categories: string[],
        recommendedAction: DecisionAction,
        ruleIds: string[],
      ) => {
        decisionFindings.push({ control, recommendedAction });
        reasons.push({ control, categories, ruleIds, recommendedAction });
      };

      const secretResult = detectSecret(
        normalized.analysisText,
        secretRules,
      );
      if (secretResult.matched && secretResult.category && secretResult.ruleId) {
        addAssessment("SECRETS", [secretResult.category], "BLOCK", [
          secretResult.ruleId,
        ]);
      }

      const piiResult = detectPii(normalized.normalizedContent, piiRules);
      for (const finding of piiResult.findings) {
        addAssessment("PII", [finding.category], finding.recommendedAction, [
          finding.ruleId,
        ]);
      }

      const confidentialResult = detectConfidential(
        normalized.analysisText,
        confidentialPolicy,
      );
      if (confidentialResult.matched) {
        addAssessment(
          "CONFIDENTIAL",
          [confidentialResult.classification],
          confidentialResult.recommendedAction,
          [confidentialResult.ruleId],
        );
      }

      const injectionResult = detectInjection(
        normalized.analysisText,
        injectionPolicy,
      );
      if (injectionResult.matched) {
        addAssessment(
          "PROMPT_INJECTION",
          ["PROMPT_INJECTION"],
          injectionResult.recommendedAction,
          injectionResult.findings.map((finding) => finding.ruleId),
        );
      }

      const jailbreakResult = detectJailbreak(
        normalized.analysisText,
        principal.subject,
      );
      if (jailbreakResult.matched) {
        addAssessment(
          "JAILBREAK",
          ["JAILBREAK"],
          jailbreakResult.recommendedAction,
          jailbreakResult.findings.map((finding) => finding.ruleId),
        );
      }

      const contentSafetyResult = detectContentSafety(
        content,
        contentSafetyPolicy,
        normalizationPolicy,
        decisionPolicy,
      );
      if (contentSafetyResult.categories.length > 0) {
        addAssessment(
          "CONTENT_SAFETY",
          contentSafetyResult.categories.map((category) => category.name),
          contentSafetyResult.recommendedAction,
          contentSafetyResult.findings.map((finding) => finding.ruleId),
        );
      }

      const misuseResult = detectMisuse(
        content,
        misusePolicy,
        normalizationPolicy,
        decisionPolicy,
      );
      if (misuseResult.categories.length > 0) {
        addAssessment(
          "MISUSE",
          misuseResult.categories,
          misuseResult.recommendedAction,
          misuseResult.findings.map((finding) => finding.ruleId),
        );
      }

      const harmfulContentResult = detectHarmfulContent(
        content,
        harmfulContentPolicy,
        normalizationPolicy,
        decisionPolicy,
      );
      if (harmfulContentResult.findings.length > 0) {
        addAssessment(
          "HARMFUL_CONTENT",
          [harmfulContentResult.category ?? "DANGEROUS_ACTIVITY"],
          harmfulContentResult.decision,
          harmfulContentResult.findings.map((finding) => finding.ruleId),
        );
      }

      const violenceThreatResult = detectViolenceThreats(
        content,
        violenceThreatPolicy,
        normalizationPolicy,
        decisionPolicy,
      );
      if (violenceThreatResult.findings.length > 0) {
        addAssessment(
          "VIOLENCE_THREATS",
          [
            ...new Set(
              violenceThreatResult.findings.map((finding) => finding.category),
            ),
          ],
          violenceThreatResult.decision,
          violenceThreatResult.findings.map((finding) => finding.ruleId),
        );
      }

      if (normalized.metadata.suspiciousEncodingDetected) {
        addAssessment(
          "ENCODED_CONTENT",
          ["SUSPICIOUS_ENCODING"],
          "WARN",
          ["NORMALIZATION-SUSPICIOUS-ENCODING"],
        );
      }

      const selfHarmResult = detectSelfHarmFixture(content, selfHarmPolicy);
      const hasSelfHarmFixture =
        selfHarmResult.evaluationStatus === "FIXTURE_MATCH";
      if (hasSelfHarmFixture && selfHarmResult.ruleId) {
        addAssessment(
          "SELF_HARM",
          ["SELF_HARM"],
          selfHarmResult.decision,
          [selfHarmResult.ruleId],
        );
      }

      const hasChildSafetyFixture =
        content.trim().toUpperCase() ===
        sexualSafetyPolicy.childSafety.fixture;
      let securityEventId: string | undefined;
      if (hasChildSafetyFixture) {
        const sexualSafetyResult = detectSexualSafety(
          content,
          sexualSafetyPolicy,
        );
        const childSafetyFinding = sexualSafetyResult.findings[0];
        if (!childSafetyFinding) {
          res.status(500).json({
            requestId: res.locals.requestId,
            error: "CHILD_SAFETY_FINDING_MISSING",
          });
          return;
        }
        securityEventId = createChildSafetySecurityEvent(
          res.locals.requestId,
          childSafetyFinding.ruleId,
        );
        addAssessment(
          "CHILD_SAFETY",
          ["CHILD_SAFETY"],
          childSafetyFinding.decision,
          [childSafetyFinding.ruleId],
        );
      }

      const decision = evaluateDecision(
        { findings: decisionFindings },
        decisionPolicy,
      );
      let reviewId: string | undefined;
      if (decision === "ESCALATE") {
        const reviewReasons = reasons.filter(
          (reason) => reason.recommendedAction === "ESCALATE",
        );
        const review = reviewStore.create({
          requestId: res.locals.requestId,
          requesterSubject: principal.subject,
          findingCategories: [
            ...new Set(reviewReasons.flatMap((reason) => reason.categories)),
          ],
          ruleIds: [
            ...new Set(reviewReasons.flatMap((reason) => reason.ruleIds)),
          ],
        });
        if (!review) {
          res.status(503).json({
            requestId: res.locals.requestId,
            error: "REVIEW_QUEUE_FULL",
          });
          return;
        }
        reviewId = review.reviewId;
      }

      const findingCategories = [
        ...new Set(reasons.flatMap((reason) => reason.categories)),
      ];
      const ruleIds = [...new Set(reasons.flatMap((reason) => reason.ruleIds))];
      if (reasons.length > 0) {
        recordAuditDetails(res, {
          findingCategories,
          ruleIds,
          ...(reviewId ? { reviewId } : {}),
        });
      }

      const nextAction = {
        ALLOW: "FORWARD_SANITIZED_CONTENT",
        WARN: "FORWARD_WITH_WARNING",
        MASK: "FORWARD_SANITIZED_CONTENT",
        SAFE_RESPONSE: "RETURN_SAFE_RESPONSE",
        ESCALATE: "WAIT_FOR_HUMAN_REVIEW",
        BLOCK: "STOP",
      } satisfies Record<DecisionAction, string>;
      const response = {
        requestId: res.locals.requestId,
        policyVersion: readiness.policyVersion,
        decision,
        safe: ["ALLOW", "MASK", "SAFE_RESPONSE"].includes(decision),
        reasons,
        nextAction: nextAction[decision],
        normalization: normalized.metadata,
        processingMs: Date.now() - startedAt,
        ...(decision === "ALLOW" ||
        decision === "WARN" ||
        decision === "MASK"
          ? { sanitizedContent: piiResult.sanitizedContent }
          : {}),
        ...(hasSelfHarmFixture && selfHarmResult.responseTemplate
          ? { responseTemplate: selfHarmResult.responseTemplate }
          : {}),
        ...(reviewId ? { reviewId, reviewStatus: "PENDING" } : {}),
        ...(securityEventId ? { securityEventId } : {}),
      };
      res.status(decision === "ESCALATE" ? 202 : 200).json(response);
    },
  );
  app.post(
    "/api/v1/moderate/output",
    authenticate,
    requireRole("moderation.user"),
    requireJsonContentType,
    ...protectedResourceGuards,
    (req, res) => {
      const outputRequest = validateOutputModerationRequest(req.body);
      if (!outputRequest) {
        res.status(400).json({
          requestId: res.locals.requestId,
          error: "INVALID_REQUEST",
          fields: ["body"],
        });
        return;
      }

      const principal = res.locals.principal as AuthenticatedPrincipal;
      const result = moderateOutput(
        outputRequest,
        principal,
        ragDocuments,
        secretRules,
        piiRules,
        confidentialPolicy,
        injectionPolicy,
        normalizationPolicy,
        decisionPolicy,
      );
      res.status(200).json({
        requestId: res.locals.requestId,
        originalRequestId: outputRequest.originalRequestId,
        ...result,
      });
    },
  );
  app.post(
    "/api/v1/detect/self-harm",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateContentRequest,
    ...protectedResourceGuards,
    (req, res) => {
      const { content } = req.body as { content: string };
      const result = detectSelfHarmFixture(content, selfHarmPolicy);
      if (result.ruleId) {
        recordAuditDetails(res, {
          findingCategories: ["SELF_HARM"],
          ruleIds: [result.ruleId],
        });
      }

      res.status(200).json({
        requestId: res.locals.requestId,
        policyVersion: selfHarmPolicy.version,
        ...result,
      });
    },
  );
  app.post(
    "/api/v1/detect/sexual-safety",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateContentRequest,
    ...protectedResourceGuards,
    (req, res) => {
      const { content } = req.body as { content: string };
      const result = detectSexualSafety(content, sexualSafetyPolicy);
      let securityEventId: string | undefined;

      if (result.decision === "BLOCK") {
        const finding = result.findings[0];
        if (!finding) {
          res.status(500).json({
            requestId: res.locals.requestId,
            error: "CHILD_SAFETY_FINDING_MISSING",
          });
          return;
        }

        securityEventId = createChildSafetySecurityEvent(
          res.locals.requestId,
          finding.ruleId,
        );
        recordAuditDetails(res, {
          findingCategories: ["CHILD_SAFETY"],
          ruleIds: [finding.ruleId],
        });
      }

      res.status(200).json({
        requestId: res.locals.requestId,
        policyVersion: sexualSafetyPolicy.version,
        ...result,
        ...(securityEventId ? { securityEventId } : {}),
      });
    },
  );
  app.post(
    "/api/v1/detect/violence-threats",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateContentRequest,
    ...protectedResourceGuards,
    (req, res) => {
      const { content } = req.body as { content: string };
      const result = detectViolenceThreats(
        content,
        violenceThreatPolicy,
        normalizationPolicy,
        decisionPolicy,
      );

      let reviewId: string | undefined;
      if (result.decision === "ESCALATE") {
        const threatCategories = [
          ...new Set(
            result.findings.map((finding) => finding.category),
          ),
        ];
        const ruleIds = result.findings.map((finding) => finding.ruleId);
        const review = reviewStore.create({
          requestId: res.locals.requestId,
          requesterSubject: (
            res.locals.principal as AuthenticatedPrincipal
          ).subject,
          findingCategories: threatCategories,
          ruleIds,
        });
        if (!review) {
          res.status(503).json({
            requestId: res.locals.requestId,
            error: "REVIEW_QUEUE_FULL",
          });
          return;
        }

        reviewId = review.reviewId;
        recordAuditDetails(res, {
          findingCategories: threatCategories,
          ruleIds,
          reviewId,
        });
      } else {
        recordAuditDetails(res, {
          findingCategories: result.category ? [result.category] : [],
          ruleIds: result.findings.map((finding) => finding.ruleId),
        });
      }

      res.status(200).json({
        requestId: res.locals.requestId,
        policyVersion: violenceThreatPolicy.version,
        ...result,
        ...(reviewId ? { reviewId, reviewStatus: "PENDING" } : {}),
      });
    },
  );
  app.post(
    "/api/v1/detect/harmful-content",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateContentRequest,
    ...protectedResourceGuards,
    (req, res) => {
      const { content } = req.body as { content: string };
      const result = detectHarmfulContent(
        content,
        harmfulContentPolicy,
        normalizationPolicy,
        decisionPolicy,
      );
      recordAuditDetails(res, {
        findingCategories: result.category ? [result.category] : [],
        ruleIds: result.findings.map((finding) => finding.ruleId),
      });
      res.status(200).json({
        requestId: res.locals.requestId,
        policyVersion: harmfulContentPolicy.version,
        ...result,
      });
    },
  );
  app.post(
    "/api/v1/detect/misuse",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateContentRequest,
    ...protectedResourceGuards,
    (req, res) => {
      const { content } = req.body as { content: string };
      const result = detectMisuse(
        content,
        misusePolicy,
        normalizationPolicy,
        decisionPolicy,
      );
      recordAuditDetails(res, {
        findingCategories: result.categories,
        ruleIds: result.findings.map((finding) => finding.ruleId),
      });
      res.status(200).json({
        requestId: res.locals.requestId,
        policyVersion: misusePolicy.version,
        ...result,
      });
    },
  );
  app.post(
    "/api/v1/detect/content-safety",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateContentRequest,
    ...protectedResourceGuards,
    (req, res) => {
      const { content } = req.body as { content: string };
      const result = detectContentSafety(
        content,
        contentSafetyPolicy,
        normalizationPolicy,
        decisionPolicy,
      );
      recordAuditDetails(res, {
        findingCategories: result.categories.map((category) => category.name),
        ruleIds: result.findings.map((finding) => finding.ruleId),
      });
      res.status(200).json({
        requestId: res.locals.requestId,
        policyVersion: contentSafetyPolicy.version,
        categories: result.categories,
        recommendedAction: result.recommendedAction,
        context: result.context,
        findings: result.findings,
      });
    },
  );
  app.post(
    "/api/v1/detect/pii",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateContentRequest,
    ...protectedResourceGuards,
    (req, res) => {
      const { content } = req.body as { content: string };
      res.status(200).json({
        requestId: res.locals.requestId,
        ...detectPii(
          normalizeText(content, normalizationPolicy).normalizedContent,
          piiRules,
        ),
      });
    },
  );
  app.post(
    "/api/v1/detect/confidential",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateContentRequest,
    ...protectedResourceGuards,
    (req, res) => {
      const { content } = req.body as { content: string };
      res.status(200).json({
        requestId: res.locals.requestId,
        ...detectConfidential(
          normalizeText(content, normalizationPolicy).analysisText,
          confidentialPolicy,
        ),
      });
    },
  );
  app.post(
    "/api/v1/detect/injection",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateContentRequest,
    ...protectedResourceGuards,
    (req, res) => {
      const { content } = req.body as { content: string };
      res.status(200).json({
        requestId: res.locals.requestId,
        ...detectInjection(
          normalizeText(content, normalizationPolicy).analysisText,
          injectionPolicy,
        ),
      });
    },
  );
  app.post(
    "/api/v1/detect/jailbreak",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateContentRequest,
    ...protectedResourceGuards,
    (req, res, next) => {
      const { content } = req.body as { content: string };
      const principal = res.locals.principal as { subject: string };

      try {
        res.status(200).json({
          requestId: res.locals.requestId,
          ...detectJailbreak(
            normalizeText(content, normalizationPolicy).analysisText,
            principal.subject,
          ),
        });
      } catch (error) {
        next(error);
      }
    },
  );
  app.post(
    "/api/v1/detect/secrets",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateContentRequest,
    ...protectedResourceGuards,
    (req, res) => {
      const { content } = req.body as { content: string };

      res.status(200).json({
        requestId: res.locals.requestId,
        ...detectSecret(
          normalizeText(content, normalizationPolicy).analysisText,
          secretRules,
        ),
      });
    },
  );
  app.post(
    "/api/v1/rag/authorize",
    authenticate,
    requireRole("moderation.user"),
    requireJsonContentType,
    ...protectedResourceGuards,
    (req, res) => {
      const authorizationRequest = validateRagAuthorizationRequest(req.body);
      if (!authorizationRequest) {
        res.status(400).json({
          requestId: res.locals.requestId,
          error: "INVALID_REQUEST",
          fields: ["body"],
        });
        return;
      }

      const principal = res.locals.principal as AuthenticatedPrincipal;
      const authorized = isRagDocumentAuthorized(
        authorizationRequest,
        principal,
        ragDocuments,
      );
      res.status(200).json({
        requestId: res.locals.requestId,
        authorized,
        recommendedAction: authorized ? "ALLOW" : "BLOCK",
      });
    },
  );
  app.post(
    "/api/v1/rag/validate-context",
    authenticate,
    requireRole("moderation.user"),
    requireJsonContentType,
    ...protectedResourceGuards,
    (req, res) => {
      const contextRequest = validateRagContextRequest(req.body);
      if (!contextRequest) {
        res.status(400).json({
          requestId: res.locals.requestId,
          error: "INVALID_REQUEST",
          fields: ["body"],
        });
        return;
      }

      const principal = res.locals.principal as AuthenticatedPrincipal;
      const result = validateRagContext(
        contextRequest,
        principal,
        ragDocuments,
        secretRules,
        piiRules,
        confidentialPolicy,
        injectionPolicy,
        normalizationPolicy,
        resourceLimits,
        tokenEncoding,
      );
      res.status(200).json({
        requestId: res.locals.requestId,
        ...result,
      });
    },
  );
  app.post(
    "/api/v1/rag/validate-grounding",
    authenticate,
    requireRole("moderation.user"),
    requireJsonContentType,
    ...protectedResourceGuards,
    (req, res) => {
      const groundingRequest = validateRagGroundingRequest(req.body);
      if (!groundingRequest) {
        res.status(400).json({
          requestId: res.locals.requestId,
          error: "INVALID_REQUEST",
          fields: ["body"],
        });
        return;
      }

      const principal = res.locals.principal as AuthenticatedPrincipal;
      const result = validateRagGrounding(
        groundingRequest,
        principal,
        ragDocuments,
        secretRules,
        piiRules,
        confidentialPolicy,
        injectionPolicy,
        normalizationPolicy,
        resourceLimits,
        tokenEncoding,
      );
      res.status(200).json({
        requestId: res.locals.requestId,
        ...result,
      });
    },
  );
  app.post(
    "/api/v1/tools/validate-action",
    authenticate,
    requireRole("moderation.user"),
    requireJsonContentType,
    ...protectedResourceGuards,
    (req, res) => {
      const actionRequest = validateToolActionRequest(req.body);
      if (!actionRequest) {
        res.status(400).json({
          requestId: res.locals.requestId,
          error: "INVALID_REQUEST",
          fields: ["body"],
        });
        return;
      }

      const principal = res.locals.principal as AuthenticatedPrincipal;
      const validation = validateToolAction(actionRequest, principal);
      if (validation.kind === "replay") {
        res.status(409).json({
          requestId: res.locals.requestId,
          error: "ACTION_REPLAYED",
        });
        return;
      }
      if (validation.kind === "capacity") {
        res.status(503).json({
          requestId: res.locals.requestId,
          error: "ACTION_TRACKING_CAPACITY_REACHED",
        });
        return;
      }

      let reviewId: string | undefined;
      if (validation.result.decision === "ESCALATE") {
        const reviewReason = validation.result.reviewReason;
        if (!reviewReason) {
          res.status(500).json({
            requestId: res.locals.requestId,
            error: "ESCALATION_REASON_MISSING",
          });
          return;
        }
        const review = reviewStore.create({
          requestId: res.locals.requestId,
          requesterSubject: principal.subject,
          findingCategories: [reviewReason],
          ruleIds: ["TOOL_ACTION_APPROVAL_REQUIRED"],
        });
        if (!review) {
          res.status(503).json({
            requestId: res.locals.requestId,
            error: "REVIEW_QUEUE_FULL",
          });
          return;
        }
        reviewId = review.reviewId;
        recordAuditDetails(res, {
          findingCategories: review.findingCategories,
          ruleIds: review.ruleIds,
          reviewId,
        });
      }

      res.status(200).json({
        requestId: res.locals.requestId,
        ...validation.result,
        ...(reviewId ? { reviewId, reviewStatus: "PENDING" } : {}),
      });
    },
  );
  app.post(
    "/api/v1/validate/tokens",
    authenticate,
    requireRole("moderation.tester"),
    requireJsonContentType,
    validateTokenRequest,
    ...protectedResourceGuards,
    (req, res) => {
      const { content } = req.body as { content: string };
      const tokenCount = countInputTokens(
        content,
        tokenEncoding,
      );
      const maxInputTokens = resourceLimits.tokenLimit.maxInputTokens;
      const valid = tokenCount <= maxInputTokens;
      const response = {
        requestId: res.locals.requestId,
        tokenCount,
        maxInputTokens,
        valid,
        recommendedAction: valid ? "ALLOW" : "BLOCK",
      };

      res.status(valid ? 200 : 413).json(response);
    },
  );
  app.post(
    "/api/v1/validate/file",
    authenticate,
    requireRole("moderation.tester"),
    ...protectedResourceGuards,
    (req, res, next) => {
      if (!req.is("multipart/form-data")) {
        res.status(415).json({
          requestId: res.locals.requestId,
          error: "UNSUPPORTED_MEDIA_TYPE",
        });
        return;
      }

      next();
    },
    uploadSingleFile(resourceLimits.fileUpload.maximumFileSizeBytes),
    validateUploadedPdf,
    (_req, res) => {
      res.status(200).json({
        requestId: res.locals.requestId,
        valid: true,
        detectedType: "application/pdf",
        recommendedAction: "ALLOW",
      });
    },
  );
  app.post(
    "/api/v1/reviews",
    authenticate,
    requireRole("moderation.user"),
    requireJsonContentType,
    ...protectedResourceGuards,
    (req, res) => {
      const reviewRequest = validateCreateReviewRequest(req.body);
      if (!reviewRequest) {
        res.status(400).json({
          requestId: res.locals.requestId,
          error: "INVALID_REQUEST",
          fields: ["findingCategories", "ruleIds"],
        });
        return;
      }

      const principal = res.locals.principal as AuthenticatedPrincipal;
      const review = reviewStore.create({
        requestId: res.locals.requestId,
        requesterSubject: principal.subject,
        ...reviewRequest,
      });
      if (!review) {
        res.status(503).json({
          requestId: res.locals.requestId,
          error: "REVIEW_QUEUE_FULL",
        });
        return;
      }

      recordAuditDetails(res, {
        findingCategories: review.findingCategories,
        ruleIds: review.ruleIds,
        reviewId: review.reviewId,
      });
      res.status(202).json({
        requestId: res.locals.requestId,
        reviewId: review.reviewId,
        status: review.status,
        decision: review.decision,
      });
    },
  );
  app.get(
    "/api/v1/reviews/escalations",
    authenticate,
    requireRole("moderation.reviewer"),
    ...protectedResourceGuards,
    (_req, res) => {
      res.status(200).json({
        requestId: res.locals.requestId,
        reviews: reviewStore.listPending(),
      });
    },
  );
  app.get(
    "/api/v1/admin/policy",
    authenticate,
    requireRole("moderation.admin"),
    ...protectedResourceGuards,
    (_req, res) => {
      if (readiness.status === "NOT_READY") {
        res.status(503).json({
          requestId: res.locals.requestId,
          error: {
            code: "NOT_READY",
            message: "Policy configuration is unavailable.",
          },
        });
        return;
      }

      res.status(200).json({
        requestId: res.locals.requestId,
        policyVersion: readiness.policyVersion,
      });
    },
  );
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
}
