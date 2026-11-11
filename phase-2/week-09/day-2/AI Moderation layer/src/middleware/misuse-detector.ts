import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import {
  DecisionAction,
  DecisionPolicy,
  evaluateDecision,
} from "./decision-engine";
import { NormalizationPolicy, normalizeText } from "./text-normalizer";

export type MisuseCategory = "FRAUD" | "ILLEGAL_ACTIVITY" | "CYBER_MISUSE";
export type MisuseIntent = "DEFENSIVE" | "AMBIGUOUS" | "MALICIOUS";
export type MisuseCapability =
  | "RECOGNITION"
  | "DECEPTION"
  | "UNAUTHORIZED_ACCESS"
  | "EVASION"
  | "ACCESS";
export type MisuseOperationalDetail = "GENERAL" | "OPERATIONAL";
export type MisuseAuthorizationContext =
  | "AUTHORIZED_OR_NOT_APPLICABLE"
  | "UNCLEAR"
  | "UNAUTHORIZED";
export type MisusePotentialHarm = "LOW" | "MEDIUM" | "HIGH";

export interface MisuseRule {
  id: string;
  category: MisuseCategory;
  intent: MisuseIntent;
  requestedCapability: MisuseCapability;
  operationalDetail: MisuseOperationalDetail;
  authorizationContext: MisuseAuthorizationContext;
  potentialHarm: MisusePotentialHarm;
  recommendedAction: DecisionAction;
  pattern: RegExp;
}

export interface MisusePolicy {
  version: string;
  rules: MisuseRule[];
}

interface MisusePolicyFile {
  version: string;
  rules: Array<{
    id: string;
    category: string;
    intent: string;
    requestedCapability: string;
    operationalDetail: string;
    authorizationContext: string;
    potentialHarm: string;
    recommendedAction: string;
    pattern: string;
  }>;
}

export interface MisuseFinding {
  category: MisuseCategory;
  ruleId: string;
  intent: MisuseIntent;
  requestedCapability: MisuseCapability;
  operationalDetail: MisuseOperationalDetail;
  authorizationContext: MisuseAuthorizationContext;
  potentialHarm: MisusePotentialHarm;
}

export interface MisuseDetectionResult {
  categories: MisuseCategory[];
  assessment: {
    intent: MisuseIntent;
    requestedCapability: MisuseCapability;
    operationalDetail: MisuseOperationalDetail;
    authorizationContext: MisuseAuthorizationContext;
    potentialHarm: MisusePotentialHarm;
  };
  recommendedAction: DecisionAction;
  findings: MisuseFinding[];
}

const categoryValues: MisuseCategory[] = [
  "FRAUD",
  "ILLEGAL_ACTIVITY",
  "CYBER_MISUSE",
];
const intentValues: MisuseIntent[] = ["DEFENSIVE", "AMBIGUOUS", "MALICIOUS"];
const capabilityValues: MisuseCapability[] = [
  "RECOGNITION",
  "DECEPTION",
  "UNAUTHORIZED_ACCESS",
  "EVASION",
  "ACCESS",
];
const operationalDetailValues: MisuseOperationalDetail[] = [
  "GENERAL",
  "OPERATIONAL",
];
const authorizationValues: MisuseAuthorizationContext[] = [
  "AUTHORIZED_OR_NOT_APPLICABLE",
  "UNCLEAR",
  "UNAUTHORIZED",
];
const harmValues: MisusePotentialHarm[] = ["LOW", "MEDIUM", "HIGH"];
const actionValues = new Set<DecisionAction>([
  "ALLOW",
  "WARN",
  "SAFE_RESPONSE",
  "ESCALATE",
  "BLOCK",
]);
const identifierPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const maximumRules = 100;

