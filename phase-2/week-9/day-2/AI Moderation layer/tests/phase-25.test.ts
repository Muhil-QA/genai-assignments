import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import {
  createChildSafetySecurityEvent,
  detectSexualSafety,
  loadSexualSafetyPolicy,
} from "../src/middleware/sexual-safety-detector";

const signingSecret = Buffer.from(
  "phase-25-test-secret-with-at-least-32-bytes",
);
const policy = loadSexualSafetyPolicy();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(role = "moderation.tester") {
  return new SignJWT({ sub: "phase-25-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function detect(content: string, role = "moderation.tester") {
  const token = await createToken(role);
  return request(app)
    .post("/api/v1/detect/sexual-safety")
    .set("Authorization", `Bearer ${token}`)
    .send({ content });
}

test("blocks only the synthetic child-safety fixture without echoing it", async () => {
  const fixture = "TEST_FIXTURE_CHILD_SAFETY_CATEGORY";
  const response = await detect(fixture);

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.categories, [
    { name: "CHILD_SAFETY", severity: "CRITICAL" },
  ]);
  assert.equal(response.body.adultContent.status, "NOT_EVALUATED");
  assert.equal(response.body.adultContent.recommendedAction, "WARN");
  assert.equal(response.body.decision, "BLOCK");
  assert.equal(response.body.securityEventId.startsWith("SEC-"), true);
  assert.deepEqual(response.body.findings, [
    {
      category: "CHILD_SAFETY",
      severity: "CRITICAL",
      ruleId: "CHILD-SAFETY-SYNTHETIC-FIXTURE-001",
      decision: "BLOCK",
    },
  ]);
  assert.equal(JSON.stringify(response.body).includes(fixture), false);
});

test("does not interpret ordinary text as the synthetic fixture", async () => {
  const response = await detect("This is an ordinary safety test.");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.categories, []);
  assert.equal(response.body.adultContent.status, "NOT_EVALUATED");
  assert.equal(response.body.adultContent.recommendedAction, "WARN");
  assert.equal(response.body.decision, "WARN");
  assert.equal(response.body.securityEventId, undefined);
  assert.deepEqual(response.body.findings, []);
});

test("does not classify case/whitespace variants as a fixture unless exact after trim", async () => {
  const exactTrimmedFixture = await detect(
    "  test_fixture_child_safety_category  ",
  );
  assert.equal(exactTrimmedFixture.body.decision, "BLOCK");
  assert.ok(exactTrimmedFixture.body.securityEventId);

  const partialFixture = await detect(
    "TEST_FIXTURE_CHILD_SAFETY_CATEGORY additional text",
  );
  assert.equal(partialFixture.body.decision, "WARN");
  assert.equal(partialFixture.body.securityEventId, undefined);
});

test("emits a structured security event without raw fixture text", () => {
  const events: Array<Record<string, unknown>> = [];
  const fixture = policy.childSafety.fixture;
  const eventId = createChildSafetySecurityEvent(
    "phase-25-test-request",
    policy.childSafety.ruleId,
    {
      warn: (event) => events.push(event),
    },
  );

  assert.match(eventId, /^SEC-[0-9a-f-]{36}$/);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "child_safety_security_event");
  assert.equal(events[0].eventId, eventId);
  assert.equal(events[0].requestId, "phase-25-test-request");
  assert.equal(events[0].category, "CHILD_SAFETY");
  assert.equal(events[0].ruleId, policy.childSafety.ruleId);
  assert.equal(events[0].decision, "BLOCK");
  assert.equal(JSON.stringify(events[0]).includes(fixture), false);
});

test("returns only NOT_EVALUATED for adult content rather than guessing", () => {
  const result = detectSexualSafety("routine test text", policy);

  assert.deepEqual(result, {
    categories: [],
    adultContent: {
      status: "NOT_EVALUATED",
      recommendedAction: "WARN",
    },
    decision: "WARN",
    findings: [],
  });
});

test("requires diagnostic role and rejects malformed request bodies", async () => {
  const forbidden = await detect(
    "TEST_FIXTURE_CHILD_SAFETY_CATEGORY",
    "moderation.user",
  );
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "FORBIDDEN");

  const token = await createToken();
  const malformed = await request(app)
    .post("/api/v1/detect/sexual-safety")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "routine", extra: true });

  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, "INVALID_REQUEST");
});
