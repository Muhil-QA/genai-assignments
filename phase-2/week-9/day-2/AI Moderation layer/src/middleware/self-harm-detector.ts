import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export interface SelfHarmPolicy {
  version: string;
  fixture: string;
  ruleId: string;
  decision: "SAFE_RESPONSE";
  responseTemplate: "SELF_HARM_SUPPORT_V1";
}

interface SelfHarmPolicyFile {
  version: string;
  fixture: string;
  ruleId: string;
  decision: string;
  responseTemplate: string;
}

export interface SelfHarmResult {
  decision: "SAFE_RESPONSE" | "WARN";
  safe: boolean;
  evaluationStatus: "FIXTURE_MATCH" | "NOT_EVALUATED";
  responseTemplate?: "SELF_HARM_SUPPORT_V1";
  category?: "SELF_HARM";
  ruleId?: string;
}

const fixturePattern = /^[A-Z0-9_]{1,128}$/;
const identifierPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;

export function loadSelfHarmPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.SELF_HARM_POLICY_PATH ?? "config/self-harm.yaml",
  ),
): SelfHarmPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Self-harm policy could not be loaded from "${filePath}".`, {
      cause: error,
    });
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Self-harm policy must be an object.");
  }

  const config = parsed as Partial<SelfHarmPolicyFile>;
  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    typeof config.fixture !== "string" ||
    !fixturePattern.test(config.fixture) ||
    typeof config.ruleId !== "string" ||
    !identifierPattern.test(config.ruleId) ||
    config.decision !== "SAFE_RESPONSE" ||
    config.responseTemplate !== "SELF_HARM_SUPPORT_V1"
  ) {
    throw new Error("Self-harm policy contains invalid values.");
  }

  return {
    version: config.version,
    fixture: config.fixture,
    ruleId: config.ruleId,
    decision: "SAFE_RESPONSE",
    responseTemplate: "SELF_HARM_SUPPORT_V1",
  };
}

export function detectSelfHarmFixture(
  content: string,
  policy: SelfHarmPolicy,
): SelfHarmResult {
  if (content.trim().toUpperCase() !== policy.fixture) {
    return {
      decision: "WARN",
      safe: false,
      evaluationStatus: "NOT_EVALUATED",
    };
  }

  return {
    decision: "SAFE_RESPONSE",
    safe: true,
    evaluationStatus: "FIXTURE_MATCH",
    responseTemplate: policy.responseTemplate,
    category: "SELF_HARM",
    ruleId: policy.ruleId,
  };
}
