import assert from "node:assert/strict";
import express from "express";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import { loadSecretRules } from "../src/middleware/secret-detector";
import {
  createResourceGuards,
  getTokenEncoding,
  loadResourceLimits,
} from "../src/middleware/resource-limits";

const signingSecret = Buffer.from(
  "phase-06-test-secret-with-at-least-32-bytes",
);
const baseLimits = loadResourceLimits();

async function createToken(
  role: "moderation.user" | "moderation.tester",
  subject = "phase-06-test-client",
) {
  return new SignJWT({ sub: subject, roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

function createTestApp(limits = baseLimits) {
  return createApp(
    { status: "READY", policyVersion: "1.0.0" },
    { mode: "local", secret: signingSecret },
    loadSecretRules(),
    limits,
  );
}

test("loads Phase 06 thresholds from versioned resource configuration", () => {
  assert.equal(baseLimits.version, "1.0.0");
  assert.equal(baseLimits.requestBodyLimitBytes, 65_536);
  assert.equal(baseLimits.rateLimit.requests, 60);
  assert.equal(baseLimits.rateLimit.windowMs, 60_000);
  assert.equal(baseLimits.rateLimit.identity, "applicationId");
  assert.equal(baseLimits.tokenLimit.encoding, "cl100k_base");
  assert.equal(baseLimits.tokenLimit.maxInputTokens, 20_000);
  assert.equal(baseLimits.requestTimeoutMs, 30_000);
  assert.equal(baseLimits.maxConcurrentRequests, 20);
});

test("counts real cl100k_base tokens and accepts exactly the configured boundary", async () => {
  const limits = {
    ...baseLimits,
    tokenLimit: { ...baseLimits.tokenLimit, maxInputTokens: 2 },
  };
  const encoding = getTokenEncoding(limits);
  assert.equal(encoding.encode("hello world").length, 2);

  const token = await createToken("moderation.tester");
  const response = await request(createTestApp(limits))
    .post("/api/v1/validate/tokens")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "hello world" });

  assert.equal(response.status, 200);
  assert.equal(response.body.tokenCount, 2);
  assert.equal(response.body.maxInputTokens, 2);
  assert.equal(response.body.valid, true);
  assert.equal(response.body.recommendedAction, "ALLOW");
});

test("blocks content above the configured token limit", async () => {
  const limits = {
    ...baseLimits,
    tokenLimit: { ...baseLimits.tokenLimit, maxInputTokens: 2 },
  };
  const token = await createToken("moderation.tester");
  const response = await request(createTestApp(limits))
    .post("/api/v1/validate/tokens")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "hello world today" });

  assert.equal(response.status, 413);
  assert.equal(response.body.valid, false);
  assert.equal(response.body.recommendedAction, "BLOCK");
  assert.equal(response.body.maxInputTokens, 2);
  assert.ok(response.body.tokenCount > 2);
  assert.equal("content" in response.body, false);
});

test("requires tester authorization for token diagnostics", async () => {
  const token = await createToken("moderation.user");
  const response = await request(createTestApp())
    .post("/api/v1/validate/tokens")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "hello world" });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "FORBIDDEN");
});

test("rejects request bodies that exceed the configured byte limit", async () => {
  const limits = { ...baseLimits, requestBodyLimitBytes: 128 };
  const token = await createToken("moderation.tester");
  const response = await request(createTestApp(limits))
    .post("/api/v1/validate/tokens")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "a".repeat(256) });

  assert.equal(response.status, 413);
  assert.equal(response.body.error, "PAYLOAD_TOO_LARGE");
  assert.equal(JSON.stringify(response.body).includes("aaaa"), false);
});

test("rate limits requests by authenticated client and application", async () => {
  const limits = {
    ...baseLimits,
    rateLimit: { ...baseLimits.rateLimit, requests: 2 },
  };
  const app = createTestApp(limits);
  const token = await createToken("moderation.user");
  const send = (applicationId: string) =>
    request(app)
      .post("/api/v1/moderate")
      .set("Authorization", `Bearer ${token}`)
      .send({ content: "Request content", applicationId });

  assert.equal((await send("app-one")).status, 200);
  assert.equal((await send("app-one")).status, 200);

  const limited = await send("app-one");
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error, "RATE_LIMIT_EXCEEDED");
  assert.ok(limited.headers["retry-after"]);

  const otherApplication = await send("app-two");
  assert.equal(otherApplication.status, 200);
  assert.equal(otherApplication.body.decision, "ALLOW");
});

test("limits the number of concurrent requests", async () => {
  const limits = {
    ...baseLimits,
    maxConcurrentRequests: 1,
  };
  const guards = createResourceGuards(limits);
  const app = express();
  app.use((_req, res, next) => {
    res.locals.requestId = "concurrency-test";
    next();
  });
  app.get("/slow", guards.concurrency, (_req, res) => {
    setTimeout(() => {
      if (!res.headersSent) {
        res.status(200).end();
      }
    }, 75);
  });

  const firstRequest = request(app).get("/slow").then((response) => response);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const secondResponse = await request(app).get("/slow");
  const firstResponse = await firstRequest;

  assert.equal(firstResponse.status, 200);
  assert.equal(secondResponse.status, 503);
  assert.equal(secondResponse.body.error, "SERVICE_BUSY");
});

test("returns a timeout response when request work exceeds its budget", async () => {
  const limits = { ...baseLimits, requestTimeoutMs: 10 };
  const guards = createResourceGuards(limits);
  const app = express();
  app.use((_req, res, next) => {
    res.locals.requestId = "timeout-test";
    next();
  });
  app.get("/slow", guards.timeout, (_req, res) => {
    setTimeout(() => {
      if (!res.headersSent) {
        res.status(200).end();
      }
    }, 50);
  });

  const response = await request(app).get("/slow");
  assert.equal(response.status, 408);
  assert.equal(response.body.error, "REQUEST_TIMEOUT");
});
