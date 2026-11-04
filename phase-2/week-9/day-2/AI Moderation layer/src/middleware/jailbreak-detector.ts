import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export interface JailbreakRule {
  id: string;
  weight: number;
  pattern: RegExp;
}

export interface JailbreakPolicy {
  version: string;
  warnThreshold: number;
  blockThreshold: number;
  maximumRiskScore: number;
  repeatWindowMs: number;
  repeatRiskPoints: number;
  maximumTrackedFingerprints: number;
  rules: JailbreakRule[];
}

interface JailbreakRulesFile {
  version: string;
  warnThreshold: number;
  blockThreshold: number;
  maximumRiskScore: number;
  repeatWindowMs: number;
  repeatRiskPoints: number;
  maximumTrackedFingerprints: number;
  rules: Array<{
    id: string;
    weight: number;
    pattern: string;
  }>;
}

export function loadJailbreakPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.JAILBREAK_RULES_PATH ?? "config/jailbreak-rules.yaml",
  ),
): JailbreakPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Jailbreak rules could not be loaded from "${filePath}".`, {
      cause: error,
    });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Jailbreak rules configuration must be an object.");
  }

  const config = parsed as Partial<JailbreakRulesFile>;
  const validScore = (score: unknown): score is number =>
    typeof score === "number" &&
    Number.isInteger(score) &&
    score >= 0 &&
    score <= 100;
  const validPositiveInteger = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0;

  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    !validScore(config.warnThreshold) ||
    !validScore(config.blockThreshold) ||
    !validScore(config.maximumRiskScore) ||
    config.warnThreshold > config.blockThreshold ||
    config.blockThreshold > config.maximumRiskScore ||
    !validPositiveInteger(config.repeatWindowMs) ||
    !validScore(config.repeatRiskPoints) ||
    config.repeatRiskPoints === 0 ||
    !validPositiveInteger(config.maximumTrackedFingerprints) ||
    !Array.isArray(config.rules) ||
    config.rules.length === 0
  ) {
    throw new Error("Jailbreak rules configuration contains invalid values.");
  }

  const ruleIds = new Set<string>();
  const rules = config.rules.map((rule, index): JailbreakRule => {
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
      throw new Error(`Jailbreak rule at index ${index} is invalid.`);
    }

    ruleIds.add(rule.id);
    try {
      return {
        id: rule.id,
        weight: rule.weight,
        pattern: new RegExp(rule.pattern, "i"),
      };
    } catch (error) {
      throw new Error(`Jailbreak rule "${rule.id}" has an invalid pattern.`, {
        cause: error,
      });
    }
  });

  return {
    version: config.version,
    warnThreshold: config.warnThreshold,
    blockThreshold: config.blockThreshold,
    maximumRiskScore: config.maximumRiskScore,
    repeatWindowMs: config.repeatWindowMs,
    repeatRiskPoints: config.repeatRiskPoints,
    maximumTrackedFingerprints: config.maximumTrackedFingerprints,
    rules,
  };
}

interface RepeatFingerprint {
  occurrences: number;
  expiresAt: number;
}

export interface JailbreakDetectionResult {
  matched: boolean;
  riskScore: number;
  recommendedAction: "ALLOW" | "WARN" | "BLOCK";
  findings: Array<{ ruleId: string; weight: number }>;
  repeatCount: number;
  repeatRiskPoints: number;
  warnThreshold: number;
  blockThreshold: number;
}

export function createJailbreakDetector(policy: JailbreakPolicy) {
  const fingerprints = new Map<string, RepeatFingerprint>();

  return function detectJailbreak(
    content: string,
    subject: string,
    now = Date.now(),
  ): JailbreakDetectionResult {
    for (const [key, fingerprint] of fingerprints) {
      if (fingerprint.expiresAt <= now) {
        fingerprints.delete(key);
      }
    }

    const findings = policy.rules
      .filter((rule) => rule.pattern.test(content))
      .map(({ id, weight }) => ({ ruleId: id, weight }));
    const baseScore = Math.min(
      policy.maximumRiskScore,
      findings.reduce((total, finding) => total + finding.weight, 0),
    );
    let repeatCount = 0;
    let repeatRiskPoints = 0;

    if (baseScore > 0) {
      const contentHash = createHash("sha256")
        .update(content.normalize("NFKC").trim().toLowerCase())
        .digest("hex");
      const subjectHash = createHash("sha256").update(subject).digest("hex");
      const key = `${subjectHash}:${contentHash}`;
      const existing = fingerprints.get(key);

      if (existing) {
        existing.occurrences += 1;
        existing.expiresAt = now + policy.repeatWindowMs;
        repeatCount = existing.occurrences - 1;
        repeatRiskPoints = Math.min(
          policy.maximumRiskScore,
          repeatCount * policy.repeatRiskPoints,
        );
      } else {
        if (fingerprints.size >= policy.maximumTrackedFingerprints) {
          throw new Error("Jailbreak repeat tracking capacity reached.");
        }
        fingerprints.set(key, {
          occurrences: 1,
          expiresAt: now + policy.repeatWindowMs,
        });
      }
    }

    const riskScore = Math.min(
      policy.maximumRiskScore,
      baseScore + repeatRiskPoints,
    );
    const recommendedAction =
      riskScore >= policy.blockThreshold
        ? "BLOCK"
        : riskScore >= policy.warnThreshold
          ? "WARN"
          : "ALLOW";

    return {
      matched: baseScore > 0,
      riskScore,
      recommendedAction,
      findings,
      repeatCount,
      repeatRiskPoints,
      warnThreshold: policy.warnThreshold,
      blockThreshold: policy.blockThreshold,
    };
  };
}
