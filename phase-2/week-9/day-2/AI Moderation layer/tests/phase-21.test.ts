import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import {
  detectContentSafety,
  loadContentSafetyPolicy,
} from "../src/middleware/content-safety-detector";
import { loadDecisionPolicy } from "../src/middleware/decision-engine";
import { loadNormalizationPolicy } from "../src/middleware/text-normalizer";

const signingSecret = Buffer.from(
  "phase-21-test-secret-with-at-least-32-bytes",
);
const policy = loadContentSafetyPolicy();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(role = "moderation.tester") {
  return new SignJWT({ sub: "phase-21-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function detect(content: string, role = "moderation.tester") {
  const token = await createToken(role);
  return request(app)
    .post("/api/v1/detect/content-safety")
    .set("Authorization", `Bearer ${token}`)
    .send({ content });
}

test("classifies directly targeted abusive language as harassment", async () => {
  const response = await detect("You are a worthless person.");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.categories, [
    { name: "HARASSMENT", severity: "MEDIUM" },
  ]);
  assert.equal(response.body.recommendedAction, "SAFE_RESPONSE");
  assert.equal(response.body.context, "STANDARD");
  assert.deepEqual(response.body.findings, [
    {
      category: "HARASSMENT",
      ruleId: "CONTENT-SAFETY-HARASSMENT-001",
      severity: "MEDIUM",
    },
  ]);
  assert.equal(response.body.policyVersion, policy.version);
});

test("downgrades quoted harassment in explicit analysis context to WARN", async () => {
  const response = await detect(
    'Analyze this quote: "You are a worthless person."',
  );

  assert.equal(response.body.context, "ANALYSIS");
  assert.deepEqual(response.body.categories, [
    { name: "HARASSMENT", severity: "MEDIUM" },
  ]);
  assert.equal(response.body.recommendedAction, "WARN");
});

test("maps protected-group hate indicators to SAFE_RESPONSE", async () => {
  const response = await detect(
    "All members of a protected group are inferior.",
  );

  assert.equal(response.body.recommendedAction, "SAFE_RESPONSE");
  assert.deepEqual(response.body.categories, [
    { name: "HATE", severity: "HIGH" },
  ]);
  assert.deepEqual(response.body.findings, [
    {
      category: "HATE",
      ruleId: "CONTENT-SAFETY-HATE-001",
      severity: "HIGH",
    },
  ]);
});

test("does not flag benign identity discussion", async () => {
  const response = await detect("I am proud to be a Muslim woman.");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.categories, []);
  assert.equal(response.body.recommendedAction, "ALLOW");
  assert.deepEqual(response.body.findings, []);
});

test("blocks explicit threat signals and never echoes submitted text", async () => {
  const content = "I will hurt you.";
  const response = await detect(content);

  assert.equal(response.body.recommendedAction, "BLOCK");
  assert.deepEqual(response.body.categories, [
    { name: "THREAT", severity: "HIGH" },
  ]);
  assert.equal(JSON.stringify(response.body).includes(content), false);
});

test("applies NFKC normalization before evaluating content-safety rules", () => {
  const result = detectContentSafety(
    "Ｙｏｕ ａｒｅ ａ ｗｏｒｔｈｌｅｓｓ ｐｅｒｓｏｎ.",
    policy,
    loadNormalizationPolicy(),
    loadDecisionPolicy(),
  );

  assert.equal(result.recommendedAction, "SAFE_RESPONSE");
  assert.equal(result.categories[0].name, "HARASSMENT");
});

test("rejects malformed requests and requires moderation.tester", async () => {
  const token = await createToken();
  const malformed = await request(app)
    .post("/api/v1/detect/content-safety")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "Test", extra: true });

  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, "INVALID_REQUEST");

  const userResponse = await detect("neutral content", "moderation.user");
  assert.equal(userResponse.status, 403);
  assert.equal(userResponse.body.error, "FORBIDDEN");
});
