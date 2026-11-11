import Ajv, { ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";

export interface OutputSchema {
  schemaId: string;
  validate: ValidateFunction;
}

export interface CodeValidationPolicy {
  maximumCodeLength: number;
  forbiddenPatterns: RegExp[];
  allowedDependencies: Set<string>;
}

export interface OutputValidationPolicy {
  version: string;
  schemas: Map<string, OutputSchema>;
  codeValidation: CodeValidationPolicy;
}

export type OutputValidationRequest =
  | { outputType: "json"; schemaId: string; output: unknown }
  | { outputType: "code"; code: string; dependencies: string[] };

export interface OutputValidationResult {
  valid: boolean;
  decision: "ALLOW" | "BLOCK";
  safe: boolean;
  errors: string[];
}

interface OutputValidationFile {
  version: string;
  schemas: Array<{
    schemaId: string;
    schema: unknown;
  }>;
  codeValidation: {
    maximumCodeLength: number;
    forbiddenPatterns: string[];
    allowedDependencies: string[];
  };
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const maximumSchemas = 100;
const maximumDependencies = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function loadOutputValidationPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.OUTPUT_VALIDATION_PATH ?? "config/output-validation.yaml",
  ),
): OutputValidationPolicy {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Output validation policy could not be loaded from "${filePath}".`,
      { cause: error },
    );
  }

  if (!isRecord(parsed)) {
    throw new Error("Output validation policy must be an object.");
  }

  const config = parsed as Partial<OutputValidationFile>;
  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    !Array.isArray(config.schemas) ||
    config.schemas.length === 0 ||
    config.schemas.length > maximumSchemas ||
    !isRecord(config.codeValidation)
  ) {
    throw new Error("Output validation policy contains invalid values.");
  }

  const { maximumCodeLength, forbiddenPatterns, allowedDependencies } =
    config.codeValidation;
  if (
    !isPositiveInteger(maximumCodeLength) ||
    maximumCodeLength > 100_000 ||
    !Array.isArray(forbiddenPatterns) ||
    forbiddenPatterns.length === 0 ||
    !forbiddenPatterns.every(
      (pattern) => typeof pattern === "string" && pattern.length > 0,
    ) ||
    !Array.isArray(allowedDependencies) ||
    !allowedDependencies.every(
      (dependency) =>
        typeof dependency === "string" &&
        dependency.length > 0 &&
        dependency.length <= 214,
    ) ||
    new Set(allowedDependencies).size !== allowedDependencies.length
  ) {
    throw new Error("Output code validation policy contains invalid values.");
  }

  const ajv = new Ajv({ allErrors: true, strict: true });
  const schemas = new Map<string, OutputSchema>();
  for (const [index, entry] of config.schemas.entries()) {
    if (
      !isRecord(entry) ||
      typeof entry.schemaId !== "string" ||
      !identifierPattern.test(entry.schemaId) ||
      schemas.has(entry.schemaId) ||
      !isRecord(entry.schema)
    ) {
      throw new Error(`Output schema at index ${index} is invalid.`);
    }

    try {
      schemas.set(entry.schemaId, {
        schemaId: entry.schemaId,
        validate: ajv.compile(entry.schema),
      });
    } catch (error) {
      throw new Error(
        `Output schema "${entry.schemaId}" could not be compiled.`,
        { cause: error },
      );
    }
  }

  const compiledPatterns = forbiddenPatterns.map((pattern, index) => {
    try {
      return new RegExp(pattern, "i");
    } catch (error) {
      throw new Error(
        `Forbidden code pattern at index ${index} is invalid.`,
        { cause: error },
      );
    }
  });

  return {
    version: config.version,
    schemas,
    codeValidation: {
      maximumCodeLength,
      forbiddenPatterns: compiledPatterns,
      allowedDependencies: new Set(allowedDependencies),
    },
  };
}

export function validateOutputRequest(
  body: unknown,
): OutputValidationRequest | null {
  if (!isRecord(body) || typeof body.outputType !== "string") {
    return null;
  }

  if (body.outputType === "json") {
    if (
      Object.keys(body).length !== 3 ||
      !Object.hasOwn(body, "schemaId") ||
      !Object.hasOwn(body, "output") ||
      typeof body.schemaId !== "string" ||
      !identifierPattern.test(body.schemaId)
    ) {
      return null;
    }

    return {
      outputType: "json",
      schemaId: body.schemaId,
      output: body.output,
    };
  }

  if (body.outputType === "code") {
    if (
      Object.keys(body).length !== 3 ||
      !Object.hasOwn(body, "code") ||
      !Object.hasOwn(body, "dependencies") ||
      typeof body.code !== "string" ||
      body.code.trim().length === 0 ||
      !Array.isArray(body.dependencies) ||
      body.dependencies.length > maximumDependencies ||
      !body.dependencies.every(
        (dependency) =>
          typeof dependency === "string" &&
          dependency.length > 0 &&
          dependency.length <= 214,
      ) ||
      new Set(body.dependencies).size !== body.dependencies.length
    ) {
      return null;
    }

    return {
      outputType: "code",
      code: body.code,
      dependencies: [...body.dependencies],
    };
  }

  return null;
}

export function validateOutput(
  request: OutputValidationRequest,
  policy: OutputValidationPolicy,
): OutputValidationResult {
  const errors: string[] = [];

  if (request.outputType === "json") {
    const schema = policy.schemas.get(request.schemaId);
    if (!schema) {
      errors.push("UNKNOWN_SCHEMA");
    } else if (!schema.validate(request.output)) {
      errors.push("SCHEMA_VALIDATION_FAILED");
    }
  } else {
    if (request.code.length > policy.codeValidation.maximumCodeLength) {
      errors.push("CODE_TOO_LARGE");
    } else if (
      policy.codeValidation.forbiddenPatterns.some((pattern) =>
        pattern.test(request.code),
      )
    ) {
      errors.push("FORBIDDEN_CODE_PATTERN");
    }

    if (
      request.dependencies.some(
        (dependency) =>
          !policy.codeValidation.allowedDependencies.has(dependency),
      )
    ) {
      errors.push("DEPENDENCY_NOT_ALLOWED");
    }
  }

  const valid = errors.length === 0;
  return {
    valid,
    decision: valid ? "ALLOW" : "BLOCK",
    safe: valid,
    errors,
  };
}
