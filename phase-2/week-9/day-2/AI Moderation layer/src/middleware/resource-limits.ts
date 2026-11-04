import { readFileSync } from "node:fs";
import path from "node:path";
import { RequestHandler } from "express";
import YAML from "yaml";
import { getEncoding, Tiktoken } from "js-tiktoken";

export interface ResourceLimits {
  version: string;
  requestBodyLimitBytes: number;
  rateLimit: {
    requests: number;
    windowMs: number;
    identity: "applicationId";
    maximumTrackedKeys: number;
  };
  tokenLimit: {
    encoding: "cl100k_base";
    maxInputTokens: number;
  };
  requestTimeoutMs: number;
  maxConcurrentRequests: number;
  fileUpload: {
    maximumFileSizeBytes: number;
    maximumFiles: 1;
  };
}

interface RateLimitBucket {
  count: number;
  expiresAt: number;
}

export function loadResourceLimits(
  filePath = path.resolve(
    process.cwd(),
    process.env.RESOURCE_LIMITS_PATH ?? "config/resource-limits.yaml",
  ),
): ResourceLimits {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Resource limits could not be loaded from "${filePath}".`,
      { cause: error },
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Resource limits configuration must be an object.");
  }

  const config = parsed as Partial<ResourceLimits>;
  const validPositiveInteger = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0;

  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    !validPositiveInteger(config.requestBodyLimitBytes) ||
    !validPositiveInteger(config.requestTimeoutMs) ||
    !validPositiveInteger(config.maxConcurrentRequests) ||
    !config.fileUpload ||
    !validPositiveInteger(config.fileUpload.maximumFileSizeBytes) ||
    config.fileUpload.maximumFiles !== 1 ||
    !config.rateLimit ||
    !validPositiveInteger(config.rateLimit.requests) ||
    !validPositiveInteger(config.rateLimit.windowMs) ||
    !validPositiveInteger(config.rateLimit.maximumTrackedKeys) ||
    config.rateLimit.identity !== "applicationId" ||
    !config.tokenLimit ||
    config.tokenLimit.encoding !== "cl100k_base" ||
    !validPositiveInteger(config.tokenLimit.maxInputTokens)
  ) {
    throw new Error("Resource limits configuration contains invalid values.");
  }

  return config as ResourceLimits;
}

export function countInputTokens(content: string, encoding: Tiktoken): number {
  return encoding.encode(content).length;
}

export function createResourceGuards(limits: ResourceLimits): {
  rateLimit: RequestHandler;
  concurrency: RequestHandler;
  timeout: RequestHandler;
} {
  const buckets = new Map<string, RateLimitBucket>();
  let activeRequests = 0;

  const rateLimit: RequestHandler = (req, res, next) => {
    const principal = res.locals.principal as { subject?: unknown } | undefined;
    const subject =
      typeof principal?.subject === "string" ? principal.subject : null;
    if (!subject) {
      res.status(401).json({
        requestId: res.locals.requestId,
        error: "UNAUTHENTICATED",
      });
      return;
    }

    const applicationId =
      typeof req.body?.applicationId === "string"
        ? req.body.applicationId
        : null;
    const key = applicationId
      ? `${subject}:application:${applicationId}`
      : `${subject}:client`;
    const now = Date.now();

    for (const [bucketKey, bucket] of buckets) {
      if (bucket.expiresAt <= now) {
        buckets.delete(bucketKey);
      }
    }

    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= limits.rateLimit.maximumTrackedKeys) {
        res.status(429).json({
          requestId: res.locals.requestId,
          error: "RATE_LIMIT_EXCEEDED",
        });
        return;
      }
      bucket = { count: 0, expiresAt: now + limits.rateLimit.windowMs };
      buckets.set(key, bucket);
    }

    if (bucket.count >= limits.rateLimit.requests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.expiresAt - now) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("RateLimit-Limit", String(limits.rateLimit.requests));
      res.setHeader("RateLimit-Remaining", "0");
      res.status(429).json({
        requestId: res.locals.requestId,
        error: "RATE_LIMIT_EXCEEDED",
      });
      return;
    }

    bucket.count += 1;
    res.setHeader("RateLimit-Limit", String(limits.rateLimit.requests));
    res.setHeader(
      "RateLimit-Remaining",
      String(limits.rateLimit.requests - bucket.count),
    );
    next();
  };

  const concurrency: RequestHandler = (_req, res, next) => {
    if (activeRequests >= limits.maxConcurrentRequests) {
      res.status(503).json({
        requestId: res.locals.requestId,
        error: "SERVICE_BUSY",
      });
      return;
    }

    activeRequests += 1;
    let released = false;
    const release = () => {
      if (released) {
        return;
      }
      released = true;
      activeRequests -= 1;
    };

    res.once("finish", release);
    res.once("close", release);
    next();
  };

  const timeout: RequestHandler = (_req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent && !res.destroyed) {
        res.status(408).json({
          requestId: res.locals.requestId,
          error: "REQUEST_TIMEOUT",
        });
      }
    }, limits.requestTimeoutMs);

    timer.unref();
    res.once("finish", () => clearTimeout(timer));
    res.once("close", () => clearTimeout(timer));
    next();
  };

  return { rateLimit, concurrency, timeout };
}

export function getTokenEncoding(limits: ResourceLimits): Tiktoken {
  return getEncoding(limits.tokenLimit.encoding);
}
