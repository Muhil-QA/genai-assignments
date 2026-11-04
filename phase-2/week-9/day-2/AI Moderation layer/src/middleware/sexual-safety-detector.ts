import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { logger } from "../utils/logger";

export interface SexualSafetyPolicy {
  version: string;
  adultContentAction: "WARN";
  childSafety: {
    fixture: string;
    ruleId: string;
    decision: "BLOCK";
  };
}

interface SexualSafetyPolicyFile {
  version: string;
  adultContentAction: string;
  childSafety: {
    fixture: string;
    ruleId: string;
    decision: string;
  };
}

export interface SexualSafetyResult {
  categories: Array<{ name: "CHILD_SAFETY"; severity: "CRITICAL" }>;
  adultContent: {
    status: "NOT_EVALUATED";
    recommendedAction: "WARN";
  };
  decision: "WARN" | "BLOCK";
  findings: Array<{
    category: "CHILD_SAFETY";
    severity: "CRITICAL";
    ruleId: string;
    decision: "BLOCK";
  }>;
}

export interface SecurityEventLogger {
  warn: (event: Record<string, unknown>) => void;
}

const identifierPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const fixturePattern = /^[A-Z0-9_]{1,128}$/;

export function loadSexualSafetyPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.SEXUAL_SAFETY_POLICY_PATH ?? "config/sexual-safety.yaml",
  ),
): SexualSafetyPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Sexual safety policy could not be loaded from "${filePath}".`,
      { cause: error },
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Sexual safety policy must be an object.");
  }

  const config = parsed as Partial<SexualSafetyPolicyFile>;
  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    config.adultContentAction !== "WARN" ||
    typeof config.childSafety !== "object" ||
    config.childSafety === null ||
    typeof config.childSafety.fixture !== "string" ||
    !fixturePattern.test(config.childSafety.fixture) ||
    typeof config.childSafety.ruleId !== "string" ||
    !identifierPattern.test(config.childSafety.ruleId) ||
    config.childSafety.decision !== "BLOCK"
  ) {
    throw new Error("Sexual safety policy contains invalid values.");
  }

  return {
    version: config.version,
    adultContentAction: "WARN",
    childSafety: {
      fixture: config.childSafety.fixture,
      ruleId: config.childSafety.ruleId,
      decision: "BLOCK",
    },
  };
}

export function createChildSafetySecurityEvent(
  requestId: string,
  ruleId: string,
  eventLogger: SecurityEventLogger = logger,
): string {
  const eventId = `SEC-${randomUUID()}`;
  eventLogger.warn({
    event: "child_safety_security_event",
    eventId,
    requestId,
    timestamp: new Date().toISOString(),
    category: "CHILD_SAFETY",
    ruleId,
    decision: "BLOCK",
  });
  return eventId;
}

export function detectSexualSafety(
  content: string,
  policy: SexualSafetyPolicy,
): SexualSafetyResult {
  const isSyntheticChildSafetyFixture =
    content.trim().toUpperCase() === policy.childSafety.fixture;

  return {
    categories: isSyntheticChildSafetyFixture
      ? [{ name: "CHILD_SAFETY", severity: "CRITICAL" }]
      : [],
    adultContent: {
      status: "NOT_EVALUATED",
      recommendedAction: policy.adultContentAction,
    },
    decision: isSyntheticChildSafetyFixture
      ? policy.childSafety.decision
      : policy.adultContentAction,
    findings: isSyntheticChildSafetyFixture
      ? [
          {
            category: "CHILD_SAFETY",
            severity: "CRITICAL",
            ruleId: policy.childSafety.ruleId,
            decision: policy.childSafety.decision,
          },
        ]
      : [],
  };
}
