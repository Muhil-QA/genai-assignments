import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  DecisionAction,
  DecisionPolicy,
  evaluateDecision,
} from "./decision-engine";
import { NormalizationPolicy, normalizeText } from "./text-normalizer";

export type ContentSafetyCategory =
  | "BIAS"
  | "HATE"
  | "HARASSMENT"
  | "THREAT";
export type ContentSafetySeverity = "LOW" | "MEDIUM" | "HIGH";

export interface ContentSafetyRule {
  id: string;
  category: ContentSafetyCategory;
  severity: ContentSafetySeverity;
  recommendedAction: DecisionAction;
  pattern: RegExp;
}

export interface ContentSafetyPolicy {
  version: string;
  analysisContextAction: DecisionAction;
  rules: ContentSafetyRule[];
}

interface ContentSafetyPolicyFile {
  version: string;
  analysisContextAction: string;
  rules: Array<{
    id: string;
    category: string;
    severity: string;
    recommendedAction: string;
    pattern: string;
  }>;
}

export interface ContentSafetyResult {
  categories: Array<{
    name: ContentSafetyCategory;
    severity: ContentSafetySeverity;
  }>;
  recommendedAction: DecisionAction;
  context: "STANDARD" | "ANALYSIS";
  findings: Array<{
    category: ContentSafetyCategory;
    ruleId: string;
    severity: ContentSafetySeverity;
  }>;
}

const categories: ContentSafetyCategory[] = [
  "BIAS",
  "HATE",
  "HARASSMENT",
  "THREAT",
];
const severities: ContentSafetySeverity[] = ["LOW", "MEDIUM", "HIGH"];
const allowedActions = new Set<DecisionAction>([
  "ALLOW",
  "WARN",
  "SAFE_RESPONSE",
  "ESCALATE",
  "BLOCK",
]);
const identifierPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const analysisContextPattern =
  /\b(?:analy[sz]e|classify|moderate|review)\b.{0,60}\b(?:quote|quoted|phrase|statement|text|message)\b/i;
const maximumRules = 100;

export function loadContentSafetyPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.CONTENT_SAFETY_POLICY_PATH ??
      "config/content-safety.yaml",
  ),
): ContentSafetyPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Content safety policy could not be loaded from "${filePath}".`,
      { cause: error },
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Content safety policy must be an object.");
  }

  const config = parsed as Partial<ContentSafetyPolicyFile>;
  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    typeof config.analysisContextAction !== "string" ||
    !allowedActions.has(config.analysisContextAction as DecisionAction) ||
    !Array.isArray(config.rules) ||
    config.rules.length === 0 ||
    config.rules.length > maximumRules
  ) {
    throw new Error("Content safety policy contains invalid values.");
  }

  const ruleIds = new Set<string>();
  const rules = config.rules.map((rule, index): ContentSafetyRule => {
    if (
      typeof rule !== "object" ||
      rule === null ||
      typeof rule.id !== "string" ||
      !identifierPattern.test(rule.id) ||
      ruleIds.has(rule.id) ||
      typeof rule.category !== "string" ||
      !categories.includes(rule.category as ContentSafetyCategory) ||
      typeof rule.severity !== "string" ||
      !severities.includes(rule.severity as ContentSafetySeverity) ||
      typeof rule.recommendedAction !== "string" ||
      !allowedActions.has(rule.recommendedAction as DecisionAction) ||
      typeof rule.pattern !== "string" ||
      rule.pattern.length === 0 ||
      rule.pattern.length > 1000
    ) {
      throw new Error(`Content safety rule at index ${index} is invalid.`);
    }

    ruleIds.add(rule.id);
    try {
      return {
        id: rule.id,
        category: rule.category as ContentSafetyCategory,
        severity: rule.severity as ContentSafetySeverity,
        recommendedAction: rule.recommendedAction as DecisionAction,
        pattern: new RegExp(rule.pattern, "i"),
      };
    } catch (error) {
      throw new Error(`Content safety rule "${rule.id}" has an invalid pattern.`, {
        cause: error,
      });
    }
  });

  return {
    version: config.version,
    analysisContextAction:
      config.analysisContextAction as DecisionAction,
    rules,
  };
}

export function detectContentSafety(
  content: string,
  policy: ContentSafetyPolicy,
  normalizationPolicy: NormalizationPolicy,
  decisionPolicy: DecisionPolicy,
): ContentSafetyResult {
  const normalized = normalizeText(content, normalizationPolicy);
  const findings = policy.rules
    .filter((rule) => rule.pattern.test(normalized.analysisText))
    .map(({ category, id, severity }) => ({
      category,
      ruleId: id,
      severity,
    }));

  const categoriesByName = new Map<
    ContentSafetyCategory,
    ContentSafetySeverity
  >();
  for (const finding of findings) {
    const existing = categoriesByName.get(finding.category);
    if (
      !existing ||
      severities.indexOf(finding.severity) > severities.indexOf(existing)
    ) {
      categoriesByName.set(finding.category, finding.severity);
    }
  }

  const context = analysisContextPattern.test(normalized.analysisText)
    ? "ANALYSIS"
    : "STANDARD";
  const actions = policy.rules
    .filter((rule) => findings.some((finding) => finding.ruleId === rule.id))
    .map((rule) =>
      context === "ANALYSIS" &&
      rule.category === "HARASSMENT" &&
      rule.recommendedAction === "SAFE_RESPONSE"
        ? policy.analysisContextAction
        : rule.recommendedAction,
    );
  const recommendedAction = evaluateDecision(
    {
      findings: actions.map((action, index) => ({
        control: `CONTENT_SAFETY_${index}`,
        recommendedAction: action,
      })),
    },
    decisionPolicy,
  );

  return {
    categories: [...categoriesByName.entries()].map(([name, severity]) => ({
      name,
      severity,
    })),
    recommendedAction,
    context,
    findings,
  };
}
