import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { DecisionAction, DecisionPolicy, evaluateDecision } from "./decision-engine";
import { NormalizationPolicy, normalizeText } from "./text-normalizer";

export type ViolenceThreatCategory = "VIOLENCE" | "THREAT" | "TERRORISM";
export type ViolenceThreatSeverity = "LOW" | "MEDIUM" | "HIGH";
export type ViolenceThreatContext =
  | "DESCRIPTIVE"
  | "GRAPHIC"
  | "CREDIBLE_THREAT"
  | "OPERATIONAL_SUPPORT";
type ViolenceThreatDecision = Extract<
  DecisionAction,
  "ALLOW" | "WARN" | "SAFE_RESPONSE" | "ESCALATE" | "BLOCK"
>;

export interface ViolenceThreatRule {
  id: string;
  category: ViolenceThreatCategory;
  severity: ViolenceThreatSeverity;
  context: ViolenceThreatContext;
  decision: ViolenceThreatDecision;
  pattern: RegExp;
}

export interface ViolenceThreatPolicy {
  version: string;
  rules: ViolenceThreatRule[];
}

interface ViolenceThreatPolicyFile {
  version: string;
  rules: Array<{
    id: string;
    category: string;
    severity: string;
    context: string;
    decision: string;
    pattern: string;
  }>;
}

export interface ViolenceThreatResult {
  category: ViolenceThreatCategory | null;
  severity: ViolenceThreatSeverity | null;
  context: ViolenceThreatContext | "NONE";
  decision: DecisionAction;
  findings: Array<{
    category: ViolenceThreatCategory;
    severity: ViolenceThreatSeverity;
    context: ViolenceThreatContext;
    ruleId: string;
    decision: ViolenceThreatDecision;
  }>;
}

const categoryValues: ViolenceThreatCategory[] = ["VIOLENCE", "THREAT", "TERRORISM"];
const severityValues: ViolenceThreatSeverity[] = ["LOW", "MEDIUM", "HIGH"];
const contextValues: ViolenceThreatContext[] = [
  "DESCRIPTIVE",
  "GRAPHIC",
  "CREDIBLE_THREAT",
  "OPERATIONAL_SUPPORT",
];
const allowedDecisions = new Set<ViolenceThreatDecision>([
  "ALLOW",
  "WARN",
  "SAFE_RESPONSE",
  "ESCALATE",
  "BLOCK",
]);
const identifierPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const maximumRules = 100;

export function loadViolenceThreatPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.VIOLENCE_THREATS_POLICY_PATH ??
      "config/violence-threats.yaml",
  ),
): ViolenceThreatPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Violence and threats policy could not be loaded from "${filePath}".`,
      { cause: error },
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Violence and threats policy must be an object.");
  }

  const config = parsed as Partial<ViolenceThreatPolicyFile>;
  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    !Array.isArray(config.rules) ||
    config.rules.length === 0 ||
    config.rules.length > maximumRules
  ) {
    throw new Error("Violence and threats policy contains invalid values.");
  }

  const ruleIds = new Set<string>();
  const rules = config.rules.map((rule, index): ViolenceThreatRule => {
    if (
      typeof rule !== "object" ||
      rule === null ||
      typeof rule.id !== "string" ||
      !identifierPattern.test(rule.id) ||
      ruleIds.has(rule.id) ||
      typeof rule.category !== "string" ||
      !categoryValues.includes(rule.category as ViolenceThreatCategory) ||
      typeof rule.severity !== "string" ||
      !severityValues.includes(rule.severity as ViolenceThreatSeverity) ||
      typeof rule.context !== "string" ||
      !contextValues.includes(rule.context as ViolenceThreatContext) ||
      typeof rule.decision !== "string" ||
      !allowedDecisions.has(rule.decision as ViolenceThreatDecision) ||
      typeof rule.pattern !== "string" ||
      rule.pattern.length === 0 ||
      rule.pattern.length > 1000
    ) {
      throw new Error(`Violence and threats rule at index ${index} is invalid.`);
    }

    ruleIds.add(rule.id);
    try {
      return {
        id: rule.id,
        category: rule.category as ViolenceThreatCategory,
        severity: rule.severity as ViolenceThreatSeverity,
        context: rule.context as ViolenceThreatContext,
        decision: rule.decision as ViolenceThreatDecision,
        pattern: new RegExp(rule.pattern, "i"),
      };
    } catch (error) {
      throw new Error(
        `Violence and threats rule "${rule.id}" has an invalid pattern.`,
        { cause: error },
      );
    }
  });

  return { version: config.version, rules };
}

const severityPriority: Record<ViolenceThreatSeverity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};
export function detectViolenceThreats(
  content: string,
  policy: ViolenceThreatPolicy,
  normalizationPolicy: NormalizationPolicy,
  decisionPolicy: DecisionPolicy,
): ViolenceThreatResult {
  const normalized = normalizeText(content, normalizationPolicy);
  const matchedRules = policy.rules.filter((rule) =>
    rule.pattern.test(normalized.analysisText),
  );
  const findings = matchedRules.map((rule) => ({
    category: rule.category,
    severity: rule.severity,
    context: rule.context,
    ruleId: rule.id,
    decision: rule.decision,
  }));
  const decision = evaluateDecision({
    findings: matchedRules.map((rule, index) => ({
      control: `VIOLENCE_THREATS_${index}`,
      recommendedAction: rule.decision,
    })),
  }, decisionPolicy);
  const highestSeverity = matchedRules.reduce<ViolenceThreatSeverity | null>(
    (current, rule) =>
      current === null ||
      severityPriority[rule.severity] > severityPriority[current]
        ? rule.severity
        : current,
    null,
  );
  const primaryRule =
    matchedRules.find((rule) => rule.decision === decision) ??
    matchedRules[0];

  return {
    category: primaryRule?.category ?? null,
    severity: highestSeverity,
    context: primaryRule?.context ?? "NONE",
    decision,
    findings,
  };
}
