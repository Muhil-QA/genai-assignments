import { readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import YAML from "yaml";
import { SecretRule, loadSecretRules } from "./middleware/secret-detector";
import { loadResourceLimits, ResourceLimits } from "./middleware/resource-limits";
import { loadPiiRules, PiiRule } from "./middleware/pii-detector";
import {
  ConfidentialPolicy,
  loadConfidentialPolicy,
} from "./middleware/confidential-detector";
import {
  InjectionPolicy,
  loadInjectionPolicy,
} from "./middleware/injection-detector";
import {
  JailbreakPolicy,
  loadJailbreakPolicy,
} from "./middleware/jailbreak-detector";
import {
  loadNormalizationPolicy,
  NormalizationPolicy,
} from "./middleware/text-normalizer";
import { loadRagDocuments, RagDocument } from "./middleware/rag-authorization";
import {
  loadToolActionPolicy,
  ToolActionPolicyConfig,
} from "./middleware/tool-action-validator";
import {
  DecisionPolicy,
  loadDecisionPolicy,
} from "./middleware/decision-engine";
import {
  loadOutputValidationPolicy,
  OutputValidationPolicy,
} from "./middleware/output-schema-validator";
import {
  ContentSafetyPolicy,
  loadContentSafetyPolicy,
} from "./middleware/content-safety-detector";
import { loadMisusePolicy, MisusePolicy } from "./middleware/misuse-detector";
import {
  HarmfulContentPolicy,
  loadHarmfulContentPolicy,
} from "./middleware/harmful-content-detector";
import {
  loadViolenceThreatPolicy,
  ViolenceThreatPolicy,
} from "./middleware/violence-threats-detector";
import {
  loadSexualSafetyPolicy,
  SexualSafetyPolicy,
} from "./middleware/sexual-safety-detector";
import { loadSelfHarmPolicy, SelfHarmPolicy } from "./middleware/self-harm-detector";

dotenv.config();

export type ReadinessState =
  | { status: "READY"; policyVersion: string }
  | { status: "NOT_READY"; reason: string };

export interface StartupConfig {
  port: number;
  readiness: ReadinessState;
  authentication: AuthenticationConfig;
  secretRules: SecretRule[];
  resourceLimits: ResourceLimits;
  piiRules: PiiRule[];
  confidentialPolicy: ConfidentialPolicy;
  injectionPolicy: InjectionPolicy;
  jailbreakPolicy: JailbreakPolicy;
  normalizationPolicy: NormalizationPolicy;
  ragDocuments: RagDocument[];
  toolActionPolicy: ToolActionPolicyConfig;
  decisionPolicy: DecisionPolicy;
  outputValidationPolicy: OutputValidationPolicy;
  contentSafetyPolicy: ContentSafetyPolicy;
  misusePolicy: MisusePolicy;
  harmfulContentPolicy: HarmfulContentPolicy;
  violenceThreatPolicy: ViolenceThreatPolicy;
  sexualSafetyPolicy: SexualSafetyPolicy;
  selfHarmPolicy: SelfHarmPolicy;
}

export type AuthenticationConfig =
  | { mode: "local"; secret: Uint8Array }
  | { mode: "oidc"; issuer: string; audience: string; jwksUrl: URL };

function loadAuthenticationConfig(): AuthenticationConfig {
  const mode = process.env.AUTH_MODE ?? "local";

  if (mode === "local") {
    const secret = process.env.DEV_JWT_SECRET;
    if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error(
        "DEV_JWT_SECRET must contain at least 32 bytes when AUTH_MODE=local.",
      );
    }

    return { mode, secret: Buffer.from(secret, "utf8") };
  }

  if (mode === "oidc") {
    const issuer = process.env.OIDC_ISSUER;
    const audience = process.env.OIDC_AUDIENCE;
    const rawJwksUrl = process.env.OIDC_JWKS_URL;
    if (!issuer || !audience || !rawJwksUrl) {
      throw new Error(
        "OIDC_ISSUER, OIDC_AUDIENCE, and OIDC_JWKS_URL are required when AUTH_MODE=oidc.",
      );
    }

    let jwksUrl: URL;
    try {
      jwksUrl = new URL(rawJwksUrl);
    } catch {
      throw new Error("OIDC_JWKS_URL must be a valid URL.");
    }

    if (jwksUrl.protocol !== "https:") {
      throw new Error("OIDC_JWKS_URL must use HTTPS.");
    }

    return { mode, issuer, audience, jwksUrl };
  }

  throw new Error("AUTH_MODE must be either local or oidc.");
}

export function loadPolicyConfig(filePath: string): ReadinessState {
  try {
    const policy = YAML.parse(readFileSync(filePath, "utf8")) as unknown;
    if (
      typeof policy !== "object" ||
      policy === null ||
      !("version" in policy) ||
      typeof policy.version !== "string" ||
      policy.version.trim().length === 0
    ) {
      return {
        status: "NOT_READY",
        reason: "Policy configuration must define a non-empty version.",
      };
    }

    return { status: "READY", policyVersion: policy.version };
  } catch (error) {
    return {
      status: "NOT_READY",
      reason:
        error instanceof Error
          ? error.message
          : "Policy configuration could not be loaded.",
    };
  }
}

export function loadStartupConfig(): StartupConfig {
  const rawPort = process.env.PORT ?? "3000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const policyPath = path.resolve(
    process.cwd(),
    process.env.POLICY_CONFIG_PATH ?? "config/moderation-policy.yaml",
  );

  return {
    port,
    readiness: loadPolicyConfig(policyPath),
    authentication: loadAuthenticationConfig(),
    secretRules: loadSecretRules(),
    resourceLimits: loadResourceLimits(),
    piiRules: loadPiiRules(),
    confidentialPolicy: loadConfidentialPolicy(),
    injectionPolicy: loadInjectionPolicy(),
    jailbreakPolicy: loadJailbreakPolicy(),
    normalizationPolicy: loadNormalizationPolicy(),
    ragDocuments: loadRagDocuments(),
    toolActionPolicy: loadToolActionPolicy(),
    decisionPolicy: loadDecisionPolicy(),
    outputValidationPolicy: loadOutputValidationPolicy(),
    contentSafetyPolicy: loadContentSafetyPolicy(),
    misusePolicy: loadMisusePolicy(),
    harmfulContentPolicy: loadHarmfulContentPolicy(),
    violenceThreatPolicy: loadViolenceThreatPolicy(),
    sexualSafetyPolicy: loadSexualSafetyPolicy(),
    selfHarmPolicy: loadSelfHarmPolicy(),
  };
}
