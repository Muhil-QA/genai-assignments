import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export interface NormalizationPolicy {
  version: string;
  maximumEncodedPayloadBytes: number;
  maximumEncodedCandidates: number;
  minimumBase64Characters: number;
  minimumHexCharacters: number;
}

interface NormalizationPolicyFile {
  version: string;
  maximumEncodedPayloadBytes: number;
  maximumEncodedCandidates: number;
  minimumBase64Characters: number;
  minimumHexCharacters: number;
}

export function loadNormalizationPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.NORMALIZATION_POLICY_PATH ??
      "config/normalization-policy.yaml",
  ),
): NormalizationPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Normalization policy could not be loaded from "${filePath}".`,
      { cause: error },
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Normalization policy must be an object.");
  }

  const policy = parsed as Partial<NormalizationPolicyFile>;
  const positiveInteger = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0;

  if (
    typeof policy.version !== "string" ||
    policy.version.trim().length === 0 ||
    !positiveInteger(policy.maximumEncodedPayloadBytes) ||
    !positiveInteger(policy.maximumEncodedCandidates) ||
    !positiveInteger(policy.minimumBase64Characters) ||
    !positiveInteger(policy.minimumHexCharacters)
  ) {
    throw new Error("Normalization policy contains invalid values.");
  }

  return {
    version: policy.version,
    maximumEncodedPayloadBytes: policy.maximumEncodedPayloadBytes,
    maximumEncodedCandidates: policy.maximumEncodedCandidates,
    minimumBase64Characters: policy.minimumBase64Characters,
    minimumHexCharacters: policy.minimumHexCharacters,
  };
}

export interface NormalizationMetadata {
  unicodeNormalized: boolean;
  zeroWidthRemoved: number;
  suspiciousEncodingDetected: boolean;
  encodedPayloadsChecked: number;
  encodedPayloadsSkipped: number;
  locale: string | null;
  languageSpecificRulesApplied: false;
}

export interface NormalizedText {
  normalizedContent: string;
  analysisText: string;
  metadata: NormalizationMetadata;
}

const zeroWidthCharacters = /[\u00ad\u034f\u061c\u115f-\u1160\u17b4-\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;
const suspiciousDecodedContent =
  /\b(?:ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions?|reveal\s+(?:the\s+)?(?:system|hidden)\s+prompt|bypass\s+(?:safety|restrictions?)|disable\s+(?:safety|guardrails?))\b/i;

function decodeCandidate(candidate: string, encoding: "base64" | "hex"): string {
  try {
    const bytes =
      encoding === "base64"
        ? Buffer.from(candidate, "base64")
        : Buffer.from(candidate, "hex");
    return bytes.toString("utf8");
  } catch {
    return "";
  }
}

function inspectEncodedCandidates(
  content: string,
  policy: NormalizationPolicy,
): Pick<
  NormalizationMetadata,
  | "suspiciousEncodingDetected"
  | "encodedPayloadsChecked"
  | "encodedPayloadsSkipped"
> {
  const candidates: Array<{ value: string; encoding: "base64" | "hex" }> = [];
  const patterns: Array<{
    pattern: RegExp;
    encoding: "base64" | "hex";
    minimumLength: number;
  }> = [
    {
      pattern: new RegExp(
        `(?:data:[^,\\s]{1,128};base64,)?[A-Za-z0-9+/_-]{${Math.min(policy.minimumBase64Characters, 32)},}={0,2}`,
        "g",
      ),
      encoding: "base64",
      minimumLength: policy.minimumBase64Characters,
    },
    {
      pattern: new RegExp(
        `\\b(?:[A-Fa-f0-9]{2}){${Math.min(Math.ceil(policy.minimumHexCharacters / 2), 16)},}\\b`,
        "g",
      ),
      encoding: "hex",
      minimumLength: policy.minimumHexCharacters,
    },
  ];

  for (const { pattern, encoding, minimumLength } of patterns) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const value = match[0].replace(/^data:[^,]+;base64,/i, "");
      if (value.length >= minimumLength) {
        candidates.push({ value, encoding });
      }
    }
  }

  let suspiciousEncodingDetected = false;
  let encodedPayloadsChecked = 0;
  let encodedPayloadsSkipped = 0;

  for (const candidate of candidates) {
    const payloadBytes =
      candidate.encoding === "hex"
        ? Math.floor(candidate.value.length / 2)
        : Math.floor((candidate.value.replace(/=+$/, "").length * 3) / 4);

    if (
      encodedPayloadsChecked + encodedPayloadsSkipped >=
        policy.maximumEncodedCandidates ||
      payloadBytes > policy.maximumEncodedPayloadBytes
    ) {
      encodedPayloadsSkipped += 1;
      suspiciousEncodingDetected = true;
      continue;
    }

    encodedPayloadsChecked += 1;
    const decoded = decodeCandidate(candidate.value, candidate.encoding)
      .replace(zeroWidthCharacters, "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();

    if (suspiciousDecodedContent.test(decoded)) {
      suspiciousEncodingDetected = true;
    }
  }

  return {
    suspiciousEncodingDetected,
    encodedPayloadsChecked,
    encodedPayloadsSkipped,
  };
}

export function normalizeText(
  content: string,
  policy: NormalizationPolicy,
  locale?: string,
): NormalizedText {
  const unicodeNormalizedContent = content.normalize("NFKC");
  const withoutZeroWidth = unicodeNormalizedContent.replace(
    zeroWidthCharacters,
    "",
  );
  const zeroWidthRemoved =
    [...unicodeNormalizedContent].length - [...withoutZeroWidth].length;
  const normalizedContent = withoutZeroWidth
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  const encodingMetadata = inspectEncodedCandidates(
    withoutZeroWidth,
    policy,
  );

  return {
    normalizedContent,
    analysisText: normalizedContent.toLowerCase(),
    metadata: {
      unicodeNormalized: unicodeNormalizedContent !== content,
      zeroWidthRemoved,
      ...encodingMetadata,
      locale: locale ?? null,
      languageSpecificRulesApplied: false,
    },
  };
}
