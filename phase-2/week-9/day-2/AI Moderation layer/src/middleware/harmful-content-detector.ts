import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { DecisionAction, DecisionPolicy, evaluateDecision } from "./decision-engine";
import { NormalizationPolicy, normalizeText } from "./text-normalizer";

export type HarmfulContentSeverity = "LOW" | "MEDIUM" | "HIGH";
export type HarmfulContentDecision = Extract<
  DecisionAction,
  "ALLOW" | "WARN" | "SAFE_RESPONSE" | "ESCALATE" | "BLOCK"
>;

export interface HarmfulContentRule {
  id: string;
  category: "DANGEROUS_ACTIVITY";
  severity: HarmfulContentSeverity;
  decision: HarmfulContentDecision;
  pattern: RegExp;
}

export interface HarmfulContentPolicy {
  version: string;
  rules: HarmfulContentRule[];
}

interface HarmfulContentPolicyFile {
  version: string;
  rules: Array<{
    id: string;
    category: string;
    severity: string;
    decision: string;
    pattern: string;
  }>;
}

export interface HarmfulContentResult {
  category: "DANGEROUS_ACTIVITY" | null;
  severity: HarmfulContentSeverity | null;
  decision: DecisionAction;
  findings: Array<{
    category: "DANGEROUS_ACTIVITY";
    severity: HarmfulContentSeverity;
    ruleId: string;
    decision: HarmfulContentDecision;
  }>;
}

const severityValues: HarmfulContentSeverity[] = ["LOW", "MEDIUM", "HIGH"];
const allowedDecisions = new Set<HarmfulContentDecision>([
  "ALLOW",
  "WARN",
  "SAFE_RESPONSE",
  "ESCALATE",
  "BLOCK",
]);
const identifierPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const maximumRules = 100;

export function loadHarmfulContentPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.HARMFUL_CONTENT_POLICY_PATH ??
      "config/harmful-content.yaml",
  ),
): HarmfulContentPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Harmful content policy could not be loaded from "${filePath}".`,
      { cause: error },
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Harmful content policy must be an object.");
  }

  const config = parsed as Partial<HarmfulContentPolicyFile>;
  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    !Array.isArray(config.rules) ||
    config.rules.length === 0 ||
    config.rules.length > maximumRules
  ) {
    throw new Error("Harmful content policy contains invalid values.");
  }

  const ruleIds = new Set<string>();
  const rules = config.rules.map((rule, index): HarmfulContentRule => {
    if (
      typeof rule !== "object" ||
      rule === null ||
      typeof rule.id !== "string" ||
      !identifierPattern.test(rule.id) ||
      ruleIds.has(rule.id) ||
      rule.category !== "DANGEROUS_ACTIVITY" ||
      typeof rule.severity !== "string" ||
      !severityValues.includes(rule.severity as HarmfulContentSeverity) ||
      typeof rule.decision !== "string" ||
      !allowedDecisions.has(rule.decision as HarmfulContentDecision) ||
      typeof rule.pattern !== "string" ||
      rule.pattern.length === 0 ||
      rule.pattern.length > 1000
    ) {
      throw new Error(`Harmful content rule at index ${index} is invalid.`);
    }

    ruleIds.add(rule.id);
    try {
      return {
        id: rule.id,
        category: "DANGEROUS_ACTIVITY",
        severity: rule.severity as HarmfulContentSeverity,
        decision: rule.decision as HarmfulContentDecision,
        pattern: new RegExp(rule.pattern, "i"),
      };
    } catch (error) {
      throw new Error(
        `Harmful content rule "${rule.id}" has an invalid pattern.`,
        { cause: error },
      );
    }
  });

  return { version: config.version, rules };
}

const severityPriority: Record<HarmfulContentSeverity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};

export function detectHarmfulContent(
  content: string,
  policy: HarmfulContentPolicy,
  normalizationPolicy: NormalizationPolicy,
  decisionPolicy: DecisionPolicy,
): HarmfulContentResult {
  const normalized = normalizeText(content, normalizationPolicy);
  const matchedRules = policy.rules.filter((rule) =>
    rule.pattern.test(normalized.analysisText),
  );
  const findings = matchedRules.map((rule) => ({
    category: rule.category,
    severity: rule.severity,
    ruleId: rule.id,
    decision: rule.decision,
  }));
  const decision = evaluateDecision(
    {
      findings: matchedRules.map((rule, index) => ({
        control: `HARMFUL_CONTENT_${index}`,
        recommendedAction: rule.decision,
      })),
    },
    decisionPolicy,
  );
  const highestSeverity = matchedRules.reduce<HarmfulContentSeverity | null>(
    (current, rule) =>
      current === null ||
      severityPriority[rule.severity] > severityPriority[current]
        ? rule.severity
        : current,
    null,
  );

  return {
    category: matchedRules.length > 0 ? "DANGEROUS_ACTIVITY" : null,
    severity: highestSeverity,
    decision,
    findings,
  };
}
