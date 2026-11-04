import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export interface SecretRule {
  id: string;
  category: string;
  pattern: RegExp;
}

interface SecretRulesFile {
  version: string;
  rules: Array<{
    id: string;
    category: string;
    pattern: string;
  }>;
}

export interface SecretDetectionResult {
  matched: boolean;
  category: string | null;
  recommendedAction: "BLOCK" | "ALLOW";
  ruleId: string | null;
}

export function loadSecretRules(
  filePath = path.resolve(
    process.cwd(),
    process.env.SECRET_RULES_PATH ?? "config/secret-rules.yaml",
  ),
): SecretRule[] {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Secret rules could not be loaded from "${filePath}".`,
      { cause: error },
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    typeof parsed.version !== "string" ||
    parsed.version.trim().length === 0 ||
    !("rules" in parsed) ||
    !Array.isArray(parsed.rules) ||
    parsed.rules.length === 0
  ) {
    throw new Error("Secret rules must define a version and at least one rule.");
  }

  const rulesFile = parsed as SecretRulesFile;
  return rulesFile.rules.map((rule, index) => {
    if (
      typeof rule !== "object" ||
      rule === null ||
      typeof rule.id !== "string" ||
      rule.id.trim().length === 0 ||
      typeof rule.category !== "string" ||
      rule.category.trim().length === 0 ||
      typeof rule.pattern !== "string" ||
      rule.pattern.length === 0
    ) {
      throw new Error(`Secret rule at index ${index} is invalid.`);
    }

    try {
      return {
        id: rule.id,
        category: rule.category,
        pattern: new RegExp(rule.pattern, "i"),
      };
    } catch (error) {
      throw new Error(`Secret rule "${rule.id}" has an invalid pattern.`, {
        cause: error,
      });
    }
  });
}

export function detectSecret(
  content: string,
  rules: SecretRule[],
): SecretDetectionResult {
  const matchingRule = rules.find((rule) => rule.pattern.test(content));
  if (!matchingRule) {
    return {
      matched: false,
      category: null,
      recommendedAction: "ALLOW",
      ruleId: null,
    };
  }

  return {
    matched: true,
    category: matchingRule.category,
    recommendedAction: "BLOCK",
    ruleId: matchingRule.id,
  };
}
