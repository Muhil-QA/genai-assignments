import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export const decisionActions = [
  "ALLOW",
  "WARN",
  "MASK",
  "SAFE_RESPONSE",
  "ESCALATE",
  "BLOCK",
] as const;

export type DecisionAction = (typeof decisionActions)[number];

export interface DecisionFinding {
  control: string;
  recommendedAction: DecisionAction;
}

export interface DecisionRequest {
  findings: DecisionFinding[];
}

export interface DecisionPolicy {
  version: string;
  priority: DecisionAction[];
}

interface DecisionPolicyFile {
  version: string;
  priority: string[];
}

const maximumFindings = 100;
const controlPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

export function loadDecisionPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.DECISION_POLICY_PATH ?? "config/decision-policy.yaml",
  ),
): DecisionPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Decision policy could not be loaded from "${filePath}".`, {
      cause: error,
    });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Decision policy must be an object.");
  }

  const config = parsed as Partial<DecisionPolicyFile>;
  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    !Array.isArray(config.priority) ||
    config.priority.length !== decisionActions.length ||
    !config.priority.every(
      (action) =>
        typeof action === "string" &&
        decisionActions.includes(action as DecisionAction),
    ) ||
    new Set(config.priority).size !== decisionActions.length
  ) {
    throw new Error(
      "Decision policy must define a version and each decision action exactly once.",
    );
  }

  return {
    version: config.version,
    priority: [...config.priority] as DecisionAction[],
  };
}

export function validateDecisionRequest(body: unknown): DecisionRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const payload = body as Record<string, unknown>;
  if (
    Object.keys(payload).length !== 1 ||
    !Object.hasOwn(payload, "findings") ||
    !Array.isArray(payload.findings) ||
    payload.findings.length > maximumFindings
  ) {
    return null;
  }

  const findings: DecisionFinding[] = [];
  for (const finding of payload.findings) {
    if (typeof finding !== "object" || finding === null || Array.isArray(finding)) {
      return null;
    }

    const record = finding as Record<string, unknown>;
    if (
      Object.keys(record).length !== 2 ||
      !Object.hasOwn(record, "control") ||
      !Object.hasOwn(record, "recommendedAction") ||
      typeof record.control !== "string" ||
      !controlPattern.test(record.control) ||
      typeof record.recommendedAction !== "string" ||
      !decisionActions.includes(record.recommendedAction as DecisionAction)
    ) {
      return null;
    }

    findings.push({
      control: record.control,
      recommendedAction: record.recommendedAction as DecisionAction,
    });
  }

  return { findings };
}

export function evaluateDecision(
  request: DecisionRequest,
  policy: DecisionPolicy,
): DecisionAction {
  const priority = new Map(
    policy.priority.map((action, index) => [action, index]),
  );
  return request.findings.reduce<DecisionAction>(
    (decision, finding) =>
      priority.get(finding.recommendedAction)! < priority.get(decision)!
        ? finding.recommendedAction
        : decision,
    "ALLOW",
  );
}
