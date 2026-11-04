import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export type PiiAction = "ALLOW" | "MASK" | "BLOCK";

export interface PiiRule {
  id: string;
  category: string;
  action: PiiAction;
  pattern: RegExp;
}

interface PiiRulesFile {
  version: string;
  rules: Array<{
    id: string;
    category: string;
    action: string;
    pattern: string;
  }>;
}

interface PiiMatch {
  start: number;
  end: number;
  category: string;
  action: PiiAction;
  ruleId: string;
  value: string;
}

const actionPriority: Record<PiiAction, number> = {
  ALLOW: 0,
  MASK: 1,
  BLOCK: 2,
};

const categoryPriority: Record<string, number> = {
  GOVERNMENT_ID: 4,
  PAYMENT_CARD: 3,
  EMAIL_ADDRESS: 2,
  PHONE_NUMBER: 1,
};

function isPiiAction(value: string): value is PiiAction {
  return value === "ALLOW" || value === "MASK" || value === "BLOCK";
}

export function loadPiiRules(
  filePath = path.resolve(
    process.cwd(),
    process.env.PII_RULES_PATH ?? "config/pii-rules.yaml",
  ),
): PiiRule[] {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`PII rules could not be loaded from "${filePath}".`, {
      cause: error,
    });
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
    throw new Error("PII rules must define a version and at least one rule.");
  }

  const rulesFile = parsed as PiiRulesFile;
  return rulesFile.rules.map((rule, index) => {
    if (
      typeof rule !== "object" ||
      rule === null ||
      typeof rule.id !== "string" ||
      rule.id.trim().length === 0 ||
      typeof rule.category !== "string" ||
      rule.category.trim().length === 0 ||
      typeof rule.action !== "string" ||
      !isPiiAction(rule.action) ||
      typeof rule.pattern !== "string" ||
      rule.pattern.length === 0
    ) {
      throw new Error(`PII rule at index ${index} is invalid.`);
    }

    try {
      return {
        id: rule.id,
        category: rule.category,
        action: rule.action,
        pattern: new RegExp(rule.pattern, "gi"),
      };
    } catch (error) {
      throw new Error(`PII rule "${rule.id}" has an invalid pattern.`, {
        cause: error,
      });
    }
  });
}

function passesLuhn(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  let sum = 0;
  let doubleDigit = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (doubleDigit) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    doubleDigit = !doubleDigit;
  }

  return sum % 10 === 0;
}

function passesAadhaarChecksum(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  const multiplicationTable = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const permutationTable = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];
  let checksum = 0;

  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[digits.length - 1 - index]);
    checksum =
      multiplicationTable[checksum][permutationTable[index % 8][digit]];
  }

  return checksum === 0;
}

function collectMatches(content: string, rules: PiiRule[]): PiiMatch[] {
  const matches: PiiMatch[] = [];
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      const value = match[0];
      const start = match.index;
      if (start === undefined) {
        continue;
      }
      if (
        rule.category === "PAYMENT_CARD" &&
        !passesLuhn(value)
      ) {
        continue;
      }
      if (
        rule.id === "PII-AADHAAR-IN-001" &&
        !passesAadhaarChecksum(value)
      ) {
        continue;
      }

      matches.push({
        start,
        end: start + value.length,
        category: rule.category,
        action: rule.action,
        ruleId: rule.id,
        value,
      });
    }
  }

  matches.sort((left, right) => {
    const priorityDifference =
      (categoryPriority[right.category] ?? 0) -
      (categoryPriority[left.category] ?? 0);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    return right.end - left.end;
  });

  const nonOverlapping: PiiMatch[] = [];
  for (const candidate of matches) {
    if (
      nonOverlapping.some(
        (existing) =>
          candidate.start < existing.end && existing.start < candidate.end,
      )
    ) {
      continue;
    }
    nonOverlapping.push(candidate);
  }

  return nonOverlapping.sort((left, right) => left.start - right.start);
}

export interface PiiDetectionResult {
  matched: boolean;
  category: string | null;
  categories: string[];
  recommendedAction: PiiAction;
  sanitizedContent: string;
  findings: Array<{
    category: string;
    recommendedAction: PiiAction;
    ruleId: string;
    safeMetadata: { matchCount: number };
  }>;
}

export function detectPii(
  content: string,
  rules: PiiRule[],
): PiiDetectionResult {
  const matches = collectMatches(content, rules);
  const categories = [...new Set(matches.map((match) => match.category))];
  const recommendedAction = matches.reduce<PiiAction>(
    (action, match) =>
      actionPriority[match.action] > actionPriority[action]
        ? match.action
        : action,
    "ALLOW",
  );
  const findings = [...new Set(matches.map((match) => match.ruleId))].map(
    (ruleId) => {
      const ruleMatches = matches.filter((match) => match.ruleId === ruleId);
      return {
        category: ruleMatches[0].category,
        recommendedAction: ruleMatches[0].action,
        ruleId,
        safeMetadata: { matchCount: ruleMatches.length },
      };
    },
  );

  let sanitizedContent = "";
  let cursor = 0;
  for (const match of matches) {
    sanitizedContent += content.slice(cursor, match.start);
    sanitizedContent += `<${match.category}_MASKED>`;
    cursor = match.end;
  }
  sanitizedContent += content.slice(cursor);

  return {
    matched: matches.length > 0,
    category: categories[0] ?? null,
    categories,
    recommendedAction,
    sanitizedContent,
    findings,
  };
}