export function loadMisusePolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.MISUSE_DETECTION_POLICY_PATH ??
      "config/misuse-detection.yaml",
  ),
): MisusePolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Misuse detection policy could not be loaded from "${filePath}".`, {
      cause: error,
    });
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Misuse detection policy must be an object.");
  }

  const config = parsed as Partial<MisusePolicyFile>;
  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    !Array.isArray(config.rules) ||
    config.rules.length === 0 ||
    config.rules.length > maximumRules
  ) {
    throw new Error("Misuse detection policy contains invalid values.");
  }

  const ids = new Set<string>();
  const rules = config.rules.map((rule, index): MisuseRule => {
    if (
      typeof rule !== "object" ||
      rule === null ||
      typeof rule.id !== "string" ||
      !identifierPattern.test(rule.id) ||
      ids.has(rule.id) ||
      typeof rule.category !== "string" ||
      !categoryValues.includes(rule.category as MisuseCategory) ||
      typeof rule.intent !== "string" ||
      !intentValues.includes(rule.intent as MisuseIntent) ||
      typeof rule.requestedCapability !== "string" ||
      !capabilityValues.includes(
        rule.requestedCapability as MisuseCapability,
      ) ||
      typeof rule.operationalDetail !== "string" ||
      !operationalDetailValues.includes(
        rule.operationalDetail as MisuseOperationalDetail,
      ) ||
      typeof rule.authorizationContext !== "string" ||
      !authorizationValues.includes(
        rule.authorizationContext as MisuseAuthorizationContext,
      ) ||
      typeof rule.potentialHarm !== "string" ||
      !harmValues.includes(rule.potentialHarm as MisusePotentialHarm) ||
      typeof rule.recommendedAction !== "string" ||
      !actionValues.has(rule.recommendedAction as DecisionAction) ||
      typeof rule.pattern !== "string" ||
      rule.pattern.length === 0 ||
      rule.pattern.length > 1000
    ) {
      throw new Error(`Misuse detection rule at index ${index} is invalid.`);
    }

    ids.add(rule.id);
    try {
      return {
        id: rule.id,
        category: rule.category as MisuseCategory,
        intent: rule.intent as MisuseIntent,
        requestedCapability: rule.requestedCapability as MisuseCapability,
        operationalDetail: rule.operationalDetail as MisuseOperationalDetail,
        authorizationContext:
          rule.authorizationContext as MisuseAuthorizationContext,
        potentialHarm: rule.potentialHarm as MisusePotentialHarm,
        recommendedAction: rule.recommendedAction as DecisionAction,
        pattern: new RegExp(rule.pattern, "i"),
      };
    } catch (error) {
      throw new Error(`Misuse detection rule "${rule.id}" has an invalid pattern.`, {
        cause: error,
      });
    }
  });

  return { version: config.version, rules };
}

const severityOrder: Record<MisusePotentialHarm, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
};
const intentOrder: Record<MisuseIntent, number> = {
  DEFENSIVE: 0,
  AMBIGUOUS: 1,
  MALICIOUS: 2,
};
const detailOrder: Record<MisuseOperationalDetail, number> = {
  GENERAL: 0,
  OPERATIONAL: 1,
};
const authorizationOrder: Record<MisuseAuthorizationContext, number> = {
  AUTHORIZED_OR_NOT_APPLICABLE: 0,
  UNCLEAR: 1,
  UNAUTHORIZED: 2,
};
const capabilityOrder: Record<MisuseCapability, number> = {
  RECOGNITION: 0,
  ACCESS: 1,
  DECEPTION: 2,
  UNAUTHORIZED_ACCESS: 3,
  EVASION: 4,
};

function highest<T extends string>(
  values: T[],
  order: Record<T, number>,
  fallback: T,
): T {
  return values.reduce(
    (current, value) => (order[value] > order[current] ? value : current),
    fallback,
  );
}

export function detectMisuse(
  content: string,
  policy: MisusePolicy,
  normalizationPolicy: NormalizationPolicy,
  decisionPolicy: DecisionPolicy,
): MisuseDetectionResult {
  const normalized = normalizeText(content, normalizationPolicy);
  const matchedRules = policy.rules.filter((rule) =>
    rule.pattern.test(normalized.analysisText),
  );
  const findings = matchedRules.map((rule) => ({
    category: rule.category,
    ruleId: rule.id,
    intent: rule.intent,
    requestedCapability: rule.requestedCapability,
    operationalDetail: rule.operationalDetail,
    authorizationContext: rule.authorizationContext,
    potentialHarm: rule.potentialHarm,
  }));
  const recommendedAction = evaluateDecision(
    {
      findings: matchedRules.map((rule, index) => ({
        control: `MISUSE_${index}`,
        recommendedAction: rule.recommendedAction,
      })),
    },
    decisionPolicy,
  );
  const dimensions = {
    intent: highest(
      findings.map((finding) => finding.intent),
      intentOrder,
      "DEFENSIVE",
    ),
    requestedCapability: highest(
      findings.map((finding) => finding.requestedCapability),
      capabilityOrder,
      "RECOGNITION",
    ),
    operationalDetail: highest(
      findings.map((finding) => finding.operationalDetail),
      detailOrder,
      "GENERAL",
    ),
    authorizationContext: highest(
      findings.map((finding) => finding.authorizationContext),
      authorizationOrder,
      "AUTHORIZED_OR_NOT_APPLICABLE",
    ),
    potentialHarm: highest(
      findings.map((finding) => finding.potentialHarm),
      severityOrder,
      "LOW",
    ),
  };

  return {
    categories: [...new Set(findings.map((finding) => finding.category))],
    assessment: dimensions,
    recommendedAction,
    findings,
  };
}
