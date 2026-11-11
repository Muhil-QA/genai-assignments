import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import {
  detectSelfHarmFixture,
  loadSelfHarmPolicy,
} from "../src/middleware/self-harm-detector";

const signingSecret = Buffer.from(
  "phase-26-test-secret-with-at-least-32-bytes",
);
const policy = loadSelfHarmPolicy();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(role = "moderation.tester") {
  return new SignJWT({ sub: "phase-26-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function detect(content: string, role = "moderation.tester") {
  const token = await createToken(role);
  return request(app)
    .post("/api/v1/detect/self-harm")
    .set("Authorization", `Bearer ${token}`)
    .send({ content });
}

test("returns the configured supportive response signal for the synthetic fixture", async () => {
  const fixture = "TEST_FIXTURE_SELF_HARM_INTENT";
  const response = await detect(fixture);

  assert.equal(response.status, 200);
  assert.equal(response.body.decision, "SAFE_RESPONSE");
  assert.equal(response.body.safe, true);
  assert.equal(response.body.evaluationStatus, "FIXTURE_MATCH");
  assert.equal(response.body.responseTemplate, "SELF_HARM_SUPPORT_V1");
  assert.equal(response.body.category, "SELF_HARM");
  assert.equal(response.body.ruleId, "SELF-HARM-SYNTHETIC-FIXTURE-001");
  assert.equal(response.body.policyVersion, policy.version);
  assert.equal(JSON.stringify(response.body).includes(fixture), false);
});

test("does not claim to evaluate non-fixture content", async () => {
  const response = await detect("ordinary neutral content");

  assert.equal(response.status, 200);
  assert.equal(response.body.decision, "WARN");
  assert.equal(response.body.safe, false);
  assert.equal(response.body.evaluationStatus, "NOT_EVALUATED");
  assert.equal(response.body.responseTemplate, undefined);
  assert.equal(response.body.category, undefined);
  assert.equal(response.body.ruleId, undefined);
});

test("matches the synthetic fixture case-insensitively with surrounding whitespace", () => {
  const result = detectSelfHarmFixture(
    "  test_fixture_self_harm_intent  ",
    policy,
  );

  assert.equal(result.decision, "SAFE_RESPONSE");
  assert.equal(result.safe, true);
  assert.equal(result.responseTemplate, "SELF_HARM_SUPPORT_V1");
});

test("does not match partial fixture strings", () => {
  const result = detectSelfHarmFixture(
    "TEST_FIXTURE_SELF_HARM_INTENT additional text",
    policy,
  );

  assert.equal(result.decision, "WARN");
  assert.equal(result.evaluationStatus, "NOT_EVALUATED");
});

test("requires diagnostic role and rejects malformed request bodies", async () => {
  const forbidden = await detect(
    "TEST_FIXTURE_SELF_HARM_INTENT",
    "moderation.user",
  );
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "FORBIDDEN");

  const token = await createToken();
  const malformed = await request(app)
    .post("/api/v1/detect/self-harm")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "routine", extra: true });

  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, "INVALID_REQUEST");
});
