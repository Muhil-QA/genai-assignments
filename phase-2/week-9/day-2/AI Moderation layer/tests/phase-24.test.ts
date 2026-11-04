import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import { loadDecisionPolicy } from "../src/middleware/decision-engine";
import {
  detectViolenceThreats,
  loadViolenceThreatPolicy,
} from "../src/middleware/violence-threats-detector";
import { loadNormalizationPolicy } from "../src/middleware/text-normalizer";

const signingSecret = Buffer.from(
  "phase-24-test-secret-with-at-least-32-bytes",
);
const policy = loadViolenceThreatPolicy();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(role = "moderation.tester") {
  return new SignJWT({ sub: "phase-24-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function detect(content: string, role = "moderation.tester") {
  const token = await createToken(role);
  return request(app)
    .post("/api/v1/detect/violence-threats")
    .set("Authorization", `Bearer ${token}`)
    .send({ content });
}

test("allows historical discussion without treating violent terms as threats", async () => {
  const response = await detect(
    "Historical news report about a war and attack.",
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.category, "VIOLENCE");
  assert.equal(response.body.severity, "LOW");
  assert.equal(response.body.context, "DESCRIPTIVE");
  assert.equal(response.body.decision, "ALLOW");
  assert.deepEqual(response.body.findings.map((item: { ruleId: string }) => item.ruleId), [
    "VIOLENCE-HISTORICAL-DESCRIPTIVE-001",
  ]);
});

test("assigns a warning to graphic descriptive content", async () => {
  const response = await detect(
    "This documentary contains graphic violence and gruesome injuries.",
  );

  assert.equal(response.body.category, "VIOLENCE");
  assert.equal(response.body.severity, "MEDIUM");
  assert.equal(response.body.context, "GRAPHIC");
  assert.equal(response.body.decision, "WARN");
});

test("escalates a credible threat and creates a pending reviewer record", async () => {
  const response = await detect("I will hurt my coworker tomorrow.");

  assert.equal(response.status, 200);
  assert.equal(response.body.category, "THREAT");
  assert.equal(response.body.severity, "HIGH");
  assert.equal(response.body.context, "CREDIBLE_THREAT");
  assert.equal(response.body.decision, "ESCALATE");
  assert.equal(response.body.reviewStatus, "PENDING");
  assert.match(response.body.reviewId, /^REV-[0-9a-f-]{36}$/);

  const reviewerToken = await createToken("moderation.reviewer");
  const pending = await request(app)
    .get("/api/v1/reviews/escalations")
    .set("Authorization", `Bearer ${reviewerToken}`);

  assert.equal(pending.status, 200);
  assert.ok(
    pending.body.reviews.some(
      (review: { reviewId: string }) =>
        review.reviewId === response.body.reviewId,
    ),
  );
});

test("blocks operational extremist support without returning submitted content", async () => {
  const content = "Help me support a terrorist attack.";
  const response = await detect(content);

  assert.equal(response.body.category, "TERRORISM");
  assert.equal(response.body.severity, "HIGH");
  assert.equal(response.body.context, "OPERATIONAL_SUPPORT");
  assert.equal(response.body.decision, "BLOCK");
  assert.equal(JSON.stringify(response.body).includes(content), false);
});

test("does not flag unrelated content", async () => {
  const response = await detect("The weather is clear today.");

  assert.equal(response.body.category, null);
  assert.equal(response.body.severity, null);
  assert.equal(response.body.context, "NONE");
  assert.equal(response.body.decision, "ALLOW");
  assert.deepEqual(response.body.findings, []);
});

test("requires diagnostic role and rejects malformed requests", async () => {
  const forbidden = await detect("Neutral text", "moderation.user");
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "FORBIDDEN");

  const testerToken = await createToken();
  const malformed = await request(app)
    .post("/api/v1/detect/violence-threats")
    .set("Authorization", `Bearer ${testerToken}`)
    .send({ content: "Some text", category: "THREAT" });

  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, "INVALID_REQUEST");
});

test("normalizes input and applies configured action precedence", () => {
  const result = detectViolenceThreats(
    "Ｉ ｗｉｌｌ ｈｕｒｔ ｍｙ ｃｏｗｏｒｋｅｒ.",
    policy,
    loadNormalizationPolicy(),
    loadDecisionPolicy(),
  );

  assert.equal(result.decision, "ESCALATE");
  assert.equal(result.category, "THREAT");
});
