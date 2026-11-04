import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export interface InjectionRule {
  id: string;
  weight: number;
  pattern: RegExp;
}

export interface InjectionPolicy {
  version: string;
  warnThreshold: number;
  blockThreshold: number;
  maximumRiskScore: number;
  rules: InjectionRule[];
}

interface InjectionRulesFile {
  version: string;
  warnThreshold: number;
  blockThreshold: number;
  maximumRiskScore: number;
  rules: Array<{
    id: string;
    weight: number;
    pattern: string;
  }>;
}

export function loadInjectionPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.INJECTION_RULES_PATH ?? "config/injection-rules.yaml",
  ),
): InjectionPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Injection rules could not be loaded from "${filePath}".`, {
      cause: error,
    });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Injection rules configuration must be an object.");
  }

  const config = parsed as Partial<InjectionRulesFile>;
  const validScore = (score: unknown): score is number =>
    typeof score === "number" &&
    Number.isInteger(score) &&
    score >= 0 &&
    score <= 100;

  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    !validScore(config.warnThreshold) ||
    !validScore(config.blockThreshold) ||
    !validScore(config.maximumRiskScore) ||
    config.warnThreshold > config.blockThreshold ||
    config.blockThreshold > config.maximumRiskScore ||
    !Array.isArray(config.rules) ||
    config.rules.length === 0
  ) {
    throw new Error("Injection rules configuration contains invalid values.");
  }

  const ruleIds = new Set<string>();
  const rules = config.rules.map((rule, index): InjectionRule => {
    if (
      typeof rule !== "object" ||
      rule === null ||
      typeof rule.id !== "string" ||
      rule.id.trim().length === 0 ||
      ruleIds.has(rule.id) ||
      !validScore(rule.weight) ||
      rule.weight === 0 ||
      typeof rule.pattern !== "string" ||
      rule.pattern.length === 0
    ) {
      throw new Error(`Injection rule at index ${index} is invalid.`);
    }

    ruleIds.add(rule.id);
    try {
      return {
        id: rule.id,
        weight: rule.weight,
        pattern: new RegExp(rule.pattern, "i"),
      };
    } catch (error) {
      throw new Error(`Injection rule "${rule.id}" has an invalid pattern.`, {
        cause: error,
      });
    }
  });

  return {
    version: config.version,
    warnThreshold: config.warnThreshold,
    blockThreshold: config.blockThreshold,
    maximumRiskScore: config.maximumRiskScore,
    rules,
  };
}

export interface InjectionDetectionResult {
  matched: boolean;
  riskScore: number;
  warnThreshold: number;
  blockThreshold: number;
  threshold: number;
  recommendedAction: "ALLOW" | "WARN" | "BLOCK";
  findings: Array<{ ruleId: string; weight: number }>;
}

export function detectInjection(
  content: string,
  policy: InjectionPolicy,
): InjectionDetectionResult {
  const findings = policy.rules
    .filter((rule) => rule.pattern.test(content))
    .map(({ id, weight }) => ({ ruleId: id, weight }));
  const riskScore = Math.min(
    policy.maximumRiskScore,
    findings.reduce((total, finding) => total + finding.weight, 0),
  );
  const recommendedAction =
    riskScore >= policy.blockThreshold
      ? "BLOCK"
      : riskScore >= policy.warnThreshold
        ? "WARN"
        : "ALLOW";

  return {
    matched: riskScore >= policy.warnThreshold,
    riskScore,
    warnThreshold: policy.warnThreshold,
    blockThreshold: policy.blockThreshold,
    threshold: policy.blockThreshold,
    recommendedAction,
    findings,
  };
}
