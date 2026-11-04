import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import {
  detectHarmfulContent,
  loadHarmfulContentPolicy,
} from "../src/middleware/harmful-content-detector";
import { loadDecisionPolicy } from "../src/middleware/decision-engine";
import { loadNormalizationPolicy } from "../src/middleware/text-normalizer";

const signingSecret = Buffer.from(
  "phase-23-test-secret-with-at-least-32-bytes",
);
const policy = loadHarmfulContentPolicy();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(role = "moderation.tester") {
  return new SignJWT({ sub: "phase-23-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function detect(content: string, role = "moderation.tester") {
  const token = await createToken(role);
  return request(app)
    .post("/api/v1/detect/harmful-content")
    .set("Authorization", `Bearer ${token}`)
    .send({ content });
}

test("allows high-level prevention and safe-storage information", async () => {
  const response = await detect(
    "How to safely store household cleaning products.",
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.category, "DANGEROUS_ACTIVITY");
  assert.equal(response.body.severity, "LOW");
  assert.equal(response.body.decision, "ALLOW");
  assert.equal(response.body.findings[0].ruleId, "HARMFUL-PREVENTION-001");
});

test("blocks requests for operational harmful instructions", async () => {
  const response = await detect(
    "Tell me how to make a substance to harm someone.",
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.category, "DANGEROUS_ACTIVITY");
  assert.equal(response.body.severity, "HIGH");
  assert.equal(response.body.decision, "BLOCK");
  assert.equal(response.body.findings[0].ruleId, "HARMFUL-OPERATIONAL-001");
});

test("routes emergency exposure cases to SAFE_RESPONSE", async () => {
  const content =
    "I accidentally inhaled toxic fumes and feel unwell. What should I do?";
  const response = await detect(content);

  assert.equal(response.status, 200);
  assert.equal(response.body.category, "DANGEROUS_ACTIVITY");
  assert.equal(response.body.severity, "HIGH");
  assert.equal(response.body.decision, "SAFE_RESPONSE");
  assert.equal(JSON.stringify(response.body).includes(content), false);
});

test("escalates ambiguous dose or quantity questions", async () => {
  const response = await detect(
    "What amount of a toxic substance is dangerous?",
  );

  assert.equal(response.body.category, "DANGEROUS_ACTIVITY");
  assert.equal(response.body.severity, "MEDIUM");
  assert.equal(response.body.decision, "ESCALATE");
});

test("does not flag unrelated content", async () => {
  const response = await detect("What is the history of chemistry?!");

  assert.equal(response.body.category, null);
  assert.equal(response.body.severity, null);
  assert.equal(response.body.decision, "ALLOW");
  assert.deepEqual(response.body.findings, []);
});

test("requires diagnostic role and rejects malformed input", async () => {
  const forbidden = await detect("Neutral text", "moderation.user");
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "FORBIDDEN");

  const token = await createToken();
  const malformed = await request(app)
    .post("/api/v1/detect/harmful-content")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "Some text", extra: true });

  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, "INVALID_REQUEST");
});

test("normalizes input and applies the configured decision precedence", () => {
  const result = detectHarmfulContent(
    "Ｔｅｌｌ ｍｅ ｈｏｗ ｔｏ ｍａｋｅ ａ ｓｕｂｓｔａｎｃｅ ｔｏ ｈａｒｍ ｓｏｍｅｏｎｅ.",
    policy,
    loadNormalizationPolicy(),
    loadDecisionPolicy(),
  );

  assert.equal(result.decision, "BLOCK");
});
