import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export type Classification =
  | "PUBLIC"
  | "INTERNAL"
  | "CONFIDENTIAL"
  | "RESTRICTED";
export type ConfidentialAction = "ALLOW" | "WARN" | "MASK" | "BLOCK";

export interface ClassificationPolicy {
  name: Classification;
  action: ConfidentialAction;
  ruleId: string;
  marker: RegExp;
}

export interface ConfidentialPolicy {
  version: string;
  defaultClassification: Classification;
  classifications: ClassificationPolicy[];
}

interface ConfidentialRulesFile {
  version: string;
  defaultClassification: string;
  classifications: Array<{
    name: string;
    action: string;
    ruleId: string;
  }>;
}

const classificationOrder: Classification[] = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
];
const allowedActions: ConfidentialAction[] = [
  "ALLOW",
  "WARN",
  "MASK",
  "BLOCK",
];

function isClassification(value: string): value is Classification {
  return classificationOrder.includes(value as Classification);
}

function createMarkerPattern(name: Classification): RegExp {
  return new RegExp(
    `(?:\\[${name}\\]|^\\s*CLASSIFICATION\\s*:\\s*${name}\\s*$)`,
    "gim",
  );
}

export function loadConfidentialPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.CONFIDENTIAL_RULES_PATH ??
      "config/confidential-rules.yaml",
  ),
): ConfidentialPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Confidential rules could not be loaded from "${filePath}".`,
      { cause: error },
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    typeof parsed.version !== "string" ||
    parsed.version.trim().length === 0 ||
    !("defaultClassification" in parsed) ||
    typeof parsed.defaultClassification !== "string" ||
    !isClassification(parsed.defaultClassification) ||
    !("classifications" in parsed) ||
    !Array.isArray(parsed.classifications)
  ) {
    throw new Error("Confidential rules configuration is invalid.");
  }

  const config = parsed as ConfidentialRulesFile;
  if (!isClassification(config.defaultClassification)) {
    throw new Error(
      "Confidential rules must define a supported default classification.",
    );
  }

  const policies = new Map<Classification, ClassificationPolicy>();
  for (const [index, entry] of config.classifications.entries()) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.name !== "string" ||
      !isClassification(entry.name) ||
      typeof entry.action !== "string" ||
      !allowedActions.includes(entry.action as ConfidentialAction) ||
      typeof entry.ruleId !== "string" ||
      entry.ruleId.trim().length === 0 ||
      policies.has(entry.name)
    ) {
      throw new Error(`Confidential classification at index ${index} is invalid.`);
    }

    policies.set(entry.name, {
      name: entry.name,
      action: entry.action as ConfidentialAction,
      ruleId: entry.ruleId,
      marker: createMarkerPattern(entry.name),
    });
  }

  if (classificationOrder.some((name) => !policies.has(name))) {
    throw new Error(
      "Confidential rules must define every supported classification.",
    );
  }

  const orderedPolicies = classificationOrder.map((name) => {
    const classification = policies.get(name);
    if (!classification) {
      throw new Error(
        `Confidential rules are missing the ${name} classification.`,
      );
    }
    return classification;
  });

  return {
    version: config.version,
    defaultClassification: config.defaultClassification,
    classifications: orderedPolicies,
  };
}

export interface ConfidentialDetectionResult {
  matched: boolean;
  classification: Classification;
  recommendedAction: ConfidentialAction;
  ruleId: string;
}

export function detectConfidential(
  content: string,
  policy: ConfidentialPolicy,
): ConfidentialDetectionResult {
  const detected = policy.classifications.filter((classification) => {
    classification.marker.lastIndex = 0;
    return classification.marker.test(content);
  });
  const classification =
    detected.sort(
      (left, right) =>
        classificationOrder.indexOf(right.name) -
        classificationOrder.indexOf(left.name),
    )[0] ??
    policy.classifications.find(
      (entry) => entry.name === policy.defaultClassification,
    );

  if (!classification) {
    throw new Error("Default confidentiality policy is unavailable.");
  }

  return {
    matched: detected.length > 0,
    classification: classification.name,
    recommendedAction: classification.action,
    ruleId: classification.ruleId,
  };
}
